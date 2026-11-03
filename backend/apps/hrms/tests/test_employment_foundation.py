from datetime import date

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.authorization.company import bootstrap_company_access, effective_permission_codes
from apps.authorization.models import CompanyRole, CompanyRolePermission, Permission
from apps.billing.models import BillingPlan, BillingPlanPrice, Subscription, SubscriptionStatus
from apps.hrms import services
from apps.hrms.models import Employment, EmploymentReportingLine, EmploymentStatus, HrmsActivation, LeavePolicy
from apps.identity.models import User
from apps.modules_registry.models import CompanyModuleInstallation, InstallationStatus, ModuleDefinition
from apps.organization.models import Person
from apps.tenants.models import Company, CompanyMembership, CompanyStatus, MembershipStatus

PASSWORD = "a-long-passphrase"
RESTRICTED = {
    "hrms.compensation.view",
    "hrms.compensation.manage",
    "hrms.payroll.view",
    "hrms.payroll.calculate",
    "hrms.payroll.approve",
    "hrms.payroll.finalize",
    "hrms.payroll.reverse",
    "hrms.payroll.payment_status",
    "hrms.payroll.payslip.view",
    "hrms.documents.sensitive.view",
    "hrms.attendance.evidence.view",
}


class EmploymentFoundationTests(TestCase):
    def setUp(self):
        self.owner, self.company = self._open_company("hrms-foundation", "owner@foundation.test")
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
        HrmsActivation.objects.get_or_create(company=self.company)
        self.client = APIClient()
        self.client.force_login(self.owner)
        self.root = f"/api/v1/companies/{self.company.id}/hrms"

    def test_draft_employment_without_legal_entity_then_active_requires_active_entity(self):
        person = Person.objects.create(company=self.company, first_name="Ari", last_name="Employee")
        created = self.client.post(
            f"{self.root}/employments/",
            {"person_id": str(person.id), "starts_on": date.today().isoformat(), "job_title": "Analyst"},
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual(created.data["status"], EmploymentStatus.DRAFT)
        self.assertEqual(Person.objects.filter(company=self.company).count(), 2)
        self.assertEqual(User.objects.filter(email="ari.employee@foundation.test").count(), 0)

        rejected = self.client.post(
            f"{self.root}/employments/{created.data['id']}/status/",
            {"status": EmploymentStatus.ACTIVE},
            format="json",
        )
        self.assertEqual(rejected.status_code, 409)

        entity = self.client.post(
            f"{self.root}/legal-entities/",
            {"name": "Foundation Legal", "code": "foundation-legal", "status": "active"},
            format="json",
        )
        self.assertEqual(entity.status_code, 201, entity.data)
        assigned = self.client.post(
            f"{self.root}/employments/{created.data['id']}/legal-entity/",
            {"legal_entity_id": entity.data["id"]},
            format="json",
        )
        self.assertEqual(assigned.status_code, 200, assigned.data)
        activated = self.client.post(
            f"{self.root}/employments/{created.data['id']}/status/",
            {"status": EmploymentStatus.ACTIVE},
            format="json",
        )
        self.assertEqual(activated.status_code, 200, activated.data)
        self.assertEqual(activated.data["status"], EmploymentStatus.ACTIVE)

    def test_hrms_core_activation_does_not_activate_attendance_or_payroll(self):
        response = self.client.post(f"{self.root}/activation/", {"feature": "employee_leave"}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data["readiness"]["employee_leave"]["activated"])
        self.assertFalse(response.data["readiness"]["attendance"]["ready"])
        self.assertFalse(response.data["readiness"]["payroll"]["ready"])
        self.assertFalse(response.data["readiness"]["payroll"]["activated"])

    def test_employment_rejects_person_from_another_company(self):
        other_company = self._open_company("other-foundation", "other@foundation.test")[1]
        foreign_person = Person.objects.create(company=other_company, first_name="Foreign")
        response = self.client.post(
            f"{self.root}/employments/",
            {"person_id": str(foreign_person.id), "starts_on": date.today().isoformat()},
            format="json",
        )
        self.assertEqual(response.status_code, 404)
        self.assertFalse(Employment.objects.filter(company=self.company).exists())

    def test_reporting_cycle_is_rejected(self):
        entity_response = self.client.post(
            f"{self.root}/legal-entities/",
            {"name": "Reporting Legal", "code": "reporting-legal", "status": "active"},
            format="json",
        )
        entity_id = entity_response.data["id"]
        people = [Person.objects.create(company=self.company, first_name=f"Person {index}") for index in range(3)]
        employments = [
            Employment.objects.create(
                company=self.company,
                person=person,
                legal_entity_id=entity_id,
                starts_on=date.today(),
                status=EmploymentStatus.ACTIVE,
            )
            for person in people
        ]
        services.assign_reporting_line(
            company=self.company,
            manager_id=employments[0].id,
            report_id=employments[1].id,
            starts_on=date.today().isoformat(),
            actor=self.owner,
        )
        services.assign_reporting_line(
            company=self.company,
            manager_id=employments[1].id,
            report_id=employments[2].id,
            starts_on=date.today().isoformat(),
            actor=self.owner,
        )
        with self.assertRaises(Exception):
            services.assign_reporting_line(
                company=self.company,
                manager_id=employments[2].id,
                report_id=employments[0].id,
                starts_on=date.today().isoformat(),
                actor=self.owner,
            )
        self.assertEqual(EmploymentReportingLine.objects.filter(company=self.company).count(), 2)

    def test_owner_and_hr_manager_templates_do_not_inherit_restricted_permissions(self):
        owner_membership = CompanyMembership.objects.get(company=self.company, user=self.owner)
        owner_codes = effective_permission_codes(owner_membership)
        self.assertFalse(owner_codes & RESTRICTED)

        hr_role = CompanyRole.objects.get(company=self.company, template_code="hr_manager")
        hr_codes = set(hr_role.permissions.values_list("permission_id", flat=True))
        self.assertFalse(hr_codes & RESTRICTED)

        owner_role = CompanyRole.objects.get(company=self.company, is_owner_role=True)
        restricted_code = "hrms.payroll.calculate"
        CompanyRolePermission.objects.create(
            role=owner_role,
            permission=Permission.objects.get(code=restricted_code),
        )
        self.assertIn(restricted_code, effective_permission_codes(owner_membership))

    def test_platform_users_automatically_appear_in_employments(self):
        # Create a second user and add them to the company membership
        member_user = User.objects.create_user(
            email="member@foundation.test",
            password=PASSWORD,
            first_name="Sam",
            last_name="Member",
        )
        member_user.email_verified_at = timezone.now()
        member_user.save()
        CompanyMembership.objects.create(
            company=self.company,
            user=member_user,
            status=MembershipStatus.ACTIVE,
            joined_at=timezone.now(),
        )

        # GET /employments/ should trigger auto-sync and include all company members
        response = self.client.get(f"{self.root}/employments/")
        self.assertEqual(response.status_code, 200)
        emails = [r["person_email"] for r in response.data["results"]]
        self.assertIn("owner@foundation.test", emails)
        self.assertIn("member@foundation.test", emails)

    def test_sync_employments_api_endpoint(self):
        # Call explicit sync endpoint
        response = self.client.post(f"{self.root}/employments/sync/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("synced_count", response.data)

    def test_my_employments_returns_logged_in_user_profile(self):
        # Even without manual employment creation, /me/employments/ auto-syncs the user
        response = self.client.get(f"{self.root}/me/employments/")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(len(response.data["results"]) >= 1)
        self.assertEqual(response.data["results"][0]["person_email"], "owner@foundation.test")

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
        CompanyMembership.objects.create(
            company=company,
            user=owner,
            status=MembershipStatus.ACTIVE,
            joined_at=timezone.now(),
        )
        bootstrap_company_access(company, owner)
        plan = BillingPlan.objects.get(code="growth")
        price = BillingPlanPrice.objects.filter(
            plan=plan,
            billing_interval="year",
            currency="INR",
        ).order_by("-effective_from").first()
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
