from django.core import mail
from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.authorization.company import bootstrap_company_access
from apps.authorization.models import Permission, PlatformPermissionGrant
from apps.authorization.services import ensure_platform_catalog
from apps.billing.models import (
    BillingPlan,
    BillingPlanPrice,
    Subscription,
    SubscriptionStatus,
)
from apps.billing.services import ensure_growth_plan
from apps.identity.models import User
from apps.modules_registry.models import CompanyModuleInstallation, InstallationStatus, ModuleDefinition
from apps.modules_registry.services import ensure_module_catalog
from apps.tenants.models import Company, CompanyMembership, CompanyStatus, MembershipStatus

PASSWORD = "a-long-secure-password"
BILLING = {
    "billing_name": "Acme Corp",
    "billing_email": "billing@acme.example",
    "address_line1": "100 Tech Park",
    "city": "Bengaluru",
    "state_code": "29",
    "postal_code": "560001",
    "country_code": "IN",
}


def grant(user, *codes):
    ensure_platform_catalog()
    for code in codes:
        PlatformPermissionGrant.objects.get_or_create(
            user=user,
            permission=Permission.objects.get(code=code),
        )


class CentralizedModuleAvailabilityTests(TestCase):
    def setUp(self):
        cache.clear()
        mail.outbox.clear()
        ensure_platform_catalog()
        ensure_module_catalog()
        ensure_growth_plan()

        # Create Platform Admin with permission grants
        self.platform_admin = User.objects.create_user(
            email="platform.admin@pulse.test",
            password=PASSWORD,
            first_name="Platform",
            last_name="Admin",
        )
        self.platform_admin.email_verified_at = timezone.now()
        self.platform_admin.save()
        grant(
            self.platform_admin,
            "platform.companies.view",
            "platform.companies.manage",
            "platform.modules.manage",
            "platform.audit.view",
        )

        # Create a Company Owner & Active Company
        self.owner, self.company = self._create_company("tenant-alpha", "owner@alpha.test")

        self.client = APIClient()

    def _create_company(self, slug, email):
        owner = User.objects.create_user(
            email=email,
            password=PASSWORD,
            first_name="Owner",
            last_name="Alpha",
        )
        owner.email_verified_at = timezone.now()
        owner.save()

        company = Company.objects.create(
            slug=slug,
            legal_name=slug.upper(),
            display_name=slug.capitalize(),
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
        price = BillingPlanPrice.objects.filter(
            plan=plan,
            billing_interval="year",
            currency="INR",
        ).order_by("-effective_from").first()

        Subscription.objects.create(
            company=company,
            plan=plan,
            plan_price=price,
            billing_interval="year",
            currency="INR",
            status=SubscriptionStatus.ACTIVE,
            current_period_start=timezone.now(),
            current_period_end=timezone.now() + timezone.timedelta(days=365),
        )
        return owner, company

    def test_platform_admin_toggle_updates_database_and_persists(self):
        """1. Changing availability in Platform Admin updates the DB and is NOT reset on catalog reads."""
        self.client.force_login(self.platform_admin)

        # Make HRMS unavailable
        res1 = self.client.patch(
            "/api/v1/platform/modules/hrms/",
            {"installation_available": False},
            format="json",
        )
        self.assertEqual(res1.status_code, 200)
        self.assertFalse(res1.data["installation_available"])

        mod_hrms = ModuleDefinition.objects.get(slug="hrms")
        self.assertFalse(mod_hrms.installation_available)

        # Re-fetch catalog list - this internally runs ensure_module_catalog()
        catalog_res = self.client.get("/api/v1/platform/modules/")
        self.assertEqual(catalog_res.status_code, 200)
        hrms_item = next(m for m in catalog_res.data["results"] if m["slug"] == "hrms")
        self.assertFalse(hrms_item["installation_available"])

        # Verify DB still has False (not overwritten by static manifests)
        mod_hrms.refresh_from_db()
        self.assertFalse(mod_hrms.installation_available)

        # Make HRMS available again
        res2 = self.client.patch(
            "/api/v1/platform/modules/hrms/",
            {"installation_available": True},
            format="json",
        )
        self.assertEqual(res2.status_code, 200)
        self.assertTrue(res2.data["installation_available"])

        mod_hrms.refresh_from_db()
        self.assertTrue(mod_hrms.installation_available)

    def test_onboarding_modules_reflects_platform_admin_availability(self):
        """2. Onboarding screen updates dynamically: enabled modules visible, disabled hidden."""
        self.client.force_login(self.owner)

        # Set HRMS = True, CRM = False in DB
        ModuleDefinition.objects.filter(slug="hrms").update(installation_available=True)
        ModuleDefinition.objects.filter(slug="crm").update(installation_available=False)

        res = self.client.get("/api/v1/onboarding/modules/")
        self.assertEqual(res.status_code, 200)
        slugs = [m["slug"] for m in res.data["results"]]
        self.assertIn("hrms", slugs)
        self.assertNotIn("crm", slugs)

        # Now flip: HRMS = False, CRM = True
        ModuleDefinition.objects.filter(slug="hrms").update(installation_available=False)
        ModuleDefinition.objects.filter(slug="crm").update(installation_available=True)

        res2 = self.client.get("/api/v1/onboarding/modules/")
        self.assertEqual(res2.status_code, 200)
        slugs2 = [m["slug"] for m in res2.data["results"]]
        self.assertNotIn("hrms", slugs2)
        self.assertIn("crm", slugs2)

        # Disable all modules: results should be completely empty []
        ModuleDefinition.objects.all().update(installation_available=False)
        res_empty = self.client.get("/api/v1/onboarding/modules/")
        self.assertEqual(res_empty.status_code, 200)
        self.assertEqual(res_empty.data["results"], [])
        self.assertEqual(res_empty.data["count"], 0)

    def test_direct_api_installation_of_disabled_module_rejected(self):
        """3. Direct API installation attempt on disabled module returns 409 conflict with clear message."""
        self.client.force_login(self.owner)

        # Disable HRMS
        ModuleDefinition.objects.filter(slug="hrms").update(installation_available=False)

        res = self.client.post(
            f"/api/v1/companies/{self.company.id}/modules/hrms/install/",
            {},
            format="json",
        )
        self.assertEqual(res.status_code, 409)
        self.assertIn("currently not available for installation", res.data["error"]["message"])

    def test_onboarding_selection_of_disabled_module_rejected(self):
        """3b. Selecting an unavailable module during onboarding returns 409 conflict."""
        # Create an onboarding user who has filled profile + billing
        user = User.objects.create_user(email="onboarding.user@pulse.test", password=PASSWORD)
        user.email_verified_at = timezone.now()
        user.save()
        self.client.force_login(user)

        created = self.client.post(
            "/api/v1/onboarding/company/",
            {"legal_name": "Beta Corp", "display_name": "Beta", "slug": "beta-corp"},
            format="json",
        )
        self.assertEqual(created.status_code, 201)

        self.client.patch(
            "/api/v1/onboarding/company-profile/",
            {"legal_name": "Beta Corp", "display_name": "Beta", "timezone": "Asia/Kolkata"},
            format="json",
        )
        self.client.put("/api/v1/onboarding/billing-profile/", BILLING, format="json")

        # Disable HRMS
        ModuleDefinition.objects.filter(slug="hrms").update(installation_available=False)

        # Attempt to choose plan with disabled HRMS module
        res = self.client.post(
            "/api/v1/onboarding/plan/",
            {"plan_code": "growth", "billing_interval": "year", "module_slugs": ["hrms"]},
            format="json",
        )
        self.assertEqual(res.status_code, 409)
        self.assertIn("currently not available for installation", res.data["error"]["message"])

    def test_direct_api_installation_of_enabled_module_succeeds(self):
        """4. Direct API installation of an enabled module succeeds."""
        self.client.force_login(self.owner)

        # Enable HRMS
        ModuleDefinition.objects.filter(slug="hrms").update(installation_available=True)

        res = self.client.post(
            f"/api/v1/companies/{self.company.id}/modules/hrms/install/",
            {},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["status"], "installed")
        self.assertTrue(
            CompanyModuleInstallation.objects.filter(
                company=self.company,
                module_id="hrms",
                status=InstallationStatus.INSTALLED,
            ).exists()
        )

    def test_disabling_module_preserves_existing_tenant_installations(self):
        """5. Disabling an already installed module does NOT break or uninstall it from existing tenants."""
        self.client.force_login(self.owner)

        # 1. Install HRMS while it is enabled
        ModuleDefinition.objects.filter(slug="hrms").update(installation_available=True)
        res = self.client.post(
            f"/api/v1/companies/{self.company.id}/modules/hrms/install/",
            {},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.assertTrue(
            CompanyModuleInstallation.objects.filter(
                company=self.company,
                module_id="hrms",
                status=InstallationStatus.INSTALLED,
            ).exists()
        )

        # 2. Platform Admin disables HRMS globally
        self.client.force_login(self.platform_admin)
        toggle_res = self.client.patch(
            "/api/v1/platform/modules/hrms/",
            {"installation_available": False},
            format="json",
        )
        self.assertEqual(toggle_res.status_code, 200)
        self.assertFalse(toggle_res.data["installation_available"])

        # 3. Existing tenant installation is PRESERVED
        installation = CompanyModuleInstallation.objects.filter(
            company=self.company,
            module_id="hrms",
        ).first()
        self.assertIsNotNone(installation)
        self.assertEqual(installation.status, InstallationStatus.INSTALLED)

        # Existing tenant can still view module details
        self.client.force_login(self.owner)
        detail_res = self.client.get(f"/api/v1/companies/{self.company.id}/modules/hrms/")
        self.assertEqual(detail_res.status_code, 200)
        self.assertTrue(detail_res.data["installed"])

        # 4. A NEW tenant CANNOT install HRMS because it is disabled
        new_owner, new_company = self._create_company("tenant-gamma", "owner@gamma.test")
        self.client.force_login(new_owner)
        blocked_res = self.client.post(
            f"/api/v1/companies/{new_company.id}/modules/hrms/install/",
            {},
            format="json",
        )
        self.assertEqual(blocked_res.status_code, 409)
        self.assertIn("currently not available for installation", blocked_res.data["error"]["message"])
        self.assertFalse(
            CompanyModuleInstallation.objects.filter(
                company=new_company,
                module_id="hrms",
            ).exists()
        )
