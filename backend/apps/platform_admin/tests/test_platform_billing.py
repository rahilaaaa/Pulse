from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.audit.models import AuditLog
from apps.authorization.models import Permission, PlatformPermissionGrant
from apps.authorization.services import ensure_platform_catalog
from apps.billing.models import (
    BillingInterval,
    BillingPlan,
    BillingPlanPrice,
    Subscription,
    SubscriptionItem,
    SubscriptionItemStatus,
    SubscriptionStatus,
)
from apps.billing.services import ensure_growth_plan
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


class PlatformBillingTests(TestCase):
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
            "platform.billing.view",
            "platform.billing.manage",
            "platform.companies.view",
            "platform.companies.manage",
            "platform.audit.view",
        )
        self.client.post("/api/v1/auth/login/", {"email": self.operator.email, "password": PASSWORD}, format="json")

        self.plan_enterprise = BillingPlan.objects.create(
            code="test-enterprise",
            name="Test Enterprise",
            description="Enterprise tier for large tenants",
            is_active=True,
            is_public=True,
            trial_days=30,
        )
        self.price_monthly = BillingPlanPrice.objects.create(
            plan=self.plan_enterprise,
            currency="INR",
            billing_interval=BillingInterval.MONTH,
            amount_minor=500000,  # 5,000 INR = 500,000 paise
            is_active=True,
            effective_from=timezone.now(),
        )
        self.price_annual = BillingPlanPrice.objects.create(
            plan=self.plan_enterprise,
            currency="INR",
            billing_interval=BillingInterval.YEAR,
            amount_minor=5000000,
            is_active=True,
            effective_from=timezone.now(),
        )

        self.company = Company.objects.create(
            display_name="Gamma Systems",
            legal_name="Gamma Systems Pvt Ltd",
            slug="gamma-systems",
            status=CompanyStatus.ACTIVE,
        )

        self.subscription = Subscription.objects.create(
            company=self.company,
            plan=self.plan_enterprise,
            plan_price=self.price_monthly,
            status=SubscriptionStatus.ACTIVE,
            billing_interval=BillingInterval.MONTH,
            currency="INR",
            current_period_start=timezone.now(),
            current_period_end=timezone.now() + timezone.timedelta(days=30),
        )
        SubscriptionItem.objects.create(
            company=self.company,
            subscription=self.subscription,
            item_type="plan",
            plan_price=self.price_monthly,
            description="Enterprise Monthly",
            billing_interval=BillingInterval.MONTH,
            currency="INR",
            quantity=1,
            unit_amount_minor=500000,
            status=SubscriptionItemStatus.ACTIVE,
            effective_at=timezone.now(),
        )

    def test_billing_overview_calculation(self):
        response = self.client.get("/api/v1/platform/billing/overview/")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("committed_mrr_minor", data)
        self.assertIn("committed_arr_minor", data)
        self.assertIn("subscriptions_count", data)
        self.assertEqual(data["subscriptions_count"]["active"], 1)
        # Committed MRR includes the 500,000 paise item
        self.assertEqual(data["committed_mrr_minor"], 500000)
        self.assertEqual(data["committed_arr_minor"], 500000 * 12)

    def test_list_platform_subscriptions_and_plans(self):
        subs_res = self.client.get("/api/v1/platform/billing/subscriptions/")
        self.assertEqual(subs_res.status_code, 200)
        subs_data = subs_res.json()
        self.assertIn("results", subs_data)
        self.assertGreaterEqual(len(subs_data["results"]), 1)

        plans_res = self.client.get("/api/v1/platform/billing/plans/")
        self.assertEqual(plans_res.status_code, 200)
        plans_data = plans_res.json()
        self.assertIn("results", plans_data)
        codes = [p["code"] for p in plans_data["results"]]
        self.assertIn("growth", codes)
        self.assertIn("test-enterprise", codes)

    def test_change_company_subscription_plan(self):
        response = self.client.post(
            f"/api/v1/platform/companies/{self.company.id}/subscription/change-plan/",
            {
                "plan_code": "growth",
                "interval": BillingInterval.MONTH,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.subscription.refresh_from_db()
        self.assertEqual(self.subscription.plan.code, "growth")

        audit = AuditLog.objects.filter(
            action="platform.subscription.plan_changed",
            company=self.company,
        ).first()
        self.assertIsNotNone(audit)
