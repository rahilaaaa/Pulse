from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from apps.audit.models import AuditLog
from apps.authorization.models import Permission, PlatformPermissionGrant
from apps.authorization.services import ensure_platform_catalog
from apps.identity.models import User
from apps.tenants.models import Company, CompanyStatus

PASSWORD = "test-platform-pass"


def grant(user, *codes):
    ensure_platform_catalog()
    for code in codes:
        PlatformPermissionGrant.objects.get_or_create(
            user=user,
            permission=Permission.objects.get(code=code),
        )


class PlatformCompanyLifecycleTests(TestCase):
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
            "platform.companies.manage",
            "platform.audit.view",
        )
        self.client.post("/api/v1/auth/login/", {"email": self.operator.email, "password": PASSWORD}, format="json")

        self.company = Company.objects.create(
            display_name="Alpha Corp",
            legal_name="Alpha Corp Ltd",
            slug="alpha-corp",
            status=CompanyStatus.DRAFT,
            timezone="UTC",
        )

    def test_activate_company(self):
        response = self.client.post(f"/api/v1/platform/companies/{self.company.id}/activate/")
        self.assertEqual(response.status_code, 200)
        self.company.refresh_from_db()
        self.assertEqual(self.company.status, CompanyStatus.ACTIVE)

        audit = AuditLog.objects.filter(action="company.activated", company=self.company).first()
        self.assertIsNotNone(audit)
        self.assertEqual(audit.actor, self.operator)

    def test_suspend_company_requires_reason_min_length(self):
        self.company.status = CompanyStatus.ACTIVE
        self.company.save()

        # Under 10 characters should fail validation
        response = self.client.post(
            f"/api/v1/platform/companies/{self.company.id}/suspend/",
            {"reason": "too short"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.company.refresh_from_db()
        self.assertEqual(self.company.status, CompanyStatus.ACTIVE)

    def test_suspend_company_sets_suspended_and_retains_data(self):
        self.company.status = CompanyStatus.ACTIVE
        self.company.save()

        response = self.client.post(
            f"/api/v1/platform/companies/{self.company.id}/suspend/",
            {"reason": "Payment delinquency past 60 days"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.company.refresh_from_db()
        self.assertEqual(self.company.status, CompanyStatus.SUSPENDED)
        self.assertIsNotNone(self.company.suspended_at)

        audit = AuditLog.objects.filter(action="company.suspended", company=self.company).first()
        self.assertIsNotNone(audit)
        self.assertEqual(audit.after.get("reason"), "Payment delinquency past 60 days")

    def test_reactivate_company(self):
        self.company.status = CompanyStatus.SUSPENDED
        self.company.save()

        response = self.client.post(
            f"/api/v1/platform/companies/{self.company.id}/reactivate/",
            {"reason": "Payment dispute resolved in full"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.company.refresh_from_db()
        self.assertEqual(self.company.status, CompanyStatus.ACTIVE)
        self.assertIsNone(self.company.suspended_at)

    def test_close_company(self):
        self.company.status = CompanyStatus.ACTIVE
        self.company.save()

        response = self.client.post(
            f"/api/v1/platform/companies/{self.company.id}/close/",
            {"reason": "Tenant requested termination contract"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.company.refresh_from_db()
        self.assertEqual(self.company.status, CompanyStatus.CLOSED)
        self.assertIsNotNone(self.company.closed_at)

    def test_update_company_metadata(self):
        response = self.client.patch(
            f"/api/v1/platform/companies/{self.company.id}/",
            {
                "display_name": "Alpha Global Corp",
                "legal_name": "Alpha Global Corporation Pvt Ltd",
                "timezone": "Asia/Kolkata",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.company.refresh_from_db()
        self.assertEqual(self.company.display_name, "Alpha Global Corp")
        self.assertEqual(self.company.legal_name, "Alpha Global Corporation Pvt Ltd")
        self.assertEqual(self.company.timezone, "Asia/Kolkata")
