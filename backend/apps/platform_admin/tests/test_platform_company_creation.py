from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from apps.audit.models import AuditLog
from apps.authorization.models import Permission, PlatformPermissionGrant
from apps.authorization.services import ensure_platform_catalog
from apps.billing.models import BillingPlan, Subscription
from apps.billing.services import ensure_growth_plan
from apps.identity.models import User
from apps.tenants.models import Company, CompanyMembership, CompanyStatus

PASSWORD = "test-platform-pass"


def grant(user, *codes):
    ensure_platform_catalog()
    for code in codes:
        PlatformPermissionGrant.objects.get_or_create(
            user=user,
            permission=Permission.objects.get(code=code),
        )


class PlatformCompanyCreationTests(TestCase):
    def setUp(self):
        cache.clear()
        ensure_platform_catalog()
        ensure_growth_plan()
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

    def test_create_company_provisions_tenant_owner_and_subscription(self):
        payload = {
            "display_name": "Acme Dynamics",
            "slug": "acme-dynamics",
            "legal_name": "Acme Dynamics Private Limited",
            "country": "IN",
            "timezone": "Asia/Kolkata",
            "primary_owner_email": "founder@acmedynamics.test",
            "primary_owner_first_name": "Acme",
            "primary_owner_last_name": "Founder",
            "initial_plan_code": "growth",
            "activate_immediately": True,
        }

        response = self.client.post("/api/v1/platform/companies/", payload, format="json")
        self.assertEqual(response.status_code, 201)
        data = response.json()
        self.assertEqual(data["slug"], "acme-dynamics")
        self.assertEqual(data["status"], CompanyStatus.ACTIVE)

        company = Company.objects.get(slug="acme-dynamics")
        self.assertEqual(company.display_name, "Acme Dynamics")
        self.assertEqual(company.legal_name, "Acme Dynamics Private Limited")

        # Verify owner account and membership created
        owner_user = User.objects.filter(email="founder@acmedynamics.test").first()
        self.assertIsNotNone(owner_user)
        membership = CompanyMembership.objects.filter(company=company, user=owner_user).first()
        self.assertIsNotNone(membership)

        # Verify subscription was provisioned
        sub = Subscription.objects.filter(company=company).first()
        self.assertIsNotNone(sub)
        self.assertEqual(sub.plan.code, "growth")

        # Verify audit log
        audit = AuditLog.objects.filter(action="company.created", company=company).first()
        self.assertIsNotNone(audit)
        self.assertEqual(audit.actor, self.operator)

    def test_create_company_fails_on_duplicate_slug(self):
        Company.objects.create(
            display_name="Existing",
            legal_name="Existing Co",
            slug="duplicate-slug",
            status=CompanyStatus.ACTIVE,
        )
        payload = {
            "display_name": "Duplicate Co",
            "slug": "duplicate-slug",
            "legal_name": "Duplicate Co Pvt Ltd",
            "primary_owner_email": "owner@dup.test",
        }
        response = self.client.post("/api/v1/platform/companies/", payload, format="json")
        self.assertEqual(response.status_code, 409)
