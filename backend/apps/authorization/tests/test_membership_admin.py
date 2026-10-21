import hashlib
import json
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.audit.models import AuditLog
from apps.authorization.company import bootstrap_company_access
from apps.authorization.models import CompanyRole, CompanyRolePermission, MembershipRoleAssignment
from apps.billing.models import BillingPlan, BillingPlanPrice, Subscription, SubscriptionStatus
from apps.hrms.models import LeavePolicy, LeaveRequest
from apps.identity.models import User
from apps.modules_registry.models import CompanyModuleInstallation, InstallationStatus
from apps.organization.models import Person
from apps.tenants.models import Company, CompanyMembership, CompanyStatus, InvitationStatus, MembershipInvitation, MembershipStatus

PASSWORD = "a-long-passphrase"


class MembershipAdminTests(TestCase):
    def setUp(self):
        self.owner, self.company = self._open_company("northwind", "owner@example.com")
        self.admin, self.admin_membership = self._member(self.company, "admin@example.com", "administrator", self.owner)
        self.staff, self.staff_membership = self._member(self.company, "staff@example.com", "employee", self.owner)
        self.owner_role = CompanyRole.objects.get(company=self.company, is_owner_role=True)
        self.employee_role = CompanyRole.objects.get(company=self.company, template_code="employee")
        self.hr_role = CompanyRole.objects.get(company=self.company, template_code="hr_manager")

    def test_administrator_cannot_grant_the_owner_role(self):
        client = self._client(self.admin)
        before = self._assigned_role_ids(self.admin_membership)
        response = client.put(
            self._roles_url(self.company, self.admin_membership),
            {"role_ids": [str(self.owner_role.id)]},
            format="json",
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["error"]["code"], "permission_denied")
        self.assertEqual(self._assigned_role_ids(self.admin_membership), before)
        self.assertFalse(AuditLog.objects.filter(action="membership.roles_changed").exists())

        other = client.put(
            self._roles_url(self.company, self.staff_membership),
            {"role_ids": [str(self.owner_role.id), str(self.employee_role.id)]},
            format="json",
        )
        self.assertEqual(other.status_code, 403)
        self.assertEqual(self._assigned_role_ids(self.staff_membership), {self.employee_role.id})

    def test_owner_can_grant_and_cannot_remove_the_last_owner(self):
        client = self._client(self.owner)
        owner_membership = CompanyMembership.objects.get(company=self.company, user=self.owner)
        blocked = client.put(
            self._roles_url(self.company, owner_membership),
            {"role_ids": [str(self.employee_role.id)]},
            format="json",
        )
        self.assertEqual(blocked.status_code, 409)
        self.assertEqual(blocked.data["error"]["code"], "conflict")
        self.assertIn(self.owner_role.id, self._assigned_role_ids(owner_membership))
        self.assertFalse(AuditLog.objects.filter(action="membership.roles_changed", object_id=owner_membership.id).exists())

        granted = client.put(
            self._roles_url(self.company, self.admin_membership),
            {"role_ids": [str(self.owner_role.id)]},
            format="json",
        )
        self.assertEqual(granted.status_code, 200)
        self.assertEqual(set(granted.data["role_ids"]), {str(self.owner_role.id)})
        grant_audit = AuditLog.objects.get(action="membership.roles_changed", object_id=self.admin_membership.id)
        administrator_id = str(CompanyRole.objects.get(company=self.company, template_code="administrator").id)
        self.assertEqual(grant_audit.before["role_ids"], [administrator_id])
        self.assertEqual(grant_audit.after["role_ids"], [str(self.owner_role.id)])
        self.assertEqual(grant_audit.actor_id, self.owner.id)

        demoted = client.put(
            self._roles_url(self.company, owner_membership),
            {"role_ids": [str(self.employee_role.id)]},
            format="json",
        )
        self.assertEqual(demoted.status_code, 200, demoted.data)
        last = self._client(self.admin).put(
            self._roles_url(self.company, self.admin_membership),
            {"role_ids": [str(self.employee_role.id)]},
            format="json",
        )
        self.assertEqual(last.status_code, 409)
        self.assertIn(self.owner_role.id, self._assigned_role_ids(self.admin_membership))
        self.assertEqual(AuditLog.objects.filter(action="membership.roles_changed", object_id=self.admin_membership.id).count(), 1)

    def test_unchanged_role_assignment_is_not_audited_again(self):
        client = self._client(self.admin)
        first = client.put(
            self._roles_url(self.company, self.staff_membership),
            {"role_ids": [str(self.hr_role.id)]},
            format="json",
        )
        self.assertEqual(first.status_code, 200)
        second = client.put(
            self._roles_url(self.company, self.staff_membership),
            {"role_ids": [str(self.hr_role.id)]},
            format="json",
        )
        self.assertEqual(second.status_code, 200)
        self.assertEqual(AuditLog.objects.filter(action="membership.roles_changed", object_id=self.staff_membership.id).count(), 1)

    def test_cross_company_role_and_membership_are_rejected(self):
        _other_owner, other = self._open_company("other-co", "other-owner@example.com")
        foreign_role = CompanyRole.objects.get(company=other, template_code="employee")
        foreign_membership = CompanyMembership.objects.get(company=other, user=_other_owner)
        client = self._client(self.admin)
        wrong_role = client.put(
            self._roles_url(self.company, self.staff_membership),
            {"role_ids": [str(foreign_role.id)]},
            format="json",
        )
        self.assertEqual(wrong_role.status_code, 404)
        wrong_membership = client.put(
            self._roles_url(self.company, foreign_membership),
            {"role_ids": [str(self.employee_role.id)]},
            format="json",
        )
        self.assertEqual(wrong_membership.status_code, 404)
        stranger = client.post(
            self._status_url(other, foreign_membership),
            {"status": "suspended"},
            format="json",
        )
        self.assertEqual(stranger.status_code, 404)
        self.assertFalse(AuditLog.objects.filter(action="membership.roles_changed").exists())
        self.assertFalse(AuditLog.objects.filter(action="membership.status_changed").exists())

    def test_membership_update_cannot_remove_and_remove_cannot_skip_the_last_owner(self):
        editor, editor_membership = self._member(self.company, "editor@example.com", None, self.owner)
        limited = CompanyRole.objects.create(company=self.company, name="Membership editor", is_system=False)
        CompanyRolePermission.objects.create(role=limited, permission_id="membership.update")
        MembershipRoleAssignment.objects.create(membership=editor_membership, role=limited, assigned_by=self.owner)
        client = self._client(editor)

        removed = client.post(self._status_url(self.company, self.staff_membership), {"status": "removed"}, format="json")
        self.assertEqual(removed.status_code, 403)
        self.staff_membership.refresh_from_db()
        self.assertEqual(self.staff_membership.status, MembershipStatus.ACTIVE)
        self.assertFalse(AuditLog.objects.filter(action="membership.status_changed").exists())

        suspended = client.post(self._status_url(self.company, self.staff_membership), {"status": "suspended"}, format="json")
        self.assertEqual(suspended.status_code, 200)
        self.assertEqual(suspended.data["status"], "suspended")
        status_audit = AuditLog.objects.get(action="membership.status_changed", object_id=self.staff_membership.id)
        self.assertEqual(status_audit.before, {"status": "active"})
        self.assertEqual(status_audit.after, {"status": "suspended"})

        reactivated = client.post(self._status_url(self.company, self.staff_membership), {"status": "active"}, format="json")
        self.assertEqual(reactivated.status_code, 200)

        owner_client = self._client(self.owner)
        owner_membership = CompanyMembership.objects.get(company=self.company, user=self.owner)
        denied = owner_client.post(self._status_url(self.company, owner_membership), {"status": "removed"}, format="json")
        self.assertEqual(denied.status_code, 409)
        owner_membership.refresh_from_db()
        self.assertEqual(owner_membership.status, MembershipStatus.ACTIVE)

        removed_staff = owner_client.post(self._status_url(self.company, self.staff_membership), {"status": "removed"}, format="json")
        self.assertEqual(removed_staff.status_code, 200)
        self.staff_membership.refresh_from_db()
        self.assertEqual(self.staff_membership.status, MembershipStatus.REMOVED)
        self.assertIsNotNone(self.staff_membership.removed_at)

    def test_role_permission_changes_are_audited_and_unsafe_permissions_are_rejected(self):
        client = self._client(self.owner)
        changed = client.patch(
            f"/api/v1/companies/{self.company.id}/roles/{self.employee_role.id}/",
            {"permissions": ["company.view"]},
            format="json",
        )
        self.assertEqual(changed.status_code, 200)
        audit = AuditLog.objects.get(action="role.permissions_changed", object_id=self.employee_role.id)
        self.assertIn("company.view", audit.after["permissions"])
        self.assertNotEqual(audit.before["permissions"], audit.after["permissions"])
        self.assertEqual(AuditLog.objects.filter(action="role.permissions_changed", object_id=self.employee_role.id).count(), 1)

        platform = client.patch(
            f"/api/v1/companies/{self.company.id}/roles/{self.employee_role.id}/",
            {"permissions": ["company.view", "platform.billing.view"]},
            format="json",
        )
        self.assertEqual(platform.status_code, 409)
        self.assertEqual(AuditLog.objects.filter(action="role.permissions_changed", object_id=self.employee_role.id).count(), 1)

        owner_codes = [code for code in self.owner_role.permissions.values_list("permission_id", flat=True) if code != "company.update"]
        floor = client.patch(
            f"/api/v1/companies/{self.company.id}/roles/{self.owner_role.id}/",
            {"permissions": owner_codes},
            format="json",
        )
        self.assertEqual(floor.status_code, 409)
        self.assertFalse(AuditLog.objects.filter(action="role.permissions_changed", object_id=self.owner_role.id).exists())

        denied = self._client(self.admin).patch(
            f"/api/v1/companies/{self.company.id}/roles/{self.owner_role.id}/",
            {"permissions": ["company.view"], "description": "Should not be saved."},
            format="json",
        )
        self.assertEqual(denied.status_code, 403)
        self.assertEqual(denied.data["error"]["code"], "permission_denied")
        self.owner_role.refresh_from_db()
        self.assertNotEqual(self.owner_role.description, "Should not be saved.")
        self.assertFalse(AuditLog.objects.filter(action="role.permissions_changed", object_id=self.owner_role.id).exists())
        self.assertIn("company.update", set(self.owner_role.permissions.values_list("permission_id", flat=True)))

    def test_non_owner_cannot_update_an_owner_role_and_duplication_is_ordinary(self):
        original = self.owner_role.description
        denied = self._client(self.admin).patch(
            f"/api/v1/companies/{self.company.id}/roles/{self.owner_role.id}/",
            {"description": "Changed by an administrator"},
            format="json",
        )
        self.assertEqual(denied.status_code, 403)
        self.assertEqual(denied.data["error"]["code"], "permission_denied")
        self.owner_role.refresh_from_db()
        self.assertEqual(self.owner_role.description, original)
        self.assertFalse(AuditLog.objects.filter(object_id=self.owner_role.id, action="role.permissions_changed").exists())

        renamed = self._client(self.admin).patch(
            f"/api/v1/companies/{self.company.id}/roles/{self.owner_role.id}/",
            {"name": "Super owner"},
            format="json",
        )
        self.assertEqual(renamed.status_code, 403)
        self.owner_role.refresh_from_db()
        self.assertNotEqual(self.owner_role.name, "Super owner")

        owner_update = self._client(self.owner).patch(
            f"/api/v1/companies/{self.company.id}/roles/{self.owner_role.id}/",
            {"description": "Owner wording"},
            format="json",
        )
        self.assertEqual(owner_update.status_code, 200)
        self.owner_role.refresh_from_db()
        self.assertEqual(self.owner_role.description, "Owner wording")

        copied = self._client(self.admin).post(
            f"/api/v1/companies/{self.company.id}/roles/{self.owner_role.id}/duplicate/",
            {},
            format="json",
        )
        self.assertEqual(copied.status_code, 201)
        self.assertFalse(copied.data["is_owner_role"])
        self.assertFalse(copied.data["is_system"])
        self.assertEqual(copied.data["template_code"], "")
        copy = CompanyRole.objects.get(pk=copied.data["id"])
        self.assertFalse(copy.is_owner_role)
        self.assertFalse(copy.is_system)
        self.assertEqual(copy.template_code, "")
        self.assertNotEqual(copy.id, self.owner_role.id)

    def test_invitation_revocation_and_acceptance_are_audited_without_the_token(self):
        client = self._client(self.owner)
        created = client.post(
            f"/api/v1/companies/{self.company.id}/invitations/",
            {"email": "invitee@example.com"},
            format="json",
        )
        self.assertEqual(created.status_code, 201)
        revoked = client.post(
            f"/api/v1/companies/{self.company.id}/invitations/{created.data['id']}/revoke/",
            {},
            format="json",
        )
        self.assertEqual(revoked.status_code, 200)
        revoke_audit = AuditLog.objects.get(action="membership.invitation_revoked")
        blob = json.dumps({"before": revoke_audit.before, "after": revoke_audit.after})
        self.assertNotIn("token", blob)
        self.assertEqual(revoke_audit.after["email"], "invitee@example.com")
        self.assertEqual(revoke_audit.after["status"], "revoked")

        raw = "plain-invitation-token"
        invitation = MembershipInvitation.objects.create(
            company=self.company,
            email="join@example.com",
            token_hash=hashlib.sha256(raw.encode("utf-8")).hexdigest(),
            invited_by=self.owner,
            expires_at=timezone.now() + timedelta(days=2),
            status=InvitationStatus.PENDING,
        )
        joiner = User.objects.create_user(email="join@example.com", password=PASSWORD)
        joiner.email_verified_at = timezone.now()
        joiner.save(update_fields=["email_verified_at", "updated_at"])
        stranger = User.objects.create_user(email="stranger@example.com", password=PASSWORD)
        stranger.email_verified_at = timezone.now()
        stranger.save(update_fields=["email_verified_at", "updated_at"])
        wrong = self._client(stranger)
        denied = wrong.post("/api/v1/invitations/accept/", {"token": raw}, format="json")
        self.assertEqual(denied.status_code, 403)
        self.assertFalse(AuditLog.objects.filter(action="membership.invitation_accepted").exists())

        accepted = self._client(joiner).post("/api/v1/invitations/accept/", {"token": raw}, format="json")
        self.assertEqual(accepted.status_code, 200)
        accept_audit = AuditLog.objects.get(action="membership.invitation_accepted", object_id=invitation.id)
        recorded = json.dumps({"before": accept_audit.before, "after": accept_audit.after})
        self.assertNotIn(raw, recorded)
        self.assertNotIn(invitation.token_hash, recorded)
        self.assertEqual(accept_audit.after["status"], "accepted")
        self.assertEqual(AuditLog.objects.filter(action="membership.invitation_accepted").count(), 1)

    def test_leave_decisions_are_audited_once(self):
        CompanyModuleInstallation.objects.create(
            company=self.company,
            module_id="hrms",
            status=InstallationStatus.INSTALLED,
            installed_version="2.4.0",
        )
        policy = LeavePolicy.objects.create(company=self.company, name="Annual leave", days_per_year=12)
        person = Person.objects.get(memberships__user=self.owner)
        leave = LeaveRequest.objects.create(
            company=self.company,
            person=person,
            policy=policy,
            starts_on="2026-11-02",
            ends_on="2026-11-03",
        )
        employee_client = self._client(self.staff)
        forbidden = employee_client.post(
            f"/api/v1/companies/{self.company.id}/hrms/leave-requests/{leave.id}/decision/",
            {"status": "approved"},
            format="json",
        )
        self.assertEqual(forbidden.status_code, 403)
        self.assertFalse(AuditLog.objects.filter(action="hrms.leave.decided").exists())

        approved = self._client(self.owner).post(
            f"/api/v1/companies/{self.company.id}/hrms/leave-requests/{leave.id}/decision/",
            {"status": "approved"},
            format="json",
        )
        self.assertEqual(approved.status_code, 200)
        audit = AuditLog.objects.get(action="hrms.leave.decided", object_id=leave.id)
        self.assertEqual(audit.before, {"status": "pending"})
        self.assertEqual(audit.after, {"status": "approved"})
        self.assertEqual(audit.actor_id, self.owner.id)

        rejected = self._client(self.owner).post(
            f"/api/v1/companies/{self.company.id}/hrms/leave-requests/{leave.id}/decision/",
            {"status": "rejected"},
            format="json",
        )
        self.assertEqual(rejected.status_code, 200)
        self.assertEqual(AuditLog.objects.filter(action="hrms.leave.decided", object_id=leave.id).count(), 2)
        self.assertEqual(AuditLog.objects.filter(action="hrms.leave.decided").latest("created_at").after["status"], "rejected")

    def _open_company(self, slug: str, email: str):
        owner = User.objects.create_user(email=email, password=PASSWORD, first_name="Ada", last_name="Owner")
        owner.email_verified_at = timezone.now()
        owner.save(update_fields=["email_verified_at", "updated_at"])
        company = Company.objects.create(
            slug=slug,
            legal_name=slug,
            display_name=slug,
            status=CompanyStatus.ACTIVE,
            created_by=owner,
        )
        CompanyMembership.objects.create(
            company=company,
            user=owner,
            status=MembershipStatus.ACTIVE,
            joined_at=timezone.now(),
        )
        bootstrap_company_access(company, owner)
        plan = BillingPlan.objects.get(code="growth")
        price = BillingPlanPrice.objects.filter(plan=plan, billing_interval="year", currency="INR").order_by("-effective_from").first()
        Subscription.objects.create(
            company=company,
            plan=plan,
            plan_price=price,
            billing_interval="year",
            currency="INR",
            status=SubscriptionStatus.TRIALING,
            provider="pulse",
        )
        return owner, company

    def _member(self, company, email: str, template_code: str | None, actor):
        user = User.objects.create_user(email=email, password=PASSWORD, first_name="Sam", last_name="Member")
        user.email_verified_at = timezone.now()
        user.save(update_fields=["email_verified_at", "updated_at"])
        membership = CompanyMembership.objects.create(
            company=company,
            user=user,
            status=MembershipStatus.ACTIVE,
            joined_at=timezone.now(),
        )
        if template_code:
            role = CompanyRole.objects.get(company=company, template_code=template_code)
            MembershipRoleAssignment.objects.create(membership=membership, role=role, assigned_by=actor)
        return user, membership

    def _client(self, user):
        client = APIClient()
        client.force_login(user)
        return client

    def _roles_url(self, company, membership):
        return f"/api/v1/companies/{company.id}/memberships/{membership.id}/roles/"

    def _status_url(self, company, membership):
        return f"/api/v1/companies/{company.id}/memberships/{membership.id}/status/"

    def _assigned_role_ids(self, membership):
        return set(MembershipRoleAssignment.objects.filter(membership=membership).values_list("role_id", flat=True))
