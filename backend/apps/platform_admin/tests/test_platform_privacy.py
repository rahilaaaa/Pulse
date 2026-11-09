from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from django.utils.crypto import get_random_string
from rest_framework.test import APIClient

from apps.authorization.company import bootstrap_company_access
from apps.authorization.models import Permission, PlatformPermissionGrant
from apps.authorization.services import ensure_platform_catalog
from apps.identity.models import User
from apps.tenants.models import (
    Company,
    CompanyMembership,
    CompanyStatus,
    InvitationStatus,
    MembershipInvitation,
    MembershipStatus,
)

PASSWORD = "test-platform-pass"


def grant(user, *codes):
    ensure_platform_catalog()
    for code in codes:
        PlatformPermissionGrant.objects.get_or_create(
            user=user,
            permission=Permission.objects.get(code=code),
        )


class PlatformPrivacyProtectionTests(TestCase):
    def setUp(self):
        cache.clear()
        ensure_platform_catalog()
        self.client = APIClient()
        self.operator = User.objects.create_user(
            email="operator@pulse.test",
            password=PASSWORD,
            first_name="Platform",
            last_name="Admin",
        )
        grant(
            self.operator,
            "platform.companies.view",
            "platform.users.view",
        )
        self.client.post("/api/v1/auth/login/", {"email": self.operator.email, "password": PASSWORD}, format="json")

        self.company = Company.objects.create(
            display_name="Confidential Medical Systems",
            legal_name="Confidential Medical Systems Ltd",
            slug="confidential-med",
            status=CompanyStatus.ACTIVE,
        )

        # Create Company Members (with private names, emails, roles)
        self.owner = User.objects.create_user(
            email="private.owner@medical.test",
            password=PASSWORD,
            first_name="Dr. Confidential",
            last_name="Director",
        )
        CompanyMembership.objects.create(
            company=self.company,
            user=self.owner,
            status=MembershipStatus.ACTIVE,
        )
        bootstrap_company_access(self.company, self.owner)

        self.employee = User.objects.create_user(
            email="secret.nurse@medical.test",
            password=PASSWORD,
            first_name="Florence",
            last_name="Nightingale",
        )
        CompanyMembership.objects.create(
            company=self.company,
            user=self.employee,
            status=MembershipStatus.ACTIVE,
        )

        # Create a pending invitation
        MembershipInvitation.objects.create(
            company=self.company,
            email="invited.surgeon@medical.test",
            token_hash=get_random_string(64),
            status=InvitationStatus.PENDING,
            invited_by=self.owner,
            expires_at=timezone.now() + timezone.timedelta(days=7),
        )

    def test_company_detail_never_exposes_raw_employee_records(self):
        """
        Verify that GET /api/v1/platform/companies/<id>/ strictly adheres to the
        tenant privacy boundary by delivering aggregate numbers only and NEVER
        exposing employee names, email addresses, or individual membership objects.
        """
        response = self.client.get(f"/api/v1/platform/companies/{self.company.id}/")
        self.assertEqual(response.status_code, 200)
        data = response.json()

        # 1. Verify that 'member_summary' aggregate counts exist
        self.assertIn("member_summary", data)
        summary = data["member_summary"]
        self.assertEqual(summary["total_members"], 2)
        self.assertEqual(summary["active_members"], 2)
        self.assertEqual(summary["owners_count"], 1)
        self.assertEqual(summary["pending_invitations"], 1)

        # 2. Assert that the raw 'members' list is completely absent
        self.assertNotIn("members", data)
        self.assertNotIn("employees", data)
        self.assertNotIn("people", data)

        # 3. String-scan the entire serialized payload to guarantee zero leak of employee PII
        payload_text = str(data)
        self.assertNotIn("private.owner@medical.test", payload_text)
        self.assertNotIn("secret.nurse@medical.test", payload_text)
        self.assertNotIn("Florence", payload_text)
        self.assertNotIn("Nightingale", payload_text)
        self.assertNotIn("invited.surgeon@medical.test", payload_text)
