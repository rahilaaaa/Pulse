import re

from django.core import mail
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from apps.billing.models import Subscription
from apps.hrms.models import LeavePolicy
from apps.modules_registry.models import CompanyModuleInstallation
from apps.tenants.models import Company

FOUNDER_PASSWORD = "a-long-passphrase"
BILLING = {
    "billing_name": "Northwind Trading Private Limited",
    "billing_email": "accounts@northwind.example",
    "address_line1": "12 Harbour Road",
    "city": "Mumbai",
    "state_code": "27",
    "postal_code": "400001",
    "country_code": "IN",
}


class PlanSelectionTests(TestCase):
    def setUp(self):
        cache.clear()
        mail.outbox.clear()
        self.client = APIClient()
        self.client.post(
            "/api/v1/auth/register/",
            {"email": "founder@example.com", "password": FOUNDER_PASSWORD, "first_name": "Asha", "last_name": "Menon"},
            format="json",
        )
        token = re.search(r"token=(\S+)", mail.outbox[0].body).group(1)
        self.client.post("/api/v1/auth/email-verifications/confirm/", {"token": token}, format="json")
        self.client.post("/api/v1/auth/login/", {"email": "founder@example.com", "password": FOUNDER_PASSWORD}, format="json")
        created = self.client.post(
            "/api/v1/onboarding/company/",
            {"legal_name": "Northwind Pvt Ltd", "display_name": "Northwind", "slug": "northwind"},
            format="json",
        )
        self.company_id = created.data["id"]

    def test_public_catalog_and_trial_selection(self):
        catalog = self.client.get("/api/v1/plans/")
        self.assertEqual(catalog.status_code, 200)
        growth = catalog.data["results"][0]
        self.assertEqual(growth["code"], "growth")
        self.assertEqual(growth["trial_days"], 14)
        amounts = {price["billing_interval"]: price["amount_minor"] for price in growth["prices"]}
        self.assertEqual(amounts, {"month": 249900, "year": 2499900})

        early = self.client.post("/api/v1/onboarding/plan/", {"plan_code": "growth", "billing_interval": "year"}, format="json")
        self.assertEqual(early.status_code, 409)

        self.client.patch(
            "/api/v1/onboarding/company-profile/",
            {"legal_name": "Northwind Trading Private Limited", "display_name": "Northwind", "timezone": "Asia/Kolkata"},
            format="json",
        )
        self.client.put("/api/v1/onboarding/billing-profile/", BILLING, format="json")

        unknown = self.client.post("/api/v1/onboarding/plan/", {"plan_code": "missing", "billing_interval": "year"}, format="json")
        self.assertEqual(unknown.status_code, 400)

        selected = self.client.post("/api/v1/onboarding/plan/", {"plan_code": "growth", "billing_interval": "year"}, format="json")
        self.assertEqual(selected.status_code, 200)
        self.assertEqual(selected.data["amount_minor"], 2499900)
        self.assertEqual(selected.data["subscription_status"], "trialing")
        self.assertEqual(selected.data["currency"], "INR")

        company = Company.objects.get(pk=self.company_id)
        self.assertEqual(company.status, "active")
        self.assertEqual(Subscription.objects.filter(company=company).count(), 1)
        self.assertIsNotNone(company.onboarding_state.plan_selected_at)
        self.assertIsNotNone(company.onboarding_state.subscription_activated_at)

        again = self.client.post("/api/v1/onboarding/plan/", {"plan_code": "growth", "billing_interval": "month"}, format="json")
        self.assertEqual(again.status_code, 200)
        self.assertEqual(Subscription.objects.filter(company=company).count(), 1)
        self.assertEqual(again.data["billing_interval"], "month")

        checklist = self.client.get("/api/v1/onboarding/")
        self.assertEqual(checklist.data["current_step"], "workspace")
        self.assertEqual(checklist.data["access_mode"], "full")
        self.assertEqual(checklist.data["subscription"]["status"], "trialing")
        self.assertNotIn("provider_subscription_ref", checklist.data["subscription"])

    def test_trial_installs_only_entitled_available_modules(self):
        self.client.patch(
            "/api/v1/onboarding/company-profile/",
            {"legal_name": "Northwind Trading Private Limited", "display_name": "Northwind", "timezone": "Asia/Kolkata"},
            format="json",
        )
        self.client.put("/api/v1/onboarding/billing-profile/", BILLING, format="json")
        rejected = self.client.post(
            "/api/v1/onboarding/plan/",
            {"plan_code": "growth", "billing_interval": "year", "module_slugs": ["hrms", "finance"]},
            format="json",
        )
        self.assertEqual(rejected.status_code, 409)
        self.assertIn("currently not available for installation", rejected.data["error"]["message"])

        selected = self.client.post(
            "/api/v1/onboarding/plan/",
            {"plan_code": "growth", "billing_interval": "year", "module_slugs": ["hrms"]},
            format="json",
        )
        self.assertEqual(selected.status_code, 200, selected.data)
        self.assertEqual(selected.data["installed_modules"], ["hrms"])
        company = Company.objects.get(pk=self.company_id)
        self.assertEqual(list(CompanyModuleInstallation.objects.filter(company=company).values_list("module_id", flat=True)), ["hrms"])
        self.assertTrue(LeavePolicy.objects.filter(company=company, name="Annual leave").exists())
        blocked = self.client.post(f"/api/v1/companies/{company.id}/modules/finance/install/", {}, format="json")
        self.assertEqual(blocked.status_code, 409)
        self.assertFalse(CompanyModuleInstallation.objects.filter(company=company, module_id="finance").exists())
        workspace = self.client.get("/api/v1/workspace/")
        self.assertEqual(workspace.status_code, 200)
        self.assertIn("company.view", workspace.data["permissions"])
