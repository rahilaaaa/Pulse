import re

from django.core import mail
from django.core.cache import cache
from django.db import connection, transaction
from django.db.utils import ProgrammingError
from django.test import TestCase
from rest_framework.test import APIClient

from apps.audit.models import AuditLog
from apps.authorization.models import Permission, PlatformPermissionGrant
from apps.identity.models import User
from apps.identity.tests.test_auth_and_companies import PASSWORD, sign_in

FOUNDER_PASSWORD = "a-long-passphrase"


class CompanyCreationTests(TestCase):
    def setUp(self):
        cache.clear()
        mail.outbox.clear()
        self.client = APIClient()

    def test_register_verify_and_create_one_draft_company(self):
        created = self.client.post(
            "/api/v1/auth/register/",
            {
                "email": "Founder@Example.com",
                "password": FOUNDER_PASSWORD,
                "first_name": "Asha",
                "last_name": "Menon",
            },
            format="json",
        )
        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.data["email"], "founder@example.com")
        self.assertFalse(created.data["email_verified"])
        self.assertNotIn("token", created.data)
        duplicate = self.client.post(
            "/api/v1/auth/register/",
            {"email": "founder@example.com", "password": FOUNDER_PASSWORD},
            format="json",
        )
        self.assertEqual(duplicate.status_code, 409)
        self.assertEqual(duplicate.data["error"]["code"], "conflict")

        short = self.client.post(
            "/api/v1/auth/register/",
            {"email": "other@example.com", "password": "short"},
            format="json",
        )
        self.assertEqual(short.status_code, 400)

        self.assertEqual(len(mail.outbox), 1)
        token = re.search(r"token=(\S+)", mail.outbox[0].body).group(1)
        confirmed = self.client.post("/api/v1/auth/email-verifications/confirm/", {"token": token}, format="json")
        self.assertEqual(confirmed.status_code, 200)
        reused = self.client.post("/api/v1/auth/email-verifications/confirm/", {"token": token}, format="json")
        self.assertEqual(reused.status_code, 400)

        unverified = APIClient()
        unverified.post(
            "/api/v1/auth/register/",
            {"email": "pending@example.com", "password": FOUNDER_PASSWORD},
            format="json",
        )
        unverified.post("/api/v1/auth/login/", {"email": "pending@example.com", "password": FOUNDER_PASSWORD}, format="json")
        denied = unverified.post(
            "/api/v1/onboarding/company/",
            {"legal_name": "Pending Pvt Ltd", "display_name": "Pending", "slug": "pending-co"},
            format="json",
        )
        self.assertEqual(denied.status_code, 403)

        signed_in = self.client.post(
            "/api/v1/auth/login/",
            {"email": "founder@example.com", "password": FOUNDER_PASSWORD},
            format="json",
        )
        self.assertEqual(signed_in.status_code, 200)
        self.assertEqual(signed_in.data["platform_permissions"], [])
        company = self.client.post(
            "/api/v1/onboarding/company/",
            {"legal_name": "Northwind Pvt Ltd", "display_name": "Northwind", "slug": "northwind"},
            format="json",
        )
        self.assertEqual(company.status_code, 201)
        self.assertEqual(company.data["status"], "draft")
        self.assertEqual(company.data["slug"], "northwind")
        again = self.client.post(
            "/api/v1/onboarding/company/",
            {"legal_name": "Other Pvt Ltd", "display_name": "Other", "slug": "other-co"},
            format="json",
        )
        self.assertEqual(again.status_code, 409)

        listing = self.client.get("/api/v1/companies/")
        self.assertEqual(listing.data["results"][0]["slug"], "northwind")
        detail = self.client.get(f"/api/v1/companies/{company.data['id']}/")
        self.assertEqual(detail.status_code, 200)
        self.assertNotIn("password", detail.data)

        stranger = APIClient()
        stranger.post(
            "/api/v1/auth/register/",
            {"email": "stranger@example.com", "password": FOUNDER_PASSWORD},
            format="json",
        )
        stranger_token = re.search(r"token=(\S+)", mail.outbox[-1].body).group(1)
        stranger.post("/api/v1/auth/email-verifications/confirm/", {"token": stranger_token}, format="json")
        stranger.post("/api/v1/auth/login/", {"email": "stranger@example.com", "password": FOUNDER_PASSWORD}, format="json")
        hidden = stranger.get(f"/api/v1/companies/{company.data['id']}/")
        self.assertEqual(hidden.status_code, 404)
        self.assertEqual(self.client.get("/api/v1/platform/companies/").status_code, 403)

        checklist = self.client.get("/api/v1/onboarding/")
        self.assertEqual(checklist.data["company_id"], company.data["id"])
        self.assertTrue(checklist.data["steps"]["company_created"])
        self.assertEqual(checklist.data["access_mode"], "onboarding_only")

        audit = AuditLog.objects.get(action="company.created")
        self.assertEqual(str(audit.object_id), company.data["id"])
        self.assertIsNotNone(audit.request_id)
        if connection.vendor == "postgresql":
            with self.assertRaises(ProgrammingError):
                with transaction.atomic():
                    AuditLog.objects.filter(pk=audit.pk).update(action="tampered")
        with self.assertRaises(PermissionError):
            audit.delete()

    def test_platform_operator_sees_the_created_company_and_audit_row(self):
        self.test_register_verify_and_create_one_draft_company()
        operator = User.objects.create_user(email="operator@example.com", password=PASSWORD)
        for code in ("platform.companies.view", "platform.audit.view"):
            PlatformPermissionGrant.objects.create(user=operator, permission=Permission.objects.get(code=code))
        client = APIClient()
        sign_in(client, operator.email, PASSWORD)
        companies = client.get("/api/v1/platform/companies/", {"q": "northwind"})
        self.assertEqual(companies.status_code, 200)
        self.assertEqual(companies.data["results"][0]["slug"], "northwind")
        logs = client.get("/api/v1/platform/audit-logs/")
        self.assertEqual(logs.status_code, 200)
        self.assertEqual(logs.data["results"][0]["action"], "company.created")
        self.assertIn("after", logs.data["results"][0])
