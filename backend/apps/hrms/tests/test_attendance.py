from datetime import date

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.authorization.company import assign_default_member_role, bootstrap_company_access
from apps.billing.models import BillingPlan, BillingPlanPrice, Subscription, SubscriptionStatus
from apps.hrms.models import (
    AttendanceEvent,
    AttendanceException,
    AttendancePolicy,
    AttendancePolicyAssignment,
    AttendanceSession,
    Employment,
    EmploymentScheduleAssignment,
    EmploymentStatus,
    HrmsActivation,
    LeavePolicy,
    Shift,
    WorkLocation,
    WorkSchedule,
)
from apps.identity.models import User
from apps.modules_registry.models import CompanyModuleInstallation, InstallationStatus, ModuleDefinition
from apps.organization.models import Person
from apps.tenants.models import Company, CompanyMembership, CompanyStatus, LegalEntity, MembershipStatus

PASSWORD = "a-long-passphrase"


class EmployeeAttendanceTests(TestCase):
    def setUp(self):
        self.owner, self.company = self._open_company("attendance-co", "owner@attendance.test")
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
        self.person = Person.objects.create(company=self.company, first_name="Attendance", last_name="Employee")
        self.employee = User.objects.create_user(email="employee@attendance.test", password=PASSWORD)
        membership = CompanyMembership.objects.create(
            company=self.company,
            user=self.employee,
            person=self.person,
            status=MembershipStatus.ACTIVE,
            joined_at=timezone.now(),
        )
        assign_default_member_role(membership, assigned_by=self.owner)
        self.client = APIClient()
        self.client.force_login(self.employee)
        self._configure_attendance()
        self.base = f"/api/v1/companies/{self.company.id}/hrms/employments/{self.employment.id}/attendance"

    def test_check_in_out_are_idempotent_and_remain_pending_review(self):
        check_in = self.client.post(
            f"{self.base}/check-in/",
            {"occurred_at": "2026-11-02T09:00:00+05:30", "event_key": "check-in-1", "verification_method": "manual"},
            format="json",
        )
        self.assertEqual(check_in.status_code, 201, check_in.data)
        self.assertEqual(check_in.data["verification_status"], "pending_review")
        self.assertEqual(check_in.data["daily_summary"]["status"], "pending_review")

        replay = self.client.post(
            f"{self.base}/check-in/",
            {"occurred_at": "2026-11-02T09:00:00+05:30", "event_key": "check-in-1", "verification_method": "manual"},
            format="json",
        )
        self.assertEqual(replay.status_code, 200, replay.data)
        self.assertTrue(replay.data["idempotent_replay"])
        self.assertEqual(AttendanceEvent.objects.filter(company=self.company, event_key="check-in-1").count(), 1)

        check_out = self.client.post(
            f"{self.base}/check-out/",
            {"occurred_at": "2026-11-02T17:00:00+05:30", "event_key": "check-out-1", "verification_method": "manual"},
            format="json",
        )
        self.assertEqual(check_out.status_code, 201, check_out.data)
        self.assertEqual(check_out.data["daily_summary"]["minutes_worked"], 480)
        self.assertEqual(check_out.data["daily_summary"]["status"], "pending_review")
        self.assertEqual(AttendanceSession.objects.get(company=self.company).minutes_worked, 480)
        self.assertGreaterEqual(AttendanceException.objects.filter(company=self.company, status="open").count(), 2)

    def test_duplicate_check_in_is_retained_and_flagged(self):
        payload = {"occurred_at": "2026-11-02T09:00:00+05:30", "verification_method": "manual"}
        first = self.client.post(f"{self.base}/check-in/", {**payload, "event_key": "first"}, format="json")
        duplicate = self.client.post(f"{self.base}/check-in/", {**payload, "event_key": "second"}, format="json")
        self.assertEqual(first.status_code, 201, first.data)
        self.assertEqual(duplicate.status_code, 201, duplicate.data)
        self.assertEqual(AttendanceEvent.objects.filter(company=self.company, event_type="check_in").count(), 2)
        self.assertTrue(AttendanceException.objects.filter(company=self.company, code="duplicate_check_in").exists())

    def test_unallowed_verification_method_is_rejected(self):
        response = self.client.post(
            f"{self.base}/check-in/",
            {"occurred_at": "2026-11-02T09:00:00+05:30", "event_key": "unsupported", "verification_method": "face"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(AttendanceEvent.objects.filter(company=self.company).exists())

    def test_context_must_belong_to_membership_person(self):
        other = Employment.objects.create(
            company=self.company,
            person=Person.objects.create(company=self.company, first_name="Other"),
            legal_entity=self.entity,
            starts_on=date.today(),
            status=EmploymentStatus.ACTIVE,
        )
        response = self.client.post(
            f"/api/v1/companies/{self.company.id}/hrms/employments/{other.id}/attendance/check-in/",
            {"occurred_at": "2026-11-02T09:00:00+05:30", "event_key": "foreign-context", "verification_method": "manual"},
            format="json",
        )
        self.assertEqual(response.status_code, 404)

    def _configure_attendance(self):
        self.entity = LegalEntity.objects.create(
            company=self.company,
            name="Attendance Legal",
            code="attendance-legal",
            status="active",
            created_by=self.owner,
        )
        self.employment = Employment.objects.create(
            company=self.company,
            person=self.person,
            legal_entity=self.entity,
            starts_on=date.today(),
            status=EmploymentStatus.ACTIVE,
        )
        WorkLocation.objects.create(
            company=self.company,
            name="Main Site",
            code="main-site",
            timezone="Asia/Kolkata",
        )
        shift = Shift.objects.create(
            company=self.company,
            name="General",
            code="general",
            starts_at="09:00",
            ends_at="17:00",
        )
        schedule = WorkSchedule.objects.create(company=self.company, name="Weekdays", weekdays=[0, 1, 2, 3, 4])
        EmploymentScheduleAssignment.objects.create(
            company=self.company,
            employment=self.employment,
            schedule=schedule,
            shift=shift,
            starts_on=date(2026, 1, 1),
        )
        policy = AttendancePolicy.objects.create(
            company=self.company,
            name="Manual review",
            allowed_methods=["manual"],
            fallback_methods=["manual"],
        )
        AttendancePolicyAssignment.objects.create(
            company=self.company,
            policy=policy,
            starts_on=date(2026, 1, 1),
        )
        HrmsActivation.objects.update_or_create(
            company=self.company,
            defaults={"status": "active", "readiness": {"attendance": {"activated": True}}},
        )

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
