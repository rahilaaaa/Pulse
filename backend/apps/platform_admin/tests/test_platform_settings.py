from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from apps.audit.models import AuditLog
from apps.authorization.models import Permission, PlatformPermissionGrant
from apps.authorization.services import ensure_platform_catalog
from apps.identity.models import User
from apps.platform_admin.models import PlatformSetting
from apps.tenants.models import Company, CompanyStatus

PASSWORD = "test-platform-pass"


def grant(user, *codes):
    ensure_platform_catalog()
    for code in codes:
        PlatformPermissionGrant.objects.get_or_create(
            user=user,
            permission=Permission.objects.get(code=code),
        )


class PlatformSettingsAndOperationsTests(TestCase):
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
            "platform.operations.view",
            "platform.users.manage",
            "platform.companies.view",
            "platform.audit.view",
        )
        self.client.post("/api/v1/auth/login/", {"email": self.operator.email, "password": PASSWORD}, format="json")

    def test_get_and_update_platform_settings(self):
        get_res = self.client.get("/api/v1/platform/settings/")
        self.assertEqual(get_res.status_code, 200)
        data = get_res.json()
        self.assertIn("grace_period_days", data)
        self.assertIn("company_registration_enabled", data)

        patch_res = self.client.patch(
            "/api/v1/platform/settings/",
            {
                "grace_period_days": 14,
                "company_registration_enabled": False,
                "default_plan_code": "growth",
            },
            format="json",
        )
        self.assertEqual(patch_res.status_code, 200)
        updated = patch_res.json()
        self.assertEqual(updated["grace_period_days"], 14)
        self.assertEqual(updated["company_registration_enabled"], False)
        self.assertEqual(updated["default_plan_code"], "growth")

        # Verify DB persistence
        grace_setting = PlatformSetting.objects.get(key="grace_period_days")
        self.assertEqual(grace_setting.value, {"value": 14})

    def test_platform_health_overview(self):
        response = self.client.get("/api/v1/platform/operations/health/")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "healthy")
        self.assertIn("database", data)
        self.assertTrue(data["database"]["connected"])
        self.assertIn("latency_ms", data["database"])

    def test_onboarding_monitor(self):
        Company.objects.create(
            display_name="Stalled Co",
            legal_name="Stalled Co Ltd",
            slug="stalled-co",
            status=CompanyStatus.DRAFT,
        )
        response = self.client.get("/api/v1/platform/operations/onboarding/")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("companies", data)
        self.assertIn("draft_companies_count", data)
        slugs = [c["slug"] for c in data["companies"]]
        self.assertIn("stalled-co", slugs)
