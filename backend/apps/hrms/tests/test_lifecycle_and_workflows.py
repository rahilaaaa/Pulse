from datetime import date, timedelta
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.authorization.company import bootstrap_company_access
from apps.authorization.models import CompanyRole, CompanyRolePermission, Permission
from apps.billing.models import BillingPlan, BillingPlanPrice, Subscription, SubscriptionStatus
from apps.hrms.models import (
    ApprovalDelegation,
    AttendanceCorrectionRequest,
    AttendanceCorrectionStatus,
    AttendanceException,
    AttendanceExceptionStatus,
    AttendanceSession,
    Designation,
    EmployeeDocument,
    Employment,
    EmploymentReportingLine,
    EmploymentStatus,
    HrmsActivation,
    HRRequest,
    HRRequestStatus,
    LeavePolicy,
    OffboardingTask,
    OnboardingTask,
    OnboardingTaskStatus,
)
from apps.identity.models import User
from apps.modules_registry.models import CompanyModuleInstallation, InstallationStatus, ModuleDefinition
from apps.organization.models import Department, Person
from apps.tenants.models import Company, CompanyMembership, CompanyStatus, LegalEntity, MembershipStatus

PASSWORD = "a-long-passphrase"


class LifecycleAndWorkflowsTests(TestCase):
    def setUp(self):
        self.owner, self.company = self._open_company("hrms-workflow", "owner@workflow.test")
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
        self.entity = LegalEntity.objects.create(company=self.company, name="Acme Entity", code="le-1", status="active")

        # Grant owner required HR permissions
        self._grant_permission(self.owner, "hrms.employee.view")
        self._grant_permission(self.owner, "hrms.employee.manage")
        self._grant_permission(self.owner, "hrms.location.manage")
        self._grant_permission(self.owner, "hrms.reporting.manage")
        self._grant_permission(self.owner, "hrms.attendance.view")
        self._grant_permission(self.owner, "hrms.attendance.manage")
        self._grant_permission(self.owner, "hrms.attendance.correction.approve")
        self._grant_permission(self.owner, "hrms.documents.view")
        self._grant_permission(self.owner, "hrms.documents.manage")

        self.client = APIClient()
        self.client.force_login(self.owner)
        self.root = f"/api/v1/companies/{self.company.id}/hrms"

    def _open_company(self, slug, email):
        user = User.objects.create_user(email=email, password=PASSWORD)
        user.email_verified_at = timezone.now()
        user.save(update_fields=["email_verified_at", "updated_at"])
        company = Company.objects.create(
            legal_name="Workflow Corp",
            display_name="Workflow",
            slug=slug,
            status=CompanyStatus.ACTIVE,
            created_by=user,
        )
        membership = CompanyMembership.objects.create(
            company=company,
            user=user,
            status=MembershipStatus.ACTIVE,
            joined_at=timezone.now(),
        )
        bootstrap_company_access(company, user)
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
        return user, company

    def _grant_permission(self, user, code):
        membership = CompanyMembership.objects.get(company=self.company, user=user)
        role = CompanyRole.objects.filter(company=self.company, name="Admin").first()
        if not role:
            role = CompanyRole.objects.create(company=self.company, name="Admin", is_system=False)
            from apps.authorization.models import MembershipRoleAssignment
            MembershipRoleAssignment.objects.create(membership=membership, role=role)
        perm = Permission.objects.filter(code=code).first()
        if perm:
            CompanyRolePermission.objects.get_or_create(role=role, permission=perm)

    def _create_employee(self, first_name, last_name, email):
        person = Person.objects.create(company=self.company, first_name=first_name, last_name=last_name, work_email=email)
        emp = Employment.objects.create(
            company=self.company,
            person=person,
            legal_entity=self.entity,
            status=EmploymentStatus.ACTIVE,
            starts_on=date.today(),
            job_title="Software Engineer",
        )
        return emp

    def test_designation_management(self):
        dept = Department.objects.create(company=self.company, name="Engineering")
        res = self.client.post(
            f"{self.root}/designations/",
            {"code": "SE-1", "name": "Software Engineer I", "department_id": str(dept.id), "description": "Entry level"},
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data["code"], "se-1")

        # Duplicate code rejected
        duplicate = self.client.post(
            f"{self.root}/designations/",
            {"code": "SE-1", "name": "Software Engineer I Duplicate"},
            format="json",
        )
        self.assertEqual(duplicate.status_code, 409)

        # List designations
        listing = self.client.get(f"{self.root}/designations/")
        self.assertEqual(listing.status_code, 200)
        self.assertEqual(len(listing.data["results"]), 1)

    def test_onboarding_and_offboarding_tasks(self):
        emp = self._create_employee("John", "Doe", "john@workflow.test")

        # Create onboarding task
        res = self.client.post(
            f"{self.root}/onboarding-tasks/",
            {"employment_id": str(emp.id), "title": "Submit Identity Docs", "category": "document", "due_date": date.today().isoformat()},
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        task_id = res.data["id"]

        # Complete task
        patch_res = self.client.patch(
            f"{self.root}/onboarding-tasks/{task_id}/",
            {"status": "completed", "notes": "Passport verified"},
            format="json",
        )
        self.assertEqual(patch_res.status_code, 200)
        self.assertEqual(patch_res.data["status"], "completed")

        # Create offboarding task
        off_res = self.client.post(
            f"{self.root}/offboarding-tasks/",
            {"employment_id": str(emp.id), "title": "Return Laptop", "category": "asset_return"},
            format="json",
        )
        self.assertEqual(off_res.status_code, 201)
        off_id = off_res.data["id"]

        # Complete offboarding task
        complete_off = self.client.patch(
            f"{self.root}/offboarding-tasks/{off_id}/",
            {"status": "completed", "notes": "Laptop returned in good condition"},
            format="json",
        )
        self.assertEqual(complete_off.status_code, 200)
        self.assertEqual(complete_off.data["status"], "completed")

    def test_employee_documents_and_sensitive_isolation(self):
        emp = self._create_employee("Alice", "Smith", "alice@workflow.test")

        # Create standard document
        res1 = self.client.post(
            f"{self.root}/documents/",
            {"employment_id": str(emp.id), "title": "Resume", "category": "education", "file_name": "resume.pdf", "is_sensitive": False},
            format="json",
        )
        self.assertEqual(res1.status_code, 201)

        # Create sensitive document
        res2 = self.client.post(
            f"{self.root}/documents/",
            {"employment_id": str(emp.id), "title": "Passport", "category": "identity", "file_name": "passport.pdf", "is_sensitive": True},
            format="json",
        )
        self.assertEqual(res2.status_code, 201)
        passport_id = res2.data["id"]

        # Verify document
        verify_res = self.client.post(
            f"{self.root}/documents/{passport_id}/verify/",
            {"status": "verified", "notes": "Passport verified in person"},
            format="json",
        )
        self.assertEqual(verify_res.status_code, 200)
        self.assertEqual(verify_res.data["status"], "verified")

        # Operator without sensitive permission should only see non-sensitive doc
        list_res = self.client.get(f"{self.root}/documents/?employment_id={emp.id}")
        self.assertEqual(list_res.status_code, 200)
        titles = [d["title"] for d in list_res.data["results"]]
        self.assertIn("Resume", titles)
        self.assertNotIn("Passport", titles)

    def test_hr_requests_lifecycle(self):
        emp = self._create_employee("Bob", "Builder", "bob@workflow.test")

        # Create HR request
        res = self.client.post(
            f"{self.root}/requests/",
            {"employment_id": str(emp.id), "subject": "Salary Certificate Request", "description": "Need certificate for visa", "category": "general"},
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        req_id = res.data["id"]

        # Update / Resolve HR request
        patch_res = self.client.patch(
            f"{self.root}/requests/{req_id}/",
            {"status": "resolved", "resolution_notes": "Issued and emailed to employee"},
            format="json",
        )
        self.assertEqual(patch_res.status_code, 200)
        self.assertEqual(patch_res.data["status"], "resolved")

    def test_approval_delegation_and_reassignment(self):
        mgr1 = self._create_employee("Manager", "One", "mgr1@workflow.test")
        mgr2 = self._create_employee("Manager", "Two", "mgr2@workflow.test")
        emp = self._create_employee("Staff", "Member", "staff@workflow.test")

        # Establish reporting line: Staff reports to Manager One
        EmploymentReportingLine.objects.create(
            company=self.company,
            manager=mgr1,
            report=emp,
            starts_on=date.today(),
            created_by=self.owner,
        )

        # Create delegation from mgr1 to mgr2
        res = self.client.post(
            f"{self.root}/delegations/",
            {
                "delegator_id": str(mgr1.id),
                "delegate_id": str(mgr2.id),
                "permission_family": "leave",
                "starts_on": date.today().isoformat(),
                "ends_on": (date.today() + timedelta(days=10)).isoformat(),
                "reason": "Annual vacation delegation",
            },
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        delegation_id = res.data["id"]

        # Self delegation rejected
        self_del = self.client.post(
            f"{self.root}/delegations/",
            {
                "delegator_id": str(mgr1.id),
                "delegate_id": str(mgr1.id),
                "starts_on": date.today().isoformat(),
                "ends_on": (date.today() + timedelta(days=10)).isoformat(),
                "reason": "Self delegation",
            },
            format="json",
        )
        self.assertEqual(self_del.status_code, 409)

        # Revoke delegation
        rev_res = self.client.post(f"{self.root}/delegations/{delegation_id}/revoke/")
        self.assertEqual(rev_res.status_code, 200)
        self.assertTrue(rev_res.data["revoked"])

        # Reassign pending approvals / reporting lines from mgr1 to mgr2
        reassign_res = self.client.post(
            f"{self.root}/approvals/reassign/",
            {
                "old_manager_employment_id": str(mgr1.id),
                "new_manager_employment_id": str(mgr2.id),
                "reason": "Manager One departing company",
            },
            format="json",
        )
        self.assertEqual(reassign_res.status_code, 200)
        self.assertEqual(reassign_res.data["reassigned_reports_count"], 1)

    def test_attendance_corrections_and_exceptions(self):
        emp = self._create_employee("Charlie", "Chaplin", "charlie@workflow.test")

        # Request attendance correction
        now = timezone.now()
        corr_res = self.client.post(
            f"{self.root}/attendance/corrections/",
            {
                "employment_id": str(emp.id),
                "requested_check_in": (now - timedelta(hours=8)).isoformat(),
                "requested_check_out": now.isoformat(),
                "reason": "Forgot badge at home",
            },
            format="json",
        )
        self.assertEqual(corr_res.status_code, 201)
        corr_id = corr_res.data["id"]

        # Approve correction
        decide_res = self.client.post(
            f"{self.root}/attendance/corrections/{corr_id}/decision/",
            {"status": "approved", "decision_note": "Approved by supervisor"},
            format="json",
        )
        self.assertEqual(decide_res.status_code, 200)
        self.assertEqual(decide_res.data["status"], "approved")

        # Create and resolve attendance exception
        exc = AttendanceException.objects.create(
            company=self.company,
            employment=emp,
            code="missing_checkout",
            status=AttendanceExceptionStatus.OPEN,
            details={"notes": "System detected missing punch"},
        )
        resolve_res = self.client.post(
            f"{self.root}/attendance/exceptions/{exc.id}/resolve/",
            {"resolution": "Verified by manager through building log"},
            format="json",
        )
        self.assertEqual(resolve_res.status_code, 200)
        self.assertEqual(resolve_res.data["status"], "resolved")

    def test_team_attendance_directory_and_dashboard(self):
        mgr = self._create_employee("Head", "Manager", "lead@workflow.test")
        dev = self._create_employee("Dev", "One", "dev1@workflow.test")
        EmploymentReportingLine.objects.create(
            company=self.company,
            manager=mgr,
            report=dev,
            starts_on=date.today(),
            created_by=self.owner,
        )

        # Team directory
        team_res = self.client.get(f"{self.root}/team/directory/?manager_employment_id={mgr.id}")
        self.assertEqual(team_res.status_code, 200)
        self.assertEqual(len(team_res.data["results"]), 2)

        # Team attendance
        att_res = self.client.get(f"{self.root}/team/attendance/?manager_employment_id={mgr.id}")
        self.assertEqual(att_res.status_code, 200)

        # Dashboard overview
        dash_res = self.client.get(f"{self.root}/dashboard/")
        self.assertEqual(dash_res.status_code, 200)
        self.assertIn("headcount", dash_res.data)
        self.assertIn("pending_actions", dash_res.data)

        # Reports
        rep_res = self.client.get(f"{self.root}/reports/?type=headcount")
        self.assertEqual(rep_res.status_code, 200)
        self.assertEqual(rep_res.data["report_type"], "headcount")
