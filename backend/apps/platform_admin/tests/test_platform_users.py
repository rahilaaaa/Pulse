import re

from django.core import mail
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from apps.audit.models import AuditLog
from apps.authorization.models import Permission, PlatformPermissionGrant
from apps.authorization.services import MANAGE_CODE, ensure_platform_catalog, platform_permission_codes
from apps.identity.models import PasswordResetToken, User

PASSWORD = "a-long-passphrase"


def sign_in(client, email, password=PASSWORD):
    return client.post("/api/v1/auth/login/", {"email": email, "password": password}, format="json")


def grant(user, *codes):
    ensure_platform_catalog()
    for code in codes:
        PlatformPermissionGrant.objects.get_or_create(
            user=user,
            permission=Permission.objects.get(code=code),
        )


class PlatformOperatorAdminTests(TestCase):
    def setUp(self):
        cache.clear()
        mail.outbox.clear()
        ensure_platform_catalog()
        self.client = APIClient()
        self.manager = User.objects.create_user(
            email="manager@example.com",
            password=PASSWORD,
            first_name="Mana",
            last_name="Ger",
        )
        grant(
            self.manager,
            "platform.users.view",
            MANAGE_CODE,
            "platform.companies.view",
        )
        self.viewer = User.objects.create_user(email="viewer@example.com", password=PASSWORD)
        grant(self.viewer, "platform.users.view")
        sign_in(self.client, self.manager.email)

    def test_create_operator_assigns_grants_and_sends_invite_email(self):
        response = self.client.post(
            "/api/v1/platform/users/",
            {
                "email": "New.Op@Example.com",
                "first_name": "New",
                "last_name": "Op",
                "permission_codes": ["platform.users.view", "platform.audit.view"],
                "send_invite": True,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["email"], "new.op@example.com")
        self.assertTrue(response.data["created"])
        self.assertTrue(response.data["invite_sent"])
        self.assertEqual(
            set(response.data["permission_codes"]),
            {"platform.users.view", "platform.audit.view"},
        )
        self.assertNotIn("token", response.data)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("Set up your Pulse platform operator", mail.outbox[0].subject)
        self.assertRegex(mail.outbox[0].body, r"token=\S+")
        user = User.objects.get(email="new.op@example.com")
        self.assertFalse(user.has_usable_password())
        self.assertEqual(PasswordResetToken.objects.filter(user=user, used_at=None).count(), 1)
        self.assertTrue(
            AuditLog.objects.filter(action="platform.user.created", object_id=user.id).exists()
        )
        self.assertTrue(
            AuditLog.objects.filter(action="platform.grant.changed", object_id=user.id).exists()
        )

    def test_viewer_cannot_create_or_patch_or_reset(self):
        client = APIClient()
        sign_in(client, self.viewer.email)
        create = client.post(
            "/api/v1/platform/users/",
            {"email": "x@example.com", "permission_codes": ["platform.users.view"]},
            format="json",
        )
        self.assertEqual(create.status_code, 403)
        patch = client.patch(
            f"/api/v1/platform/users/{self.manager.id}/",
            {"first_name": "Nope"},
            format="json",
        )
        self.assertEqual(patch.status_code, 403)
        reset = client.post(f"/api/v1/platform/users/{self.manager.id}/send-password-reset/")
        self.assertEqual(reset.status_code, 403)
        listing = client.get("/api/v1/platform/users/")
        self.assertEqual(listing.status_code, 200)
        catalog = client.get("/api/v1/platform/permissions/")
        self.assertEqual(catalog.status_code, 200)
        self.assertTrue(any(row["code"] == MANAGE_CODE for row in catalog.data["results"]))

    def test_patch_grants_is_audited_and_last_manager_is_protected(self):
        other = User.objects.create_user(email="other@example.com", password=PASSWORD)
        grant(other, "platform.users.view", MANAGE_CODE)

        response = self.client.patch(
            f"/api/v1/platform/users/{other.id}/",
            {"permission_codes": ["platform.users.view", "platform.audit.view"]},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.data["permission_codes"]), {"platform.users.view", "platform.audit.view"})
        self.assertTrue(
            AuditLog.objects.filter(action="platform.grant.changed", object_id=other.id).exists()
        )

        # Only self remains with manage — cannot strip it.
        blocked = self.client.patch(
            f"/api/v1/platform/users/{self.manager.id}/",
            {"permission_codes": ["platform.users.view"]},
            format="json",
        )
        self.assertEqual(blocked.status_code, 409)
        self.assertEqual(blocked.data["error"]["code"], "conflict")
        self.assertIn(MANAGE_CODE, platform_permission_codes(self.manager))

        # Cannot deactivate the sole remaining manager.
        deactivate = self.client.patch(
            f"/api/v1/platform/users/{self.manager.id}/",
            {"is_active": False},
            format="json",
        )
        self.assertEqual(deactivate.status_code, 409)

    def test_send_password_reset_issues_token_without_leaking_it(self):
        target = User.objects.create_user(email="resetme@example.com", password=PASSWORD)
        grant(target, "platform.users.view")
        response = self.client.post(f"/api/v1/platform/users/{target.id}/send-password-reset/")
        self.assertEqual(response.status_code, 202)
        self.assertEqual(response.data, None)
        self.assertEqual(len(mail.outbox), 1)
        body = mail.outbox[0].body
        match = re.search(r"token=(\S+)", body)
        self.assertIsNotNone(match)
        raw = match.group(1)
        # Response and JSON must not echo the raw token; only the email contains it.
        self.assertNotIn(raw, str(response.content))
        self.assertEqual(PasswordResetToken.objects.filter(user=target, used_at=None).count(), 1)
        self.assertTrue(
            AuditLog.objects.filter(
                action="platform.user.password_reset_sent", object_id=target.id
            ).exists()
        )

    def test_user_detail_includes_permission_codes(self):
        response = self.client.get(f"/api/v1/platform/users/{self.manager.id}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["email"], self.manager.email)
        self.assertIn(MANAGE_CODE, response.data["permission_codes"])
        self.assertIn("memberships", response.data)

    def test_cannot_deactivate_self(self):
        response = self.client.patch(
            f"/api/v1/platform/users/{self.manager.id}/",
            {"is_active": False},
            format="json",
        )
        # Sole manager also blocked by last-manager; either conflict is fine.
        self.assertEqual(response.status_code, 409)
