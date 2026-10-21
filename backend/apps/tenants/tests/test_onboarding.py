import re

from django.core import mail
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from apps.audit.models import AuditLog
from apps.tenants.models import Company, CompanyBillingProfile

FOUNDER_PASSWORD = "a-long-passphrase"

BILLING = {
    "billing_name": "Northwind Trading Private Limited",
    "billing_email": "accounts@northwind.example",
    "address_line1": "12 Harbour Road",
    "city": "Mumbai",
    "state_code": "27",
    "postal_code": "400001",
    "country_code": "IN",
    "gstin": "27ABCDE1234F1Z5",
}


class OnboardingResumeTests(TestCase):
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

    def test_resume_starts_at_the_profile_step(self):
        checklist = self.client.get("/api/v1/onboarding/")
        self.assertEqual(checklist.status_code, 200)
        self.assertEqual(checklist.data["current_step"], "profile")
        self.assertFalse(checklist.data["steps"]["profile_completed"])
        self.assertEqual(checklist.data["company"]["status"], "draft")
        self.assertIsNone(checklist.data["billing_profile"])

    def test_profile_then_billing_profile_and_resume(self):
        missing = self.client.patch("/api/v1/onboarding/company-profile/", {}, format="json")
        self.assertEqual(missing.status_code, 400)

        early = self.client.put("/api/v1/onboarding/billing-profile/", BILLING, format="json")
        self.assertEqual(early.status_code, 409)

        profile = self.client.patch(
            "/api/v1/onboarding/company-profile/",
            {"legal_name": "Northwind Trading Private Limited", "display_name": "Northwind", "timezone": "Asia/Kolkata"},
            format="json",
        )
        self.assertEqual(profile.status_code, 200)
        self.assertEqual(profile.data["status"], "draft")
        self.assertEqual(profile.data["legal_name"], "Northwind Trading Private Limited")

        bad_zone = self.client.patch(
            "/api/v1/onboarding/company-profile/",
            {"legal_name": "Northwind Trading Private Limited", "display_name": "Northwind", "timezone": "Not/AZone"},
            format="json",
        )
        self.assertEqual(bad_zone.status_code, 400)

        bad_gstin = self.client.put("/api/v1/onboarding/billing-profile/", {**BILLING, "gstin": "not-a-gstin"}, format="json")
        self.assertEqual(bad_gstin.status_code, 400)
        mismatch = self.client.put("/api/v1/onboarding/billing-profile/", {**BILLING, "state_code": "29"}, format="json")
        self.assertEqual(mismatch.status_code, 400)

        saved = self.client.put("/api/v1/onboarding/billing-profile/", BILLING, format="json")
        self.assertEqual(saved.status_code, 200)
        self.assertEqual(saved.data["gstin"], "27ABCDE1234F1Z5")
        self.assertEqual(saved.data["place_of_supply_state_code"], "27")

        blank = self.client.put("/api/v1/onboarding/billing-profile/", {**BILLING, "gstin": ""}, format="json")
        self.assertEqual(blank.status_code, 200)
        self.assertIsNone(blank.data["gstin"])

        company = Company.objects.get(pk=self.company_id)
        self.assertEqual(company.status, "draft")
        self.assertEqual(CompanyBillingProfile.objects.filter(company=company).count(), 1)
        self.assertIsNotNone(company.onboarding_state.profile_completed_at)
        self.assertIsNotNone(company.onboarding_state.billing_profile_completed_at)
        self.assertIsNone(company.onboarding_state.plan_selected_at)

        resumed = self.client.get("/api/v1/onboarding/")
        self.assertEqual(resumed.data["current_step"], "plan")
        self.assertTrue(resumed.data["steps"]["billing_profile_completed"])
        self.assertEqual(resumed.data["billing_profile"]["city"], "Mumbai")
        self.assertEqual(resumed.data["access_mode"], "onboarding_only")
        self.assertTrue(AuditLog.objects.filter(action="company.profile_completed", company=company).exists())
        billing_audit = AuditLog.objects.filter(action="company.billing_profile_completed", company=company).latest("created_at")
        self.assertNotIn("gstin", billing_audit.after)

    def test_another_user_cannot_continue_this_onboarding(self):
        stranger = APIClient()
        stranger.post(
            "/api/v1/auth/register/",
            {"email": "stranger@example.com", "password": FOUNDER_PASSWORD},
            format="json",
        )
        token = re.search(r"token=(\S+)", mail.outbox[-1].body).group(1)
        stranger.post("/api/v1/auth/email-verifications/confirm/", {"token": token}, format="json")
        stranger.post("/api/v1/auth/login/", {"email": "stranger@example.com", "password": FOUNDER_PASSWORD}, format="json")
        denied = stranger.patch(
            "/api/v1/onboarding/company-profile/",
            {"legal_name": "Taken", "display_name": "Taken", "timezone": "Asia/Kolkata"},
            format="json",
        )
        self.assertEqual(denied.status_code, 404)
        self.assertEqual(Company.objects.get(pk=self.company_id).legal_name, "Northwind Pvt Ltd")
