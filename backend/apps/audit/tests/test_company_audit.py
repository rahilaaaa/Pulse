from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.audit.models import AuditLog
from apps.authorization.company import bootstrap_company_access
from apps.authorization.models import CompanyRole, MembershipRoleAssignment
from apps.billing.models import BillingPlan, BillingPlanPrice, Subscription, SubscriptionStatus
from apps.identity.models import User
from apps.tenants.models import Company, CompanyMembership, CompanyStatus, MembershipStatus

PASSWORD = "a-long-passphrase"


class CompanyAuditTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(email="audit-owner@example.com", password=PASSWORD, first_name="Aisha", last_name="Rahman")
        self.owner.email_verified_at = timezone.now()
        self.owner.save(update_fields=["email_verified_at", "updated_at"])
        self.company = Company.objects.create(slug="audit-co", legal_name="Audit Co", display_name="Audit Co", status=CompanyStatus.ACTIVE, created_by=self.owner)
        CompanyMembership.objects.create(company=self.company, user=self.owner, status=MembershipStatus.ACTIVE, joined_at=timezone.now())
        bootstrap_company_access(self.company, self.owner)
        plan = BillingPlan.objects.get(code="growth")
        price = BillingPlanPrice.objects.filter(plan=plan, billing_interval="year", currency="INR").order_by("-effective_from").first()
        Subscription.objects.create(company=self.company, plan=plan, plan_price=price, billing_interval="year", currency="INR", status=SubscriptionStatus.TRIALING, provider="pulse")
        self.employee = User.objects.create_user(email="audit-staff@example.com", password=PASSWORD, first_name="Sam", last_name="Member")
        membership = CompanyMembership.objects.create(company=self.company, user=self.employee, status=MembershipStatus.ACTIVE, joined_at=timezone.now())
        role = CompanyRole.objects.get(company=self.company, template_code="employee")
        MembershipRoleAssignment.objects.create(membership=membership, role=role, assigned_by=self.owner)
        role_row = CompanyRole.objects.create(company=self.company, name="Finance Analyst", description="", is_system=False)
        AuditLog.objects.create(company=self.company, actor=self.owner, action="role.created", object_type="company_role", object_id=role_row.id, after={"name": "Finance Analyst"})
        AuditLog.objects.create(company=self.company, actor=None, action="company.created", object_type="company", object_id=self.company.id, after={"display_name": "Audit Co"})
        self.client = APIClient()
        self.client.force_login(self.owner)

    def test_company_audit_is_labeled_and_filterable(self):
        url = f"/api/v1/companies/{self.company.id}/audit/"
        listed = self.client.get(url)
        self.assertEqual(listed.status_code, 200, listed.data)
        by_action = {row["action"]: row for row in listed.data["results"]}
        self.assertEqual(by_action["role.created"]["action_label"], "Role created")
        self.assertEqual(by_action["role.created"]["actor_name"], "Aisha Rahman")
        self.assertEqual(by_action["role.created"]["mechanism"], "Web app")
        self.assertEqual(by_action["role.created"]["target"], "Role · Finance Analyst")
        self.assertEqual(by_action["role.created"]["result"], "success")
        self.assertEqual(by_action["company.created"]["actor_name"], "System")
        self.assertEqual(by_action["company.created"]["mechanism"], "System")
        self.assertEqual(by_action["company.created"]["target"], "Company workspace")
        found = self.client.get(url, {"q": "Finance"})
        self.assertEqual([row["action"] for row in found.data["results"]], ["role.created"])
        system = self.client.get(url, {"mechanism": "system"})
        self.assertTrue(all(row["mechanism"] == "System" for row in system.data["results"]))
        staff = APIClient()
        staff.force_login(self.employee)
        denied = staff.get(url)
        self.assertEqual(denied.status_code, 403)
