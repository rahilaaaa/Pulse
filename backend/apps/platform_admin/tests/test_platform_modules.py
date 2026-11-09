from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.audit.models import AuditLog
from apps.authorization.models import Permission, PlatformPermissionGrant
from apps.authorization.services import ensure_platform_catalog
from apps.billing.models import BillingInterval, BillingPlanPrice, Subscription, SubscriptionStatus
from apps.billing.services import ensure_growth_plan
from apps.identity.models import User
from apps.modules_registry.models import CompanyModuleInstallation, InstallationStatus, ModuleDefinition
from apps.modules_registry.services import ensure_module_catalog
from apps.tenants.models import Company, CompanyStatus

PASSWORD = "test-platform-pass"


def grant(user, *codes):
    ensure_platform_catalog()
    for code in codes:
        PlatformPermissionGrant.objects.get_or_create(
            user=user,
            permission=Permission.objects.get(code=code),
        )


class PlatformModuleTests(TestCase):
    def setUp(self):
        cache.clear()
        ensure_platform_catalog()
        ensure_module_catalog()
        growth_plan = ensure_growth_plan()
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
            "platform.modules.manage",
            "platform.audit.view",
        )
        self.client.post("/api/v1/auth/login/", {"email": self.operator.email, "password": PASSWORD}, format="json")

        self.company = Company.objects.create(
            display_name="Beta Corp",
            legal_name="Beta Corp Ltd",
            slug="beta-corp",
            status=CompanyStatus.ACTIVE,
        )

        price = BillingPlanPrice.objects.filter(plan=growth_plan, is_active=True).first()
        Subscription.objects.create(
            company=self.company,
            plan=growth_plan,
            plan_price=price,
            status=SubscriptionStatus.ACTIVE,
            billing_interval=BillingInterval.MONTH,
            currency="INR",
            current_period_start=timezone.now(),
            current_period_end=timezone.now() + timezone.timedelta(days=30),
        )

    def test_list_platform_modules_and_details(self):
        response = self.client.get("/api/v1/platform/modules/")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("results", data)
        self.assertGreater(len(data["results"]), 0)

        slug = data["results"][0]["slug"]
        detail_response = self.client.get(f"/api/v1/platform/modules/{slug}/")
        self.assertEqual(detail_response.status_code, 200)
        detail_data = detail_response.json()
        self.assertEqual(detail_data["slug"], slug)
        self.assertIn("problem_solved", detail_data)
        self.assertIn("installed_companies", detail_data)

    def test_toggle_module_platform_availability(self):
        mod = ModuleDefinition.objects.get(slug="projects")
        current = mod.installation_available
        response = self.client.patch(
            f"/api/v1/platform/modules/{mod.slug}/",
            {"installation_available": not current},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        mod.refresh_from_db()
        self.assertEqual(mod.installation_available, not current)

    def test_company_module_install_and_uninstall_retains_data(self):
        mod = ModuleDefinition.objects.get(slug="hrms")

        # Install
        install_res = self.client.post(
            f"/api/v1/platform/companies/{self.company.id}/modules/{mod.slug}/install/"
        )
        self.assertEqual(install_res.status_code, 200)
        install_record = CompanyModuleInstallation.objects.filter(company=self.company, module=mod).first()
        self.assertIsNotNone(install_record)
        self.assertEqual(install_record.status, InstallationStatus.INSTALLED)

        # Uninstall (sets uninstalled status per ADR-011 without dropping data)
        uninstall_res = self.client.post(
            f"/api/v1/platform/companies/{self.company.id}/modules/{mod.slug}/uninstall/"
        )
        self.assertEqual(uninstall_res.status_code, 200)
        install_record.refresh_from_db()
        self.assertEqual(install_record.status, InstallationStatus.UNINSTALLED)

        # Audit recorded
        audit = AuditLog.objects.filter(
            action="module.uninstalled",
            company=self.company,
        ).first()
        self.assertIsNotNone(audit)
