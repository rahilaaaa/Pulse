from datetime import date, timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.authorization.company import bootstrap_company_access
from apps.authorization.models import CompanyRole, MembershipRoleAssignment
from apps.billing.models import BillingPlan, BillingPlanPrice, Subscription, SubscriptionStatus
from apps.hrms.models import LeavePolicy, LeaveRequest, LeaveRequestStatus
from apps.identity.models import User
from apps.modules_registry.models import CompanyModuleInstallation, InstallationStatus, ModuleDefinition
from apps.organization.models import Department, Person
from apps.tenants.models import Company, CompanyMembership, CompanyStatus, MembershipStatus

PASSWORD = "a-long-passphrase"


class LeaveScopeTests(TestCase):
    def setUp(self):
        self.owner, self.company = self._open_company("leave-co", "owner@leave.test")
        self._install_hrms()
        self.policy = LeavePolicy.objects.get(company=self.company, name="Annual leave")

        self.manager_person = Person.objects.create(company=self.company, first_name="Mgr", last_name="One")
        self.dept = Department.objects.create(company=self.company, name="Ops", manager=self.manager_person)
        self.staff_person = Person.objects.create(
            company=self.company, first_name="Staff", last_name="Two", department=self.dept
        )
        self.other_person = Person.objects.create(company=self.company, first_name="Other", last_name="Three")

        self.manager, self.manager_membership = self._member(self.company, "mgr@leave.test", "department_manager", self.owner)
        self.manager_membership.person = self.manager_person
        self.manager_membership.save(update_fields=["person", "updated_at"])

        self.employee, self.employee_membership = self._member(self.company, "emp@leave.test", "employee", self.owner)
        self.employee_membership.person = self.staff_person
        self.employee_membership.save(update_fields=["person", "updated_at"])

        self.outsider, self.outsider_membership = self._member(self.company, "out@leave.test", "employee", self.owner)
        self.outsider_membership.person = self.other_person
        self.outsider_membership.save(update_fields=["person", "updated_at"])

        starts = date.today() + timedelta(days=7)
        ends = starts + timedelta(days=1)
        self.staff_leave = LeaveRequest.objects.create(
            company=self.company,
            person=self.staff_person,
            policy=self.policy,
            starts_on=starts,
            ends_on=ends,
            reason="vacation",
        )
        self.other_leave = LeaveRequest.objects.create(
            company=self.company,
            person=self.other_person,
            policy=self.policy,
            starts_on=starts,
            ends_on=ends,
            reason="away",
        )

    def test_employee_sees_only_own_leave(self):
        response = self._client(self.employee).get(self._leave_url())
        self.assertEqual(response.status_code, 200)
        ids = {row["id"] for row in response.data["results"]}
        self.assertEqual(ids, {str(self.staff_leave.id)})

    def test_department_manager_sees_managed_leave(self):
        response = self._client(self.manager).get(self._leave_url())
        self.assertEqual(response.status_code, 200)
        ids = {row["id"] for row in response.data["results"]}
        self.assertIn(str(self.staff_leave.id), ids)
        self.assertNotIn(str(self.other_leave.id), ids)

    def test_owner_sees_all_leave(self):
        response = self._client(self.owner).get(self._leave_url())
        self.assertEqual(response.status_code, 200)
        ids = {row["id"] for row in response.data["results"]}
        self.assertEqual(ids, {str(self.staff_leave.id), str(self.other_leave.id)})

    def test_manager_cannot_decide_out_of_scope(self):
        response = self._client(self.manager).post(
            self._decision_url(self.other_leave.id),
            {"status": LeaveRequestStatus.APPROVED},
            format="json",
        )
        self.assertEqual(response.status_code, 404)

    def test_approve_updates_balance(self):
        response = self._client(self.manager).post(
            self._decision_url(self.staff_leave.id),
            {"status": LeaveRequestStatus.APPROVED},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        balances = self._client(self.employee).get(self._balance_url())
        self.assertEqual(balances.status_code, 200)
        self.assertTrue(balances.data["results"])
        row = balances.data["results"][0]
        self.assertEqual(row["used_days"], 2)

    def test_uninstall_retains_rows_and_404s_api(self):
        before = LeaveRequest.objects.filter(company=self.company).count()
        uninstall = self._client(self.owner).post(
            f"/api/v1/companies/{self.company.id}/modules/hrms/uninstall/",
            {},
            format="json",
        )
        self.assertEqual(uninstall.status_code, 200, uninstall.data)
        self.assertEqual(uninstall.data["status"], "uninstalled")
        self.assertEqual(LeaveRequest.objects.filter(company=self.company).count(), before)
        listed = self._client(self.owner).get(self._leave_url())
        self.assertEqual(listed.status_code, 404)

    def test_cross_company_leave_not_found(self):
        other_owner, other = self._open_company("other-leave", "other-owner@leave.test")
        response = self._client(self.owner).get(f"/api/v1/companies/{other.id}/hrms/leave-requests/")
        self.assertIn(response.status_code, {403, 404})
        decision = self._client(other_owner).post(
            f"/api/v1/companies/{other.id}/hrms/leave-requests/{self.staff_leave.id}/decision/",
            {"status": LeaveRequestStatus.APPROVED},
            format="json",
        )
        self.assertIn(decision.status_code, {403, 404})

    def _install_hrms(self):
        module = ModuleDefinition.objects.get(slug="hrms")
        CompanyModuleInstallation.objects.create(
            company=self.company,
            module=module,
            status=InstallationStatus.INSTALLED,
            installed_version=module.version,
            installed_at=timezone.now(),
            installed_by=self.owner,
        )
        LeavePolicy.objects.get_or_create(company=self.company, name="Annual leave", defaults={"days_per_year": 12})

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

    def _leave_url(self):
        return f"/api/v1/companies/{self.company.id}/hrms/leave-requests/"

    def _balance_url(self):
        return f"/api/v1/companies/{self.company.id}/hrms/leave-balances/"

    def _decision_url(self, request_id):
        return f"/api/v1/companies/{self.company.id}/hrms/leave-requests/{request_id}/decision/"
