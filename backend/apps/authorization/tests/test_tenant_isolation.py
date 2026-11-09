from django.db import IntegrityError, connection, transaction
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.authorization.company import bootstrap_company_access
from apps.authorization.models import CompanyRole, MembershipRoleAssignment
from apps.authorization.scopes import RecordScope, scope_for_membership
from apps.billing.models import BillingPlan, BillingPlanPrice, Subscription, SubscriptionStatus
from apps.identity.models import User
from apps.organization.models import Person
from apps.tenants.models import Company, CompanyMembership, CompanyStatus, MembershipStatus

PASSWORD = "a-long-passphrase"


class TenantIsolationFoundationTests(TestCase):
    def setUp(self):
        self.owner_a, self.company_a = self._open_company("alpha-co", "owner-a@example.com")
        self.owner_b, self.company_b = self._open_company("beta-co", "owner-b@example.com")
        self.person_a = Person.objects.create(company=self.company_a, first_name="Ann", last_name="Alpha")
        self.person_b = Person.objects.create(company=self.company_b, first_name="Ben", last_name="Beta")
        self.membership_a = CompanyMembership.objects.get(company=self.company_a, user=self.owner_a)
        self.membership_a.person = self.person_a
        self.membership_a.save(update_fields=["person", "updated_at"])

    def test_foreign_company_person_detail_is_not_found(self):
        response = self._client(self.owner_a).patch(
            f"/api/v1/companies/{self.company_a.id}/people/{self.person_b.id}/",
            {"first_name": "Nope"},
            format="json",
        )
        self.assertEqual(response.status_code, 404)

    def test_foreign_company_workspace_people_list_denied_or_empty_of_foreign(self):
        response = self._client(self.owner_a).get(f"/api/v1/companies/{self.company_b.id}/people/")
        self.assertIn(response.status_code, {403, 404})

    def test_composite_fk_rejects_cross_company_membership_person(self):
        if connection.vendor != "postgresql":
            self.skipTest("Composite tenant FKs are enforced on PostgreSQL only.")
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                with connection.cursor() as cursor:
                    cursor.execute(
                        "UPDATE company_memberships SET person_id = %s WHERE id = %s",
                        [str(self.person_b.id), str(self.membership_a.id)],
                    )

    def test_employee_leave_scope_defaults_to_own(self):
        employee, membership = self._member(self.company_a, "emp@example.com", "employee", self.owner_a)
        person = Person.objects.create(company=self.company_a, first_name="Emp", last_name="Lee")
        membership.person = person
        membership.save(update_fields=["person", "updated_at"])
        self.assertEqual(scope_for_membership(membership, "hrms.leave"), RecordScope.OWN)

    def test_department_manager_leave_scope_defaults_to_manage(self):
        _user, membership = self._member(self.company_a, "mgr@example.com", "department_manager", self.owner_a)
        role = CompanyRole.objects.get(company=self.company_a, template_code="department_manager")
        self.assertEqual(role.record_scopes.get("hrms.leave"), "manage")
        self.assertEqual(scope_for_membership(membership, "hrms.leave"), RecordScope.MANAGE)

    def _open_company(self, slug, email):
        owner = User.objects.create_user(email=email, password=PASSWORD, first_name="Ada", last_name="Owner")
        owner.email_verified_at = timezone.now()
        owner.save(update_fields=["email_verified_at", "updated_at"])
        company = Company.objects.create(
            slug=slug, legal_name=slug, display_name=slug, status=CompanyStatus.ACTIVE, created_by=owner
        )
        CompanyMembership.objects.create(company=company, user=owner, status=MembershipStatus.ACTIVE, joined_at=timezone.now())
        bootstrap_company_access(company, owner)
        plan = BillingPlan.objects.get(code="growth")
        price = BillingPlanPrice.objects.filter(plan=plan, billing_interval="year", currency="INR").order_by("-effective_from").first()
        Subscription.objects.create(
            company=company,
            plan=plan,
            plan_price=price,
            billing_interval="year",
            currency="INR",
            status=SubscriptionStatus.TRIALING,
            provider="pulse",
        )
        return owner, company

    def _member(self, company, email, template_code, actor):
        user = User.objects.create_user(email=email, password=PASSWORD, first_name="Sam", last_name="Member")
        user.email_verified_at = timezone.now()
        user.save(update_fields=["email_verified_at", "updated_at"])
        membership = CompanyMembership.objects.create(
            company=company, user=user, status=MembershipStatus.ACTIVE, joined_at=timezone.now()
        )
        role = CompanyRole.objects.get(company=company, template_code=template_code)
        MembershipRoleAssignment.objects.create(membership=membership, role=role, assigned_by=actor)
        return user, membership

    def _client(self, user):
        client = APIClient()
        client.force_login(user)
        return client
