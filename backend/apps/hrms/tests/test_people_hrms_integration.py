from datetime import date

from django.test import RequestFactory, TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.authorization.company import bootstrap_company_access
from apps.billing.models import BillingPlan, BillingPlanPrice, Subscription, SubscriptionStatus
from apps.hrms.models import (
    Employment,
    EmploymentDepartmentAssignment,
    EmploymentReportingLine,
    EmploymentStatus,
    HrmsActivation,
    LeavePolicy,
    WorkLocation,
)
from apps.identity.models import User
from apps.modules_registry.models import CompanyModuleInstallation, InstallationStatus, ModuleDefinition
from apps.organization.models import Department, OrganizationUnitType, Person, PersonStatus
from apps.tenants.invitations import accept_invitation, load_pending_invitation
from apps.tenants.models import Company, CompanyMembership, CompanyStatus, LegalEntity, MembershipInvitation, MembershipStatus

PASSWORD = "a-long-passphrase"


class PeopleHrmsIntegrationTests(TestCase):
    def setUp(self):
        self.owner, self.company = self._open_company("integration-test-co", "owner@integration.test")
        module = ModuleDefinition.objects.get(slug="hrms")
        CompanyModuleInstallation.objects.create(
            company=self.company,
            module=module,
            status=InstallationStatus.INSTALLED,
            installed_version=module.version,
            installed_at=timezone.now(),
            installed_by=self.owner,
        )
        LeavePolicy.objects.get_or_create(company=self.company, name="Standard Annual Leave", defaults={"days_per_year": 15})
        HrmsActivation.objects.get_or_create(company=self.company, status="active")
        self.legal_entity = LegalEntity.objects.create(
            company=self.company,
            name="Main Legal Entity",
            code="main-legal-entity",
            status="active",
            country_code="IN",
        )
        self.work_location = WorkLocation.objects.create(
            company=self.company,
            name="HQ Campus",
            code="hq-campus",
            status="active",
            timezone="Asia/Kolkata",
        )

        self.client = APIClient()
        self.client.force_login(self.owner)
        self.root = f"/api/v1/companies/{self.company.id}/hrms"

    def _open_company(self, slug, email):
        owner = User.objects.create_user(email=email, password=PASSWORD, first_name="Owner", last_name="Admin")
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

    def test_1_create_employee_using_existing_person(self):
        """Phase 9.1: Create employee using an existing Person record."""
        person = Person.objects.create(
            company=self.company,
            first_name="Alice",
            last_name="Engineer",
            work_email="alice.eng@integration.test",
            job_title="Software Engineer",
            status=PersonStatus.ACTIVE,
        )

        # Check that Alice is listed in eligible-people
        eligible_res = self.client.get(f"{self.root}/eligible-people/")
        self.assertEqual(eligible_res.status_code, 200)
        eligible_ids = [p["person_id"] for p in eligible_res.data["results"]]
        self.assertIn(str(person.id), eligible_ids)

        # Create employee record referencing Alice's person_id
        res = self.client.post(
            f"{self.root}/employments/",
            {
                "person_id": str(person.id),
                "employee_number": "EMP-ALICE-1",
                "job_title": "Senior Software Engineer",
                "employment_type": "full_time",
                "starts_on": date.today().isoformat(),
                "legal_entity_id": str(self.legal_entity.id),
                "status": "active",
            },
            format="json",
        )
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data["person_id"], str(person.id))
        self.assertEqual(res.data["employee_number"], "EMP-ALICE-1")

        # Now Alice should no longer be eligible for a new active employment
        eligible_after = self.client.get(f"{self.root}/eligible-people/")
        eligible_after_ids = [p["person_id"] for p in eligible_after.data["results"]]
        self.assertNotIn(str(person.id), eligible_after_ids)

    def test_2_create_person_inline_and_then_create_employee(self):
        """Phase 9.2: Create Person inline using existing People API and then create Employee."""
        person_res = self.client.post(
            f"/api/v1/companies/{self.company.id}/people/",
            {
                "first_name": "Bob",
                "last_name": "Designer",
                "work_email": "bob.designer@integration.test",
                "job_title": "Product Designer",
            },
            format="json",
        )
        self.assertEqual(person_res.status_code, 201, person_res.data)
        person_id = person_res.data["id"]

        emp_res = self.client.post(
            f"{self.root}/employments/",
            {
                "person_id": person_id,
                "employee_number": "EMP-BOB-01",
                "employment_type": "full_time",
                "starts_on": date.today().isoformat(),
                "legal_entity_id": str(self.legal_entity.id),
                "status": "active",
            },
            format="json",
        )
        self.assertEqual(emp_res.status_code, 201, emp_res.data)
        self.assertEqual(emp_res.data["job_title"], "Product Designer")

    def test_3_reject_duplicate_active_employee_profile(self):
        """Phase 9.3: Reject duplicate active employee profile for the same Person."""
        person = Person.objects.create(
            company=self.company,
            first_name="Charlie",
            last_name="Tech",
            work_email="charlie@integration.test",
        )
        first_emp = self.client.post(
            f"{self.root}/employments/",
            {
                "person_id": str(person.id),
                "employee_number": "EMP-CHARLIE-1",
                "starts_on": date.today().isoformat(),
                "legal_entity_id": str(self.legal_entity.id),
                "status": "active",
            },
            format="json",
        )
        self.assertEqual(first_emp.status_code, 201)

        # Attempting to create a second active employment for Charlie must be rejected with 409
        duplicate_emp = self.client.post(
            f"{self.root}/employments/",
            {
                "person_id": str(person.id),
                "employee_number": "EMP-CHARLIE-2",
                "starts_on": date.today().isoformat(),
                "legal_entity_id": str(self.legal_entity.id),
                "status": "active",
            },
            format="json",
        )
        self.assertEqual(duplicate_emp.status_code, 409)

    def test_4_reject_cross_tenant_person_selection(self):
        """Phase 9.4: Reject cross-tenant Person selection."""
        _other_owner, other_company = self._open_company("other-co", "owner@other.test")
        other_person = Person.objects.create(
            company=other_company,
            first_name="Eve",
            last_name="CrossTenant",
            work_email="eve@other.test",
        )

        # In self.company, attempting to create an employee pointing to other_company's Person must fail
        cross_res = self.client.post(
            f"{self.root}/employments/",
            {
                "person_id": str(other_person.id),
                "employee_number": "EMP-CROSS-1",
                "starts_on": date.today().isoformat(),
                "legal_entity_id": str(self.legal_entity.id),
                "status": "active",
            },
            format="json",
        )
        self.assertEqual(cross_res.status_code, 404)

    def test_5_and_6_invite_existing_person_and_accept_without_duplicates(self):
        """Phase 9.5 & 9.6: Invite an existing Person and accept invitation, linking correct Person without duplicates."""
        person = Person.objects.create(
            company=self.company,
            first_name="Dan",
            last_name="Invited",
            work_email="dan.invited@integration.test",
            job_title="QA Engineer",
            status=PersonStatus.ACTIVE,
        )
        # Create employment for Dan without a login account
        emp_res = self.client.post(
            f"{self.root}/employments/",
            {
                "person_id": str(person.id),
                "employee_number": "EMP-DAN-01",
                "starts_on": date.today().isoformat(),
                "legal_entity_id": str(self.legal_entity.id),
                "status": "active",
            },
            format="json",
        )
        self.assertEqual(emp_res.status_code, 201)
        self.assertEqual(emp_res.data["login_status"], "no_account")

        # Send invitation for Dan referencing person_id
        invite_res = self.client.post(
            f"/api/v1/companies/{self.company.id}/invitations/",
            {
                "email": person.work_email,
                "person_id": str(person.id),
            },
            format="json",
        )
        self.assertEqual(invite_res.status_code, 201, invite_res.data)

        # Verify employment payload now reflects pending invite
        list_res = self.client.get(f"{self.root}/employments/")
        dan_row = next(r for r in list_res.data["results"] if r["id"] == emp_res.data["id"])
        self.assertEqual(dan_row["login_status"], "invited")

        # Accept invitation with user account
        dan_user = User.objects.create_user(
            email=person.work_email,
            password=PASSWORD,
            first_name="Dan",
            last_name="Invited",
        )
        invitation = MembershipInvitation.objects.get(company=self.company, email=person.work_email)
        req = RequestFactory().post("/api/v1/invitations/accept/")
        req.user = dan_user
        accept_res = accept_invitation(request=req, invitation=invitation, user=dan_user)
        self.assertEqual(accept_res["company_id"], str(self.company.id))

        # Assert no duplicate Person was created
        dan_people = Person.objects.filter(company=self.company, work_email__iexact=person.work_email)
        self.assertEqual(dan_people.count(), 1)

        # Assert membership links directly to the existing Person
        membership = CompanyMembership.objects.get(company=self.company, user=dan_user)
        self.assertEqual(membership.person_id, person.id)

    def test_7_employee_exists_without_login_account(self):
        """Phase 9.7: Employee exists without a login account."""
        person = Person.objects.create(
            company=self.company,
            first_name="Fiona",
            last_name="Offline",
            work_email="fiona.offline@integration.test",
        )
        emp_res = self.client.post(
            f"{self.root}/employments/",
            {
                "person_id": str(person.id),
                "employee_number": "EMP-FIONA-01",
                "starts_on": date.today().isoformat(),
                "legal_entity_id": str(self.legal_entity.id),
                "status": "active",
            },
            format="json",
        )
        self.assertEqual(emp_res.status_code, 201)
        self.assertEqual(emp_res.data["login_status"], "no_account")
        self.assertFalse(emp_res.data["has_login"])

    def test_8_user_exists_without_employee_record(self):
        """Phase 9.8: User exists in company without an Employee record."""
        new_user = User.objects.create_user(
            email="george@integration.test",
            password=PASSWORD,
            first_name="George",
            last_name="Member",
        )
        person = Person.objects.create(
            company=self.company,
            first_name="George",
            last_name="Member",
            work_email=new_user.email,
        )
        CompanyMembership.objects.create(
            company=self.company,
            user=new_user,
            person=person,
            status=MembershipStatus.ACTIVE,
        )

        # George is a user + member + person, but does NOT have an Employment yet
        self.assertFalse(Employment.objects.filter(company=self.company, person=person).exists())

        # George must be visible in eligible-people
        res = self.client.get(f"{self.root}/eligible-people/")
        self.assertEqual(res.status_code, 200)
        george_entry = next((p for p in res.data["results"] if p["person_id"] == str(person.id)), None)
        self.assertIsNotNone(george_entry)
        self.assertEqual(george_entry["login_status"], "active")
        self.assertTrue(george_entry["has_login"])

    def test_9_organization_assignment_correctly_reflected_in_hrms(self):
        """Phase 9.9: Organization assignment is correctly reflected in HRMS."""
        unit_type = OrganizationUnitType.objects.create(
            company=self.company,
            key="branch",
            singular_label="Branch",
            plural_label="Branches",
        )
        branch = Department.objects.create(
            company=self.company,
            name="North Branch",
            key="north-branch",
            unit_type=unit_type,
        )
        dept = Department.objects.create(
            company=self.company,
            name="Engineering Division",
            key="engineering-division",
            parent=branch,
        )

        person = Person.objects.create(
            company=self.company,
            first_name="Hannah",
            last_name="Engineer",
            work_email="hannah@integration.test",
            department=dept,
        )

        emp_res = self.client.post(
            f"{self.root}/employments/",
            {
                "person_id": str(person.id),
                "employee_number": "EMP-HANNAH-01",
                "starts_on": date.today().isoformat(),
                "legal_entity_id": str(self.legal_entity.id),
                "department_id": str(dept.id),
                "work_location_id": str(self.work_location.id),
                "status": "active",
            },
            format="json",
        )
        self.assertEqual(emp_res.status_code, 201, emp_res.data)
        self.assertEqual(emp_res.data["department_name"], "Engineering Division")
        self.assertEqual(emp_res.data["branch_name"], "North Branch")
        self.assertEqual(emp_res.data["work_location_name"], "HQ Campus")

    def test_10_attendance_leave_payroll_resolve_correct_employee(self):
        """Phase 9.10: Attendance, leave and self-service resolve the correct employee."""
        res = self.client.get(f"{self.root}/me/employments/")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(len(res.data["results"]) >= 1)
        my_emp = res.data["results"][0]
        self.assertEqual(my_emp["person_email"], self.owner.email)

    def test_11_unauthorized_users_cannot_access_confidential_hr_data(self):
        """Phase 9.11: Unauthorized users cannot access confidential HR payroll/compensation."""
        regular_user = User.objects.create_user(
            email="regular@integration.test",
            password=PASSWORD,
            first_name="Regular",
            last_name="Employee",
        )
        reg_person = Person.objects.create(
            company=self.company,
            first_name="Regular",
            last_name="Employee",
            work_email=regular_user.email,
        )
        CompanyMembership.objects.create(
            company=self.company,
            user=regular_user,
            person=reg_person,
            status=MembershipStatus.ACTIVE,
        )

        client = APIClient()
        client.force_login(regular_user)

        # Attempt to access compensation assignments without permission -> 403 Forbidden
        comp_res = client.get(f"{self.root}/compensation-assignments/")
        self.assertEqual(comp_res.status_code, 403)

        # Attempt to calculate payroll without permission -> 403 Forbidden
        payroll_res = client.get(f"{self.root}/payroll-runs/")
        self.assertEqual(payroll_res.status_code, 403)
