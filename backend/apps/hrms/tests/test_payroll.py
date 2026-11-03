from datetime import date

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.authorization.company import bootstrap_company_access
from apps.authorization.models import CompanyRole, CompanyRolePermission, MembershipRoleAssignment, Permission
from apps.billing.models import BillingPlan, BillingPlanPrice, Subscription, SubscriptionStatus
from apps.hrms.models import (
    Employment,
    EmploymentStatus,
    HrmsActivation,
    LeavePolicy,
    PayrollLine,
    PayrollRun,
    PayrollRunStatus,
    Payslip,
    SalaryComponent,
)
from apps.identity.models import User
from apps.modules_registry.models import CompanyModuleInstallation, InstallationStatus, ModuleDefinition
from apps.organization.models import Person
from apps.tenants.models import Company, CompanyMembership, CompanyStatus, LegalEntity, MembershipStatus

PASSWORD = "a-long-passphrase"


class PayrollWorkflowTests(TestCase):
    def setUp(self):
        self.owner, self.company = self._open_company("payroll-co", "owner@payroll.test")
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
        self.entity = LegalEntity.objects.create(
            company=self.company,
            name="Payroll Legal",
            code="payroll-legal",
            status="active",
            created_by=self.owner,
        )
        person = Person.objects.create(company=self.company, first_name="Payroll", last_name="Employee")
        self.employment = Employment.objects.create(
            company=self.company,
            person=person,
            legal_entity=self.entity,
            starts_on=date(2026, 1, 1),
            status=EmploymentStatus.ACTIVE,
        )
        self.maker = self._operator(
            "maker@payroll.test",
            ["hrms.compensation.manage", "hrms.employee.view", "hrms.payroll.calculate", "hrms.payroll.approve", "hrms.payroll.view"],
        )
        self.approver = self._operator("approver@payroll.test", ["hrms.payroll.approve", "hrms.payroll.view"])
        self.finalizer = self._operator("finalizer@payroll.test", ["hrms.payroll.finalize", "hrms.payroll.view"])
        self.maker_client = self._client(self.maker)
        self.approver_client = self._client(self.approver)
        self.finalizer_client = self._client(self.finalizer)
        self.owner_client = self._client(self.owner)
        self.root = f"/api/v1/companies/{self.company.id}/hrms"
        self._configure_payroll()

    def test_payroll_snapshot_maker_checker_and_finalized_reproducibility(self):
        run = self.maker_client.post(
            f"{self.root}/payroll-runs/",
            {"period_id": self.period_id},
            format="json",
        )
        self.assertEqual(run.status_code, 201, run.data)
        run_id = run.data["id"]

        calculated = self.maker_client.post(f"{self.root}/payroll-runs/{run_id}/actions/calculate/", {}, format="json")
        self.assertEqual(calculated.status_code, 200, calculated.data)
        self.assertEqual(calculated.data["status"], PayrollRunStatus.CALCULATED)
        line = calculated.data["lines"][0]
        self.assertEqual(line["outputs"]["net_pay"], "51200.00")
        self.assertEqual(line["inputs"]["engine_version"], "pulse-payroll-1")
        self.assertEqual(line["inputs"]["rounding"], "ROUND_HALF_UP")
        self.assertTrue(line["inputs"]["statutory_rule_versions"])

        submitted = self.maker_client.post(f"{self.root}/payroll-runs/{run_id}/actions/submit/", {}, format="json")
        self.assertEqual(submitted.status_code, 200, submitted.data)
        same_actor_approval = self.maker_client.post(f"{self.root}/payroll-runs/{run_id}/actions/approve/", {}, format="json")
        self.assertEqual(same_actor_approval.status_code, 409)
        approved = self.approver_client.post(f"{self.root}/payroll-runs/{run_id}/actions/approve/", {}, format="json")
        self.assertEqual(approved.status_code, 200, approved.data)
        finalized = self.finalizer_client.post(f"{self.root}/payroll-runs/{run_id}/actions/finalize/", {}, format="json")
        self.assertEqual(finalized.status_code, 200, finalized.data)
        self.assertEqual(finalized.data["status"], PayrollRunStatus.FINALIZED)
        payslip = Payslip.objects.get(run_id=run_id)
        source_output = payslip.snapshot["outputs"]

        component = SalaryComponent.objects.get(company=self.company, code="meal-allowance")
        component.fixed_amount = 9999
        component.save(update_fields=["fixed_amount", "updated_at"])
        refreshed_run = PayrollRun.objects.get(pk=run_id)
        refreshed_payslip = Payslip.objects.get(pk=payslip.id)
        run_line_snapshot = refreshed_run.output_snapshot["lines"][0]
        self.assertEqual(run_line_snapshot["earnings"], source_output["earnings"])
        self.assertEqual(run_line_snapshot["deductions"], source_output["deductions"])
        self.assertEqual(run_line_snapshot["net_pay"], source_output["net_pay"])
        self.assertEqual(refreshed_payslip.snapshot["outputs"], source_output)
        with self.assertRaises(PermissionError):
            refreshed_run.save()
        with self.assertRaises(PermissionError):
            PayrollLine.objects.get(run_id=run_id).delete()

    def test_payroll_calculation_is_blocked_until_explicit_activation(self):
        run = self.maker_client.post(f"{self.root}/payroll-runs/", {"period_id": self.period_id}, format="json")
        activation = HrmsActivation.objects.get(company=self.company)
        activation.readiness = {"employee_leave": {"activated": True}, "payroll": {"activated": False}}
        activation.save(update_fields=["readiness", "updated_at"])
        response = self.maker_client.post(f"{self.root}/payroll-runs/{run.data['id']}/actions/calculate/", {}, format="json")
        self.assertEqual(response.status_code, 409)

    def _configure_payroll(self):
        component_response = self.maker_client.post(
            f"{self.root}/salary-components/",
            {
                "code": "meal-allowance",
                "name": "Meal allowance",
                "component_type": "earning",
                "calculation_type": "fixed",
                "fixed_amount": "1200.00",
                "starts_on": "2026-01-01",
                "is_statutory": False,
            },
            format="json",
        )
        self.assertEqual(component_response.status_code, 201, component_response.data)
        structure_response = self.maker_client.post(
            f"{self.root}/salary-structures/",
            {"name": "Monthly", "starts_on": "2026-01-01", "component_ids": [component_response.data["id"]]},
            format="json",
        )
        self.assertEqual(structure_response.status_code, 201, structure_response.data)
        assignment_response = self.maker_client.post(
            f"{self.root}/compensation-assignments/",
            {
                "employment_id": str(self.employment.id),
                "structure_id": structure_response.data["id"],
                "monthly_base_salary": "50000.00",
                "currency": "INR",
                "currency_precision": 2,
                "starts_on": "2026-01-01",
            },
            format="json",
        )
        self.assertEqual(assignment_response.status_code, 201, assignment_response.data)
        rule_response = self.maker_client.post(
            f"{self.root}/statutory-rules/",
            {"code": "reviewed-rules", "name": "Reviewed company rules", "configuration": {}, "source_reference": "Owner-configured", "starts_on": "2026-01-01"},
            format="json",
        )
        self.assertEqual(rule_response.status_code, 201, rule_response.data)
        period_response = self.maker_client.post(
            f"{self.root}/payroll-periods/",
            {"legal_entity_id": str(self.entity.id), "name": "November 2026", "starts_on": "2026-11-01", "ends_on": "2026-11-30"},
            format="json",
        )
        self.assertEqual(period_response.status_code, 201, period_response.data)
        self.period_id = period_response.data["id"]
        self.owner_client.post(f"{self.root}/activation/", {"feature": "employee_leave"}, format="json")
        payroll_activation = self.owner_client.post(f"{self.root}/activation/", {"feature": "payroll"}, format="json")
        self.assertEqual(payroll_activation.status_code, 200, payroll_activation.data)

    def _operator(self, email, permissions):
        user = User.objects.create_user(email=email, password=PASSWORD, first_name="Payroll", last_name="Operator")
        user.email_verified_at = timezone.now()
        user.save(update_fields=["email_verified_at", "updated_at"])
        membership = CompanyMembership.objects.create(
            company=self.company,
            user=user,
            status=MembershipStatus.ACTIVE,
            joined_at=timezone.now(),
        )
        role = CompanyRole.objects.create(
            company=self.company,
            name=email.split("@", 1)[0],
            is_system=False,
            record_scopes={"hrms.employment": "company"},
        )
        for code in permissions:
            CompanyRolePermission.objects.create(role=role, permission=Permission.objects.get(code=code))
        MembershipRoleAssignment.objects.create(membership=membership, role=role, assigned_by=self.owner)
        return user

    def _client(self, user):
        client = APIClient()
        client.force_login(user)
        return client

    def _open_company(self, slug, email):
        owner = User.objects.create_user(email=email, password=PASSWORD, first_name="Ada", last_name="Owner")
        owner.email_verified_at = timezone.now()
        owner.save(update_fields=["email_verified_at", "updated_at"])
        company = Company.objects.create(
            slug=slug,
            legal_name=slug,
            display_name=slug,
            status=CompanyStatus.ACTIVE,
            created_by=owner,
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
