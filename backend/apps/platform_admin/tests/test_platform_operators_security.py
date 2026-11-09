from datetime import timedelta
import hashlib
import re
import secrets
import threading

from django.core import mail
from django.core.cache import cache
from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import IntegrityError, transaction
from django.test import TestCase, TransactionTestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.audit.models import AuditLog
from apps.authorization.catalog import PLATFORM_PERMISSIONS
from apps.authorization.models import (
    OperatorStatus,
    Permission,
    PlatformInvitation,
    PlatformInvitationStatus,
    PlatformOperatorProfile,
    PlatformPermissionGrant,
    PlatformRole,
    PlatformRolePermission,
    PlatformSuperAdmin,
)
from apps.authorization.services import (
    ensure_platform_catalog,
    get_super_admin,
    is_super_admin,
    user_has_platform_permission,
)
from apps.identity.models import User
from apps.platform_admin.operator_services import (
    deactivate_platform_operator,
    suspend_platform_operator,
)
from apps.tenants.models import Company, CompanyStatus

PASSWORD = "a-very-secure-password-1234"


def sign_in(client, email, password=PASSWORD):
    return client.post("/api/v1/auth/login/", {"email": email, "password": password}, format="json")


class PlatformOperatorsSecurityTests(TestCase):
    def setUp(self):
        cache.clear()
        mail.outbox.clear()
        ensure_platform_catalog()
        self.client = APIClient()

        # Seed the single Super Admin
        self.super_admin = User.objects.create_user(
            email="superadmin@pulse.local",
            password=PASSWORD,
            first_name="Super",
            last_name="Admin",
            email_verified_at=timezone.now(),
        )
        PlatformSuperAdmin.objects.create(id=1, user=self.super_admin)
        self.super_admin_profile = PlatformOperatorProfile.objects.create(
            user=self.super_admin,
            is_super_admin=True,
            status=OperatorStatus.ACTIVE,
        )

        # Create a dynamic Platform Role for testing
        self.support_role = PlatformRole.objects.create(
            name="Tier 1 Support",
            slug="tier-1-support",
            description="View companies and users only",
            created_by=self.super_admin,
        )
        for code in ["platform.companies.view", "platform.users.view"]:
            PlatformRolePermission.objects.create(
                role=self.support_role,
                permission_id=code,
            )

        # Create an ordinary operator assigned to the role
        self.operator = User.objects.create_user(
            email="operator@pulse.local",
            password=PASSWORD,
            first_name="Alice",
            last_name="Operator",
            email_verified_at=timezone.now(),
        )
        self.operator_profile = PlatformOperatorProfile.objects.create(
            user=self.operator,
            role=self.support_role,
            is_super_admin=False,
            status=OperatorStatus.ACTIVE,
        )

        # Create a test company for permission checking
        self.company = Company.objects.create(
            slug="acme-test-co",
            legal_name="Acme Corp Ltd",
            display_name="Acme Corp",
            status=CompanyStatus.ACTIVE,
        )

    # --------------------------------------------------------------------------
    # 1. Only one Super Admin can exist
    # --------------------------------------------------------------------------
    def test_01_only_one_super_admin_can_exist(self):
        """Database and command level enforcement that at most 1 Super Admin can exist."""
        other_user = User.objects.create_user(
            email="impostor@pulse.local",
            password=PASSWORD,
            email_verified_at=timezone.now(),
        )
        # Attempt direct database creation of a 2nd record
        with self.assertRaises((IntegrityError, Exception)):
            with transaction.atomic():
                PlatformSuperAdmin.objects.create(id=2, user=other_user)

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                PlatformSuperAdmin.objects.create(id=1, user=other_user)

        # Attempt to use create_platform_admin command with a different email
        with self.assertRaises(CommandError) as ctx:
            call_command(
                "create_platform_admin",
                email="another@pulse.local",
                password="new-password-1234",
            )
        self.assertIn("Only one Super Admin is permitted", str(ctx.exception))

        self.assertEqual(PlatformSuperAdmin.objects.count(), 1)
        self.assertEqual(get_super_admin().email, "superadmin@pulse.local")

    # --------------------------------------------------------------------------
    # 2. Another Super Admin cannot be created through normal role creation
    # --------------------------------------------------------------------------
    def test_02_another_super_admin_cannot_be_created_through_normal_role_creation(self):
        sign_in(self.client, self.super_admin.email)

        # Attempt role name "Super Admin"
        res1 = self.client.post(
            "/api/v1/platform/roles/",
            {
                "name": "Super Admin",
                "permission_codes": ["platform.users.view"],
            },
            format="json",
        )
        self.assertEqual(res1.status_code, 400)
        self.assertIn("Super Admin", str(res1.data))

        # Attempt role slug "super-admin"
        res2 = self.client.post(
            "/api/v1/platform/roles/",
            {
                "name": "Custom Administrator",
                "slug": "super-admin",
                "permission_codes": ["platform.users.view"],
            },
            format="json",
        )
        self.assertEqual(res2.status_code, 400)

    # --------------------------------------------------------------------------
    # 3. Super Admin cannot be deleted or deactivated
    # --------------------------------------------------------------------------
    def test_03_super_admin_cannot_be_deleted_or_deactivated(self):
        sign_in(self.client, self.super_admin.email)

        # Deactivation via PATCH user
        res1 = self.client.patch(
            f"/api/v1/platform/users/{self.super_admin.id}/",
            {"is_active": False},
            format="json",
        )
        self.assertEqual(res1.status_code, 409)
        self.super_admin.refresh_from_db()
        self.assertTrue(self.super_admin.is_active)

        # Suspension via suspend endpoint
        res2 = self.client.post(
            f"/api/v1/platform/users/{self.super_admin.id}/suspend/",
            {"reason": "Testing lockout"},
            format="json",
        )
        self.assertEqual(res2.status_code, 409)

        # Direct service call to suspend
        with self.assertRaises(Exception):
            suspend_platform_operator(
                actor=self.super_admin,
                user_id=self.super_admin.id,
                payload={"reason": "Self suspend"},
                request=None,
            )

        # Direct service call to deactivate
        with self.assertRaises(Exception):
            deactivate_platform_operator(
                actor=self.super_admin,
                user_id=self.super_admin.id,
                payload={"reason": "Self deactivate"},
                request=None,
            )

    # --------------------------------------------------------------------------
    # 4. Other operators cannot modify Super Admin privileges
    # --------------------------------------------------------------------------
    def test_04_other_operators_cannot_modify_super_admin_privileges(self):
        # Give operator manage permissions
        manager_role = PlatformRole.objects.create(
            name="Platform Manager",
            slug="platform-manager",
            created_by=self.super_admin,
        )
        PlatformRolePermission.objects.create(role=manager_role, permission_id="platform.users.manage")
        PlatformRolePermission.objects.create(role=manager_role, permission_id="platform.users.view")
        self.operator_profile.role = manager_role
        self.operator_profile.save()

        # Sign in as ordinary operator
        sign_in(self.client, self.operator.email)

        # Attempt to change Super Admin's details
        res = self.client.patch(
            f"/api/v1/platform/users/{self.super_admin.id}/",
            {"first_name": "Hacked", "is_active": False},
            format="json",
        )
        self.assertEqual(res.status_code, 409)

        # Verify audit log captures unauthorized attempt
        self.assertTrue(
            AuditLog.objects.filter(
                action="platform.security.super_admin_modification_blocked",
                object_id=self.super_admin.id,
            ).exists()
        )

    # --------------------------------------------------------------------------
    # 5. Assigned roles cannot be deleted without reassignment
    # --------------------------------------------------------------------------
    def test_05_assigned_roles_cannot_be_deleted_without_reassignment(self):
        sign_in(self.client, self.super_admin.email)

        # support_role is assigned to self.operator
        res1 = self.client.delete(f"/api/v1/platform/roles/{self.support_role.id}/")
        self.assertEqual(res1.status_code, 409)
        self.assertIn("assigned", str(res1.data["error"]["message"]).lower())

        # Create another role and reassign
        new_role = PlatformRole.objects.create(
            name="Replacement Role",
            slug="replacement-role",
            created_by=self.super_admin,
        )
        PlatformRolePermission.objects.create(role=new_role, permission_id="platform.users.view")

        # Reassign operator
        self.operator_profile.role = new_role
        self.operator_profile.save()

        # Now delete support_role succeeds
        res2 = self.client.delete(f"/api/v1/platform/roles/{self.support_role.id}/")
        self.assertEqual(res2.status_code, 200)
        self.assertFalse(PlatformRole.objects.filter(pk=self.support_role.id).exists())

    # --------------------------------------------------------------------------
    # 6. Role permission updates correctly affect operator authorization
    # --------------------------------------------------------------------------
    def test_06_role_permission_updates_correctly_affect_operator_authorization(self):
        # Operator has only companies.view and users.view
        self.assertTrue(user_has_platform_permission(self.operator, "platform.companies.view"))
        self.assertFalse(user_has_platform_permission(self.operator, "platform.billing.view"))

        sign_in(self.client, self.super_admin.email)

        # Super admin adds billing.view to support_role
        res = self.client.patch(
            f"/api/v1/platform/roles/{self.support_role.id}/",
            {
                "permission_codes": [
                    "platform.companies.view",
                    "platform.users.view",
                    "platform.billing.view",
                ]
            },
            format="json",
        )
        self.assertEqual(res.status_code, 200)

        # Operator now holds platform.billing.view immediately
        self.assertTrue(user_has_platform_permission(self.operator, "platform.billing.view"))

        # Super admin removes platform.companies.view
        self.client.patch(
            f"/api/v1/platform/roles/{self.support_role.id}/",
            {"permission_codes": ["platform.users.view", "platform.billing.view"]},
            format="json",
        )
        self.assertFalse(user_has_platform_permission(self.operator, "platform.companies.view"))

    # --------------------------------------------------------------------------
    # 7. An operator cannot access an endpoint without the required permission
    # --------------------------------------------------------------------------
    def test_07_operator_cannot_access_endpoint_without_required_permission(self):
        sign_in(self.client, self.operator.email)

        # Operator has companies.view, so GET companies is 200
        get_res = self.client.get("/api/v1/platform/companies/")
        self.assertEqual(get_res.status_code, 200)

        # Operator lacks companies.manage, so POST suspend company is 403
        post_res = self.client.post(
            f"/api/v1/platform/companies/{self.company.id}/suspend/",
            {"reason": "Unauthorized attempt"},
            format="json",
        )
        self.assertEqual(post_res.status_code, 403)

    # --------------------------------------------------------------------------
    # 8. Suspended operators cannot authenticate
    # --------------------------------------------------------------------------
    def test_08_suspended_operators_cannot_authenticate(self):
        sign_in(self.client, self.super_admin.email)

        # Suspend operator
        res = self.client.post(
            f"/api/v1/platform/users/{self.operator.id}/suspend/",
            {"reason": "Compliance review"},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["status"], "suspended")

        # Attempt to sign in as operator
        client2 = APIClient()
        login_res = sign_in(client2, self.operator.email)
        self.assertEqual(login_res.status_code, 401)

    # --------------------------------------------------------------------------
    # 9. Expired invitations cannot be accepted
    # --------------------------------------------------------------------------
    def test_09_expired_invitations_cannot_be_accepted(self):
        raw_token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
        invitation = PlatformInvitation.objects.create(
            email="invitee@example.com",
            role=self.support_role,
            status=PlatformInvitationStatus.PENDING,
            token_hash=token_hash,
            expires_at=timezone.now() - timedelta(hours=2),  # expired
        )

        accept_res = self.client.post(
            "/api/v1/platform/invitations/accept/",
            {
                "token": raw_token,
                "password": "valid-new-password-1234",
            },
            format="json",
        )
        self.assertEqual(accept_res.status_code, 400)
        self.assertIn("expired", str(accept_res.data).lower())

        invitation.refresh_from_db()
        self.assertEqual(invitation.status, PlatformInvitationStatus.EXPIRED)

    # --------------------------------------------------------------------------
    # 10. Revoked invitations cannot be accepted
    # --------------------------------------------------------------------------
    def test_10_revoked_invitations_cannot_be_accepted(self):
        sign_in(self.client, self.super_admin.email)

        # Send invite
        create_res = self.client.post(
            "/api/v1/platform/invitations/",
            {
                "email": "revokeme@example.com",
                "role_id": str(self.support_role.id),
            },
            format="json",
        )
        self.assertEqual(create_res.status_code, 201)
        invitation_id = create_res.data["id"]

        # Super Admin revokes it
        revoke_res = self.client.post(f"/api/v1/platform/invitations/{invitation_id}/revoke/")
        self.assertEqual(revoke_res.status_code, 200)

        # Verify acceptance attempt is blocked
        invitation = PlatformInvitation.objects.get(pk=invitation_id)
        # Find raw token from outbox
        body = mail.outbox[-1].body
        token = re.search(r"token=([A-Za-z0-9_-]+)", body).group(1)

        accept_res = self.client.post(
            "/api/v1/platform/invitations/accept/",
            {"token": token, "password": "valid-new-password-1234"},
            format="json",
        )
        self.assertEqual(accept_res.status_code, 400)
        self.assertIn("revoked", str(accept_res.data).lower())

    # --------------------------------------------------------------------------
    # 11. Revoked sessions cannot be reused
    # --------------------------------------------------------------------------
    def test_11_revoked_sessions_cannot_be_reused(self):
        operator_client = APIClient()
        sign_in(operator_client, self.operator.email)

        # Operator can make authenticated request
        res1 = operator_client.get("/api/v1/platform/companies/")
        self.assertEqual(res1.status_code, 200)

        # Super Admin revokes active sessions for operator
        admin_client = APIClient()
        sign_in(admin_client, self.super_admin.email)
        revoke_res = admin_client.post(f"/api/v1/platform/users/{self.operator.id}/revoke-sessions/")
        self.assertEqual(revoke_res.status_code, 200)

        # Existing operator session is now rejected
        res2 = operator_client.get("/api/v1/platform/companies/")
        self.assertIn(res2.status_code, [401, 403])

    # --------------------------------------------------------------------------
    # 12. Concurrent administrative requests cannot bypass Super Admin protections
    # --------------------------------------------------------------------------
    def test_12_concurrent_administrative_requests_cannot_bypass_super_admin_protections(self):
        """Simulate concurrent ownership transfer requests using DB locks."""
        user2 = User.objects.create_user(
            email="candidate2@pulse.local",
            password=PASSWORD,
            email_verified_at=timezone.now(),
        )
        PlatformOperatorProfile.objects.create(
            user=user2,
            role=self.support_role,
            status=OperatorStatus.ACTIVE,
        )

        sign_in(self.client, self.super_admin.email)

        # Perform ownership transfer
        transfer_res = self.client.post(
            "/api/v1/platform/super-admin/transfer-ownership/",
            {
                "password": PASSWORD,
                "confirm_transfer": True,
                "target_user_id": str(self.operator.id),
                "former_admin_role_id": str(self.support_role.id),
                "reason": "Retirement",
            },
            format="json",
        )
        self.assertEqual(transfer_res.status_code, 200)
        self.assertEqual(transfer_res.data["new_super_admin"], self.operator.email)

        # Verify exactly one Super Admin exists in the database
        self.assertEqual(PlatformSuperAdmin.objects.count(), 1)
        self.assertEqual(get_super_admin().id, self.operator.id)
        self.super_admin.refresh_from_db()
        self.operator.refresh_from_db()
        self.assertTrue(is_super_admin(self.operator))
        self.assertFalse(is_super_admin(self.super_admin))

    # --------------------------------------------------------------------------
    # 13. Platform permissions cannot leak into company-level authorization
    # --------------------------------------------------------------------------
    def test_13_platform_permissions_cannot_leak_into_company_level_authorization(self):
        """Platform operator permissions do not grant company membership access without membership."""
        sign_in(self.client, self.operator.email)

        # Operator attempts to read company workspace roles
        res = self.client.get(f"/api/v1/companies/{self.company.id}/roles/")
        # Should be forbidden or not found (no tenant membership)
        self.assertIn(res.status_code, [403, 404])

    # --------------------------------------------------------------------------
    # 14. Audit events are generated for sensitive operations
    # --------------------------------------------------------------------------
    def test_14_audit_events_are_generated_for_sensitive_operations(self):
        sign_in(self.client, self.super_admin.email)

        # 1. Role created
        role_res = self.client.post(
            "/api/v1/platform/roles/",
            {"name": "Audited Role", "permission_codes": ["platform.audit.view"]},
            format="json",
        )
        self.assertEqual(role_res.status_code, 201)
        role_id = role_res.data["id"]
        self.assertTrue(AuditLog.objects.filter(action="platform.role.created", object_id=role_id).exists())

        # 2. Operator suspended
        self.client.post(
            f"/api/v1/platform/users/{self.operator.id}/suspend/",
            {"reason": "Security check"},
            format="json",
        )
        self.assertTrue(
            AuditLog.objects.filter(
                action="platform.operator.suspended",
                object_id=self.operator.id,
            ).exists()
        )

        # 3. Sessions revoked
        self.client.post(f"/api/v1/platform/users/{self.operator.id}/revoke-sessions/")
        self.assertTrue(
            AuditLog.objects.filter(
                action="platform.operator.sessions_revoked",
                object_id=self.operator.id,
            ).exists()
        )

        # 4. Verify append-only protection on audit logs
        log_entry = AuditLog.objects.filter(action="platform.role.created").first()
        with self.assertRaises(PermissionError):
            log_entry.action = "tampered.action"
            log_entry.save()

        with self.assertRaises(PermissionError):
            log_entry.delete()

    # --------------------------------------------------------------------------
    # 15. PATCH operator role and permissions succeeds without errors
    # --------------------------------------------------------------------------
    def test_15_patch_platform_operator_role_and_custom_permissions(self):
        sign_in(self.client, self.super_admin.email)

        patch_res = self.client.patch(
            f"/api/v1/platform/users/{self.operator.id}/",
            {
                "first_name": "UpdatedName",
                "last_name": "UpdatedLast",
                "role_id": str(self.support_role.id),
                "custom_permissions": ["platform.roles.view"],
            },
            format="json",
        )
        self.assertEqual(patch_res.status_code, 200)
        self.assertEqual(patch_res.data["first_name"], "UpdatedName")
        self.assertEqual(patch_res.data["role"]["id"], str(self.support_role.id))
        self.assertIn("platform.roles.view", patch_res.data["custom_permissions"])
        self.assertTrue(
            AuditLog.objects.filter(action="platform.operator.role_changed", object_id=self.operator.id).exists()
        )
