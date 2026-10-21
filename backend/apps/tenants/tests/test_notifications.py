from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.audit.models import AuditLog
from apps.authorization.company import bootstrap_company_access
from apps.authorization.models import CompanyRole, MembershipRoleAssignment
from apps.billing.models import BillingPlan, BillingPlanPrice, Subscription, SubscriptionStatus
from apps.identity.models import User
from apps.tenants.models import Announcement, Company, CompanyMembership, CompanyNotification, CompanyStatus, MembershipStatus

PASSWORD = "a-long-passphrase"


class NotificationTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(email="notice-owner@example.com", password=PASSWORD, first_name="Aisha", last_name="Rahman")
        self.owner.email_verified_at = timezone.now()
        self.owner.save(update_fields=["email_verified_at", "updated_at"])
        self.company = Company.objects.create(
            slug="notice-co",
            legal_name="Notice Co",
            display_name="Notice Co",
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
        self.employee = User.objects.create_user(email="notice-staff@example.com", password=PASSWORD, first_name="Sam", last_name="Member")
        self.employee.email_verified_at = timezone.now()
        self.employee.save(update_fields=["email_verified_at", "updated_at"])
        membership = CompanyMembership.objects.create(company=self.company, user=self.employee, status=MembershipStatus.ACTIVE, joined_at=timezone.now())
        role = CompanyRole.objects.get(company=self.company, template_code="employee")
        MembershipRoleAssignment.objects.create(membership=membership, role=role, assigned_by=self.owner)
        self.client = APIClient()
        self.client.force_login(self.owner)

    def test_inbox_announcements_and_preferences(self):
        inbox_url = f"/api/v1/companies/{self.company.id}/notifications/"
        listed = self.client.get(inbox_url)
        self.assertEqual(listed.status_code, 200, listed.data)
        self.assertEqual(listed.data["unread_count"], 1)
        self.assertEqual(listed.data["results"][0]["title"], "Welcome to Pulse")
        again = self.client.get(inbox_url)
        self.assertEqual(CompanyNotification.objects.filter(company=self.company, recipient=self.owner, kind="welcome").count(), 1)
        self.assertEqual(again.data["unread_count"], 1)

        published = self.client.post(
            f"/api/v1/companies/{self.company.id}/announcements/",
            {"title": "Office closed for Founders' Day", "message": "All offices will be closed."},
            format="json",
        )
        self.assertEqual(published.status_code, 201, published.data)
        self.assertEqual(published.data["audience"], "Everyone")
        self.assertEqual(published.data["author_name"], "Aisha Rahman")
        self.assertEqual(Announcement.objects.filter(company=self.company).count(), 1)
        self.assertEqual(CompanyNotification.objects.filter(company=self.company, kind="announcement").count(), 2)
        self.assertTrue(AuditLog.objects.filter(company=self.company, action="announcement.published").exists())

        staff = APIClient()
        staff.force_login(self.employee)
        denied = staff.post(
            f"/api/v1/companies/{self.company.id}/announcements/",
            {"title": "Nope", "message": "Nope"},
            format="json",
        )
        self.assertEqual(denied.status_code, 403)
        staff_inbox = staff.get(inbox_url)
        self.assertEqual(staff_inbox.status_code, 200)
        self.assertIn("Office closed for Founders' Day", {row["title"] for row in staff_inbox.data["results"]})

        read = self.client.post(inbox_url, {}, format="json")
        self.assertEqual(read.status_code, 200, read.data)
        self.assertEqual(read.data["unread_count"], 0)

        prefs = self.client.get(f"/api/v1/companies/{self.company.id}/notification-preferences/")
        mention = next(row for row in prefs.data["results"] if row["event"] == "comment_mention")
        self.assertEqual(mention["email"], False)
        saved = self.client.patch(
            f"/api/v1/companies/{self.company.id}/notification-preferences/",
            {"event": "comment_mention", "in_app": False, "email": True},
            format="json",
        )
        self.assertEqual(saved.status_code, 200, saved.data)
        self.assertEqual(saved.data["in_app"], False)
        self.assertEqual(saved.data["email"], True)
