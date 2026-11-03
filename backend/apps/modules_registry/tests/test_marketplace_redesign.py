from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.audit.models import AuditLog
from apps.authorization.company import bootstrap_company_access
from apps.billing.models import BillingPlan, BillingPlanPrice, Subscription, SubscriptionStatus
from apps.hrms.models import LeavePolicy
from apps.identity.models import User
from apps.modules_registry.models import CompanyModuleInstallation, InstallationStatus, ModuleDefinition
from apps.tenants.models import Company, CompanyMembership, CompanyStatus, LegalEntity, MembershipStatus

PASSWORD = "a-long-passphrase"


class MarketplaceRedesignTests(TestCase):
    def setUp(self):
        self.owner, self.company = self._open_company("market-test-co", "owner@market.test")
        self.client = APIClient()
        self.client.force_login(self.owner)
        self.base_url = f"/api/v1/companies/{self.company.id}/modules"

    def _open_company(self, slug, email):
        owner = User.objects.create_user(email=email, password=PASSWORD, first_name="Owner", last_name="Admin")
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

    def test_catalog_enrichment(self):
        """Catalog should include categories, icons, problem_solved, and feature previews."""
        res = self.client.get(f"{self.base_url}/")
        self.assertEqual(res.status_code, 200)
        results = res.json()["results"]
        hrms_card = next((item for item in results if item["slug"] == "hrms"), None)
        self.assertIsNotNone(hrms_card)
        self.assertEqual(hrms_card["category"], "HR & People")
        self.assertEqual(hrms_card["icon"], "users")
        self.assertTrue(hrms_card["featured"])
        self.assertTrue(len(hrms_card["features_preview"]) > 0)
        self.assertTrue("centralizing employee records" in hrms_card["problem_solved"].lower() or len(hrms_card["problem_solved"]) > 10)

    def test_module_detail_endpoint(self):
        """Detail endpoint should provide features, screenshots, tutorials, and requirements status."""
        res = self.client.get(f"{self.base_url}/hrms/")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["slug"], "hrms")
        self.assertEqual(data["name"], "HRMS")
        self.assertEqual(data["category"], "HR & People")
        self.assertTrue(len(data["features"]) >= 4)
        self.assertTrue(len(data["screenshots"]) >= 2)
        self.assertTrue(len(data["tutorials"]) >= 2)
        self.assertIn("requirements_status", data)
        self.assertTrue(data["requirements_status"]["subscription_eligible"])
        self.assertTrue(data["requirements_status"]["has_install_permission"])
        self.assertTrue(data["requirements_status"]["is_available"])

    def test_module_detail_not_found(self):
        res = self.client.get(f"{self.base_url}/nonexistent-module/")
        self.assertEqual(res.status_code, 404)

    def test_install_with_config(self):
        """Installation should support initial configuration and record audit log."""
        config_payload = {
            "config": {
                "default_leave_year_start": 4,
                "allow_self_service_invites": True,
            }
        }
        res = self.client.post(f"{self.base_url}/hrms/install/", data=config_payload, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.json()["installed"])

        installation = CompanyModuleInstallation.objects.get(company=self.company, module_id="hrms")
        self.assertEqual(installation.status, InstallationStatus.INSTALLED)
        self.assertEqual(installation.config.get("default_leave_year_start"), 4)

        audit = AuditLog.objects.filter(company=self.company, action="module.installed").first()
        self.assertIsNotNone(audit)
        self.assertEqual(audit.actor, self.owner)

    def test_install_idempotency(self):
        """Calling install repeatedly should return installed status without failure."""
        res1 = self.client.post(f"{self.base_url}/hrms/install/")
        self.assertEqual(res1.status_code, 200)

        res2 = self.client.post(f"{self.base_url}/hrms/install/")
        self.assertEqual(res2.status_code, 200)
        self.assertTrue(res2.json()["installed"])

    def test_coming_soon_cannot_install(self):
        """Coming soon module should reject installation."""
        res = self.client.post(f"{self.base_url}/finance/install/")
        self.assertEqual(res.status_code, 409)

    def test_onboarding_checklist_evaluation(self):
        """Onboarding checklist should evaluate live completion status."""
        self.client.post(f"{self.base_url}/hrms/install/")
        res_before = self.client.get(f"{self.base_url}/hrms/")
        checklist_before = res_before.json()["onboarding_checklist"]
        legal_check = next((c for c in checklist_before if c["id"] == "legal-entity"), None)
        self.assertIsNotNone(legal_check)
        self.assertFalse(legal_check["completed"])

        # Now create an active legal entity
        LegalEntity.objects.create(
            company=self.company,
            name="Test Legal Entity",
            code="test-le",
            status="active",
            country_code="IN",
        )

        # Check detail again
        res_after = self.client.get(f"{self.base_url}/hrms/")
        checklist_after = res_after.json()["onboarding_checklist"]
        legal_check_after = next((c for c in checklist_after if c["id"] == "legal-entity"), None)
        self.assertTrue(legal_check_after["completed"])
