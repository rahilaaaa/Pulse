from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.audit.models import AuditLog
from apps.authorization.company import bootstrap_company_access
from apps.billing.models import BillingPlan, BillingPlanPrice, Subscription, SubscriptionStatus
from apps.identity.models import User
from apps.tenants.models import Company, CompanyMembership, CompanyStatus, CustomField, MembershipStatus

PASSWORD = "a-long-passphrase"


class CustomFieldTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(email="fields-owner@example.com", password=PASSWORD, first_name="Ada", last_name="Owner")
        self.owner.email_verified_at = timezone.now()
        self.owner.save(update_fields=["email_verified_at", "updated_at"])
        self.company = Company.objects.create(
            slug="field-co",
            legal_name="Field Co",
            display_name="Field Co",
            status=CompanyStatus.ACTIVE,
            created_by=self.owner,
        )
        CompanyMembership.objects.create(company=self.company, user=self.owner, status=MembershipStatus.ACTIVE, joined_at=timezone.now())
        bootstrap_company_access(self.company, self.owner)
        plan = BillingPlan.objects.get(code="growth")
        price = BillingPlanPrice.objects.filter(plan=plan, billing_interval="year", currency="INR").order_by("-effective_from").first()
        Subscription.objects.create(
            company=self.company,
            plan=plan,
            plan_price=price,
            billing_interval="year",
            currency="INR",
            status=SubscriptionStatus.TRIALING,
            provider="pulse",
        )
        self.client = APIClient()
        self.client.force_login(self.owner)

    def test_create_list_and_delete_custom_fields(self):
        url = f"/api/v1/companies/{self.company.id}/custom-fields/"
        created = self.client.post(url, {"entity": "person", "name": "Cost center", "field_type": "text", "self_editable": True}, format="json")
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual(created.data["key"], "cost-center")
        self.assertTrue(created.data["self_editable"])
        listed = self.client.get(url, {"entity": "person"})
        self.assertEqual(listed.status_code, 200)
        self.assertEqual([row["name"] for row in listed.data["results"]], ["Cost center"])
        other = self.client.get(url, {"entity": "task"})
        self.assertEqual(other.data["results"], [])
        duplicate = self.client.post(url, {"entity": "person", "name": "Cost center"}, format="json")
        self.assertEqual(duplicate.status_code, 409)
        missing = self.client.post(url, {"entity": "person", "name": "Site", "field_type": "select", "options": []}, format="json")
        self.assertEqual(missing.status_code, 400)
        deleted = self.client.delete(f"{url}{created.data['id']}/")
        self.assertEqual(deleted.status_code, 204)
        self.assertFalse(CustomField.objects.filter(company=self.company).exists())
        self.assertTrue(AuditLog.objects.filter(company=self.company, action="custom_field.created").exists())
        self.assertTrue(AuditLog.objects.filter(company=self.company, action="custom_field.deleted").exists())
