import uuid
from decimal import Decimal

from django.conf import settings
from django.db import models


class LeaveRequestStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    APPROVED = "approved", "Approved"
    REJECTED = "rejected", "Rejected"


class LeavePolicy(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="leave_policies")
    name = models.CharField(max_length=150)
    days_per_year = models.PositiveIntegerField(default=12)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "hrms_leave_policies"
        constraints = [
            models.UniqueConstraint(fields=["company", "name"], name="hrms_leave_policies_company_name_unique"),
            models.UniqueConstraint(fields=["company", "id"], name="hrms_leave_policies_company_id_id_unique"),
        ]


class LeaveRequest(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="leave_requests")
    person = models.ForeignKey("organization.Person", on_delete=models.PROTECT, related_name="leave_requests")
    policy = models.ForeignKey(LeavePolicy, on_delete=models.PROTECT, related_name="requests")
    status = models.CharField(max_length=32, choices=LeaveRequestStatus.choices, default=LeaveRequestStatus.PENDING)
    starts_on = models.DateField()
    ends_on = models.DateField()
    reason = models.CharField(max_length=500, blank=True, default="")
    decided_by = models.ForeignKey(
        "identity.User",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="leave_decisions",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "hrms_leave_requests"
        constraints = [
            models.CheckConstraint(condition=models.Q(ends_on__gte=models.F("starts_on")), name="hrms_leave_requests_dates_ok"),
            models.CheckConstraint(
                condition=models.Q(status__in=[choice.value for choice in LeaveRequestStatus]),
                name="hrms_leave_requests_status_valid",
            ),
        ]


class LeaveBalance(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="leave_balances")
    person = models.ForeignKey("organization.Person", on_delete=models.CASCADE, related_name="leave_balances")
    policy = models.ForeignKey(LeavePolicy, on_delete=models.CASCADE, related_name="balances")
    year = models.PositiveIntegerField()
    allocated_days = models.PositiveIntegerField(default=0)
    used_days = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "hrms_leave_balances"
        constraints = [
            models.UniqueConstraint(
                fields=["company", "person", "policy", "year"],
                name="hrms_leave_balances_person_policy_year_unique",
            ),
            models.UniqueConstraint(fields=["company", "id"], name="hrms_leave_balances_company_id_id_unique"),
        ]


class EmploymentStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    PENDING = "pending", "Pending"
    ACTIVE = "active", "Active"
    ON_LEAVE = "on_leave", "On leave"
    SUSPENDED = "suspended", "Suspended"
    ENDED = "ended", "Ended"
    CANCELLED = "cancelled", "Cancelled"


class WorkLocationStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    INACTIVE = "inactive", "Inactive"


class HrmsActivationStatus(models.TextChoices):
    SETUP = "setup", "Setup in progress"
    ACTIVE = "active", "Activated"


class WorkLocation(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="hrms_work_locations")
    name = models.CharField(max_length=150)
    code = models.SlugField(max_length=64)
    address = models.TextField(blank=True, default="")
    timezone = models.CharField(max_length=64, blank=True, default="")
    status = models.CharField(max_length=32, choices=WorkLocationStatus.choices, default=WorkLocationStatus.ACTIVE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "hrms_work_locations"
        constraints = [
            models.UniqueConstraint(fields=["company", "name"], name="hrms_work_locations_company_name_unique"),
            models.UniqueConstraint(fields=["company", "code"], name="hrms_work_locations_company_code_unique"),
            models.UniqueConstraint(fields=["company", "id"], name="hrms_work_locations_company_id_id_unique"),
            models.CheckConstraint(
                condition=models.Q(status__in=[choice.value for choice in WorkLocationStatus]),
                name="hrms_work_locations_status_valid",
            ),
        ]


class Employment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="employments")
    person = models.ForeignKey("organization.Person", on_delete=models.PROTECT, related_name="employments")
    legal_entity = models.ForeignKey(
        "tenants.LegalEntity",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="employments",
    )
    employee_number = models.CharField(max_length=64, blank=True, default="")
    employment_type = models.CharField(max_length=64, blank=True, default="")
    job_title = models.CharField(max_length=150, blank=True, default="")
    status = models.CharField(max_length=32, choices=EmploymentStatus.choices, default=EmploymentStatus.DRAFT)
    starts_on = models.DateField()
    ends_on = models.DateField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="employments_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "hrms_employments"
        indexes = [models.Index(fields=["company", "status", "starts_on"], name="hrms_employments_status_idx")]
        constraints = [
            models.UniqueConstraint(
                fields=["company", "employee_number"],
                condition=~models.Q(employee_number=""),
                name="hrms_employments_company_number_unique",
            ),
            models.UniqueConstraint(fields=["company", "id"], name="hrms_employments_company_id_id_unique"),
            models.CheckConstraint(
                condition=models.Q(status__in=[choice.value for choice in EmploymentStatus]),
                name="hrms_employments_status_valid",
            ),
            models.CheckConstraint(
                condition=models.Q(ends_on__isnull=True) | models.Q(ends_on__gte=models.F("starts_on")),
                name="hrms_employments_dates_valid",
            ),
            models.CheckConstraint(
                condition=~models.Q(status=EmploymentStatus.ACTIVE) | models.Q(legal_entity__isnull=False),
                name="hrms_employments_active_requires_entity",
            ),
        ]


class EmploymentDepartmentAssignment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="employment_department_assignments")
    employment = models.ForeignKey(Employment, on_delete=models.PROTECT, related_name="department_assignments")
    department = models.ForeignKey("organization.Department", on_delete=models.PROTECT, related_name="employment_assignments")
    starts_on = models.DateField()
    ends_on = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "hrms_employment_department_assignments"
        indexes = [models.Index(fields=["company", "employment", "starts_on"], name="hrms_emp_dept_effective_idx")]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(ends_on__isnull=True) | models.Q(ends_on__gte=models.F("starts_on")),
                name="hrms_emp_dept_dates_valid",
            )
        ]


class EmploymentWorkLocationAssignment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="employment_location_assignments")
    employment = models.ForeignKey(Employment, on_delete=models.PROTECT, related_name="work_location_assignments")
    work_location = models.ForeignKey(WorkLocation, on_delete=models.PROTECT, related_name="employment_assignments")
    starts_on = models.DateField()
    ends_on = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "hrms_employment_location_assignments"
        indexes = [models.Index(fields=["company", "employment", "starts_on"], name="hrms_emp_loc_effective_idx")]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(ends_on__isnull=True) | models.Q(ends_on__gte=models.F("starts_on")),
                name="hrms_emp_loc_dates_valid",
            )
        ]


class EmploymentReportingLine(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="employment_reporting_lines")
    manager = models.ForeignKey(Employment, on_delete=models.PROTECT, related_name="direct_reports_history")
    report = models.ForeignKey(Employment, on_delete=models.PROTECT, related_name="manager_history")
    starts_on = models.DateField()
    ends_on = models.DateField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="reporting_lines_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "hrms_employment_reporting_lines"
        indexes = [models.Index(fields=["company", "report", "starts_on"], name="hrms_reporting_effective_idx")]
        constraints = [
            models.CheckConstraint(condition=~models.Q(manager=models.F("report")), name="hrms_reporting_not_self"),
            models.CheckConstraint(
                condition=models.Q(ends_on__isnull=True) | models.Q(ends_on__gte=models.F("starts_on")),
                name="hrms_reporting_dates_valid",
            ),
        ]


class ApprovalDelegation(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="hrms_approval_delegations")
    delegator = models.ForeignKey(Employment, on_delete=models.PROTECT, related_name="delegations_granted")
    delegate = models.ForeignKey(Employment, on_delete=models.PROTECT, related_name="delegations_received")
    permission_family = models.CharField(max_length=100)
    starts_on = models.DateField()
    ends_on = models.DateField()
    reason = models.CharField(max_length=500)
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="hrms_delegations_approved")
    revoked_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "hrms_approval_delegations"
        constraints = [
            models.CheckConstraint(condition=~models.Q(delegator=models.F("delegate")), name="hrms_delegation_not_self"),
            models.CheckConstraint(condition=models.Q(ends_on__gte=models.F("starts_on")), name="hrms_delegation_dates_valid"),
        ]


class EmploymentHistory(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="employment_history")
    employment = models.ForeignKey(Employment, on_delete=models.PROTECT, related_name="history")
    action = models.CharField(max_length=100)
    before = models.JSONField(null=True, blank=True)
    after = models.JSONField(default=dict, blank=True)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    occurred_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "hrms_employment_history"
        indexes = [models.Index(fields=["company", "employment", "occurred_at"], name="hrms_employment_history_idx")]

    def save(self, *args, **kwargs):
        if self.pk and EmploymentHistory.objects.filter(pk=self.pk).exists():
            raise PermissionError("Employment history is append-only.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise PermissionError("Employment history is append-only.")


class HrmsActivation(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.OneToOneField("tenants.Company", on_delete=models.CASCADE, related_name="hrms_activation")
    status = models.CharField(max_length=32, choices=HrmsActivationStatus.choices, default=HrmsActivationStatus.SETUP)
    readiness = models.JSONField(default=dict, blank=True)
    activated_at = models.DateTimeField(null=True, blank=True)
    activated_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "hrms_activations"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(status__in=[choice.value for choice in HrmsActivationStatus]),
                name="hrms_activations_status_valid",
            )
        ]


class AttendanceEventType(models.TextChoices):
    CHECK_IN = "check_in", "Check in"
    CHECK_OUT = "check_out", "Check out"
    ADJUSTMENT = "adjustment", "Adjustment"


class AttendanceEventSource(models.TextChoices):
    EMPLOYEE = "employee", "Employee"
    DEVICE = "device", "Device"
    ADMIN = "admin", "Administrator"


class VerificationStatus(models.TextChoices):
    VERIFIED = "verified", "Verified"
    UNVERIFIED = "unverified", "Unverified"
    PENDING = "pending_review", "Pending review"
    FAILED = "failed", "Failed"


class AttendanceSessionStatus(models.TextChoices):
    OPEN = "open", "Open"
    PROVISIONAL = "provisional", "Provisional"
    COMPLETE = "complete", "Complete"
    PENDING_REVIEW = "pending_review", "Pending review"


class AttendanceExceptionStatus(models.TextChoices):
    OPEN = "open", "Open"
    RESOLVED = "resolved", "Resolved"
    DISMISSED = "dismissed", "Dismissed"


class AttendanceCorrectionStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    APPROVED = "approved", "Approved"
    REJECTED = "rejected", "Rejected"


class Shift(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="hrms_shifts")
    name = models.CharField(max_length=120)
    code = models.SlugField(max_length=64)
    starts_at = models.TimeField()
    ends_at = models.TimeField()
    grace_minutes = models.PositiveSmallIntegerField(default=0)
    status = models.CharField(max_length=32, choices=WorkLocationStatus.choices, default=WorkLocationStatus.ACTIVE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "hrms_shifts"
        constraints = [
            models.UniqueConstraint(fields=["company", "name"], name="hrms_shifts_company_name_unique"),
            models.UniqueConstraint(fields=["company", "code"], name="hrms_shifts_company_code_unique"),
            models.UniqueConstraint(fields=["company", "id"], name="hrms_shifts_company_id_id_unique"),
            models.CheckConstraint(
                condition=models.Q(status__in=[choice.value for choice in WorkLocationStatus]),
                name="hrms_shifts_status_valid",
            ),
        ]


class WorkSchedule(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="hrms_work_schedules")
    name = models.CharField(max_length=120)
    weekdays = models.JSONField(default=list)
    status = models.CharField(max_length=32, choices=WorkLocationStatus.choices, default=WorkLocationStatus.ACTIVE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "hrms_work_schedules"
        constraints = [
            models.UniqueConstraint(fields=["company", "name"], name="hrms_work_schedules_company_name_unique"),
            models.UniqueConstraint(fields=["company", "id"], name="hrms_work_schedules_company_id_id_unique"),
            models.CheckConstraint(
                condition=models.Q(status__in=[choice.value for choice in WorkLocationStatus]),
                name="hrms_work_schedules_status_valid",
            ),
        ]


class EmploymentScheduleAssignment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="hrms_schedule_assignments")
    employment = models.ForeignKey(Employment, on_delete=models.PROTECT, related_name="schedule_assignments")
    schedule = models.ForeignKey(WorkSchedule, on_delete=models.PROTECT, related_name="employment_assignments")
    shift = models.ForeignKey(Shift, on_delete=models.PROTECT, related_name="employment_assignments")
    starts_on = models.DateField()
    ends_on = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "hrms_employment_schedule_assignments"
        indexes = [models.Index(fields=["company", "employment", "starts_on"], name="hrms_schedule_effective_idx")]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(ends_on__isnull=True) | models.Q(ends_on__gte=models.F("starts_on")),
                name="hrms_schedule_dates_valid",
            )
        ]


class AttendancePolicy(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="attendance_policies")
    name = models.CharField(max_length=120)
    allowed_methods = models.JSONField(default=list)
    fallback_methods = models.JSONField(default=list)
    status = models.CharField(max_length=32, choices=WorkLocationStatus.choices, default=WorkLocationStatus.ACTIVE)
    starts_on = models.DateField(null=True, blank=True)
    ends_on = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "hrms_attendance_policies"
        constraints = [
            models.UniqueConstraint(fields=["company", "name"], name="hrms_attendance_policies_company_name_unique"),
            models.UniqueConstraint(fields=["company", "id"], name="hrms_attendance_policies_company_id_id_unique"),
            models.CheckConstraint(
                condition=models.Q(status__in=[choice.value for choice in WorkLocationStatus]),
                name="hrms_attendance_policies_status_valid",
            ),
            models.CheckConstraint(
                condition=models.Q(ends_on__isnull=True)
                | models.Q(starts_on__isnull=True)
                | models.Q(ends_on__gte=models.F("starts_on")),
                name="hrms_attendance_policies_dates_valid",
            ),
        ]


class AttendancePolicyAssignment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="attendance_policy_assignments")
    policy = models.ForeignKey(AttendancePolicy, on_delete=models.PROTECT, related_name="assignments")
    work_location = models.ForeignKey(WorkLocation, null=True, blank=True, on_delete=models.PROTECT, related_name="attendance_policy_assignments")
    shift = models.ForeignKey(Shift, null=True, blank=True, on_delete=models.PROTECT, related_name="attendance_policy_assignments")
    employment = models.ForeignKey(Employment, null=True, blank=True, on_delete=models.PROTECT, related_name="attendance_policy_assignments")
    employee_group = models.CharField(max_length=100, blank=True, default="")
    starts_on = models.DateField()
    ends_on = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "hrms_attendance_policy_assignments"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(ends_on__isnull=True) | models.Q(ends_on__gte=models.F("starts_on")),
                name="hrms_attendance_assignment_dates_valid",
            )
        ]


class CompanyHoliday(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="hrms_holidays")
    work_location = models.ForeignKey(WorkLocation, null=True, blank=True, on_delete=models.PROTECT, related_name="holidays")
    name = models.CharField(max_length=150)
    holiday_date = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "hrms_company_holidays"
        constraints = [models.UniqueConstraint(fields=["company", "work_location", "holiday_date"], name="hrms_holiday_location_date_unique")]


class AttendanceEvent(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="attendance_events")
    employment = models.ForeignKey(Employment, on_delete=models.PROTECT, related_name="attendance_events")
    event_type = models.CharField(max_length=32, choices=AttendanceEventType.choices)
    source = models.CharField(max_length=32, choices=AttendanceEventSource.choices)
    source_id = models.CharField(max_length=120, blank=True, default="")
    event_key = models.CharField(max_length=160, blank=True, default="")
    occurred_at = models.DateTimeField()
    received_at = models.DateTimeField(auto_now_add=True)
    timezone_name = models.CharField(max_length=64, blank=True, default="")
    verification_method = models.CharField(max_length=32, blank=True, default="")
    verification_status = models.CharField(max_length=32, choices=VerificationStatus.choices, default=VerificationStatus.PENDING)
    evidence_metadata = models.JSONField(default=dict, blank=True)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)

    class Meta:
        db_table = "hrms_attendance_events"
        indexes = [models.Index(fields=["company", "employment", "occurred_at"], name="hrms_att_event_time_idx")]
        constraints = [
            models.UniqueConstraint(fields=["company", "id"], name="hrms_att_events_company_id_id_unique"),
            models.UniqueConstraint(
                fields=["company", "source", "source_id", "event_key"],
                condition=~models.Q(event_key=""),
                name="hrms_att_event_idempotency_unique",
            ),
            models.CheckConstraint(
                condition=models.Q(event_type__in=[choice.value for choice in AttendanceEventType]),
                name="hrms_att_event_type_valid",
            ),
            models.CheckConstraint(
                condition=models.Q(source__in=[choice.value for choice in AttendanceEventSource]),
                name="hrms_att_event_source_valid",
            ),
            models.CheckConstraint(
                condition=models.Q(verification_status__in=[choice.value for choice in VerificationStatus]),
                name="hrms_att_event_verification_valid",
            ),
        ]

    def save(self, *args, **kwargs):
        if self.pk and AttendanceEvent.objects.filter(pk=self.pk).exists():
            raise PermissionError("Attendance source events are append-only.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise PermissionError("Attendance source events are append-only.")


class AttendanceSession(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="attendance_sessions")
    employment = models.ForeignKey(Employment, on_delete=models.PROTECT, related_name="attendance_sessions")
    shift = models.ForeignKey(Shift, null=True, blank=True, on_delete=models.PROTECT, related_name="attendance_sessions")
    work_date = models.DateField()
    sequence = models.PositiveSmallIntegerField(default=1)
    check_in_event = models.ForeignKey(AttendanceEvent, null=True, blank=True, on_delete=models.PROTECT, related_name="check_in_sessions")
    check_out_event = models.ForeignKey(AttendanceEvent, null=True, blank=True, on_delete=models.PROTECT, related_name="check_out_sessions")
    status = models.CharField(max_length=32, choices=AttendanceSessionStatus.choices, default=AttendanceSessionStatus.OPEN)
    timezone_name = models.CharField(max_length=64, blank=True, default="")
    calculated_version = models.PositiveIntegerField(default=1)
    minutes_worked = models.PositiveIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "hrms_attendance_sessions"
        indexes = [models.Index(fields=["company", "employment", "work_date"], name="hrms_att_session_day_idx")]
        constraints = [
            models.UniqueConstraint(fields=["company", "id"], name="hrms_att_sessions_company_id_id_unique"),
            models.UniqueConstraint(fields=["company", "employment", "work_date", "sequence"], name="hrms_att_session_unique"),
            models.CheckConstraint(
                condition=models.Q(status__in=[choice.value for choice in AttendanceSessionStatus]),
                name="hrms_att_session_status_valid",
            ),
        ]


class AttendanceDailySummary(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="attendance_daily_summaries")
    employment = models.ForeignKey(Employment, on_delete=models.PROTECT, related_name="attendance_daily_summaries")
    work_date = models.DateField()
    status = models.CharField(max_length=32, choices=AttendanceSessionStatus.choices, default=AttendanceSessionStatus.PROVISIONAL)
    timezone_name = models.CharField(max_length=64, blank=True, default="")
    minutes_worked = models.PositiveIntegerField(default=0)
    session_count = models.PositiveSmallIntegerField(default=0)
    calculation_version = models.PositiveIntegerField(default=1)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "hrms_attendance_daily_summaries"
        constraints = [models.UniqueConstraint(fields=["company", "employment", "work_date"], name="hrms_att_daily_unique")]


class AttendanceException(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="attendance_exceptions")
    employment = models.ForeignKey(Employment, on_delete=models.PROTECT, related_name="attendance_exceptions")
    event = models.ForeignKey(AttendanceEvent, null=True, blank=True, on_delete=models.PROTECT, related_name="exceptions")
    session = models.ForeignKey(AttendanceSession, null=True, blank=True, on_delete=models.PROTECT, related_name="exceptions")
    code = models.CharField(max_length=64)
    status = models.CharField(max_length=32, choices=AttendanceExceptionStatus.choices, default=AttendanceExceptionStatus.OPEN)
    details = models.JSONField(default=dict, blank=True)
    resolved_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    resolution = models.CharField(max_length=500, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "hrms_attendance_exceptions"
        indexes = [models.Index(fields=["company", "status", "created_at"], name="hrms_att_exception_idx")]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(status__in=[choice.value for choice in AttendanceExceptionStatus]),
                name="hrms_att_exception_status_valid",
            )
        ]


class AttendanceCorrectionRequest(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="attendance_corrections")
    employment = models.ForeignKey(Employment, on_delete=models.PROTECT, related_name="attendance_corrections")
    session = models.ForeignKey(AttendanceSession, null=True, blank=True, on_delete=models.PROTECT, related_name="correction_requests")
    requested_check_in = models.DateTimeField(null=True, blank=True)
    requested_check_out = models.DateTimeField(null=True, blank=True)
    reason = models.CharField(max_length=500)
    status = models.CharField(max_length=32, choices=AttendanceCorrectionStatus.choices, default=AttendanceCorrectionStatus.PENDING)
    requested_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="attendance_corrections_requested")
    decided_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="attendance_corrections_decided")
    decision_note = models.CharField(max_length=500, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    decided_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "hrms_attendance_correction_requests"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(status__in=[choice.value for choice in AttendanceCorrectionStatus]),
                name="hrms_att_correction_status_valid",
            ),
            models.CheckConstraint(
                condition=models.Q(requested_check_in__isnull=False) | models.Q(requested_check_out__isnull=False),
                name="hrms_att_correction_has_time",
            ),
        ]


class SalaryComponentType(models.TextChoices):
    EARNING = "earning", "Earning"
    DEDUCTION = "deduction", "Deduction"


class SalaryCalculationType(models.TextChoices):
    FIXED = "fixed", "Fixed amount"
    PERCENTAGE_OF_BASE = "percentage_of_base", "Percentage of base"


class PayrollPeriodStatus(models.TextChoices):
    OPEN = "open", "Open"
    CLOSED = "closed", "Closed"


class PayrollRunStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    CALCULATED = "calculated", "Calculated"
    SUBMITTED = "submitted", "Submitted"
    APPROVED = "approved", "Approved"
    FINALIZED = "finalized", "Finalized"
    REVERSED = "reversed", "Reversed"


class PayrollPaymentStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    PAID = "paid", "Paid"
    FAILED = "failed", "Failed"


class SalaryComponent(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="salary_components")
    code = models.SlugField(max_length=64)
    name = models.CharField(max_length=120)
    component_type = models.CharField(max_length=32, choices=SalaryComponentType.choices)
    calculation_type = models.CharField(max_length=40, choices=SalaryCalculationType.choices)
    fixed_amount = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    percentage = models.DecimalField(max_digits=8, decimal_places=4, null=True, blank=True)
    is_statutory = models.BooleanField(default=False)
    status = models.CharField(max_length=32, choices=WorkLocationStatus.choices, default=WorkLocationStatus.ACTIVE)
    starts_on = models.DateField()
    ends_on = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "hrms_salary_components"
        constraints = [
            models.UniqueConstraint(fields=["company", "code", "starts_on"], name="hrms_salary_component_version_unique"),
            models.UniqueConstraint(fields=["company", "id"], name="hrms_salary_components_company_id_id_unique"),
            models.CheckConstraint(
                condition=models.Q(component_type__in=[choice.value for choice in SalaryComponentType]),
                name="hrms_salary_component_type_valid",
            ),
            models.CheckConstraint(
                condition=models.Q(calculation_type__in=[choice.value for choice in SalaryCalculationType]),
                name="hrms_salary_component_calc_valid",
            ),
            models.CheckConstraint(
                condition=models.Q(ends_on__isnull=True) | models.Q(ends_on__gte=models.F("starts_on")),
                name="hrms_salary_component_dates_valid",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(calculation_type=SalaryCalculationType.FIXED, fixed_amount__isnull=False, percentage__isnull=True)
                    | models.Q(calculation_type=SalaryCalculationType.PERCENTAGE_OF_BASE, fixed_amount__isnull=True, percentage__isnull=False)
                ),
                name="hrms_salary_component_value_valid",
            ),
        ]


class SalaryStructure(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="salary_structures")
    name = models.CharField(max_length=150)
    version = models.PositiveIntegerField(default=1)
    starts_on = models.DateField()
    ends_on = models.DateField(null=True, blank=True)
    components = models.ManyToManyField(SalaryComponent, through="SalaryStructureComponent", related_name="structures")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "hrms_salary_structures"
        constraints = [
            models.UniqueConstraint(fields=["company", "name", "version"], name="hrms_salary_structure_version_unique"),
            models.UniqueConstraint(fields=["company", "id"], name="hrms_salary_structures_company_id_id_unique"),
            models.CheckConstraint(
                condition=models.Q(ends_on__isnull=True) | models.Q(ends_on__gte=models.F("starts_on")),
                name="hrms_salary_structure_dates_valid",
            ),
        ]


class SalaryStructureComponent(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="salary_structure_components")
    structure = models.ForeignKey(SalaryStructure, on_delete=models.CASCADE, related_name="component_assignments")
    component = models.ForeignKey(SalaryComponent, on_delete=models.PROTECT, related_name="structure_assignments")

    class Meta:
        db_table = "hrms_salary_structure_components"
        constraints = [models.UniqueConstraint(fields=["company", "structure", "component"], name="hrms_salary_structure_component_unique")]


class CompensationAssignment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="compensation_assignments")
    employment = models.ForeignKey(Employment, on_delete=models.PROTECT, related_name="compensation_assignments")
    structure = models.ForeignKey(SalaryStructure, on_delete=models.PROTECT, related_name="assignments")
    monthly_base_salary = models.DecimalField(max_digits=14, decimal_places=2)
    currency = models.CharField(max_length=3, default="INR")
    currency_precision = models.PositiveSmallIntegerField(default=2)
    starts_on = models.DateField()
    ends_on = models.DateField(null=True, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "hrms_compensation_assignments"
        indexes = [models.Index(fields=["company", "employment", "starts_on"], name="hrms_comp_effective_idx")]
        constraints = [
            models.CheckConstraint(condition=models.Q(monthly_base_salary__gte=Decimal("0")), name="hrms_base_salary_nonnegative"),
            models.CheckConstraint(condition=models.Q(currency_precision__lte=4), name="hrms_currency_precision_valid"),
            models.CheckConstraint(condition=models.Q(ends_on__isnull=True) | models.Q(ends_on__gte=models.F("starts_on")), name="hrms_compensation_dates_valid"),
        ]


class StatutoryRuleVersion(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="statutory_rule_versions")
    code = models.SlugField(max_length=64)
    name = models.CharField(max_length=150)
    version = models.PositiveIntegerField(default=1)
    configuration = models.JSONField(default=dict)
    source_reference = models.CharField(max_length=500, blank=True, default="")
    starts_on = models.DateField()
    ends_on = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "hrms_statutory_rule_versions"
        constraints = [
            models.UniqueConstraint(fields=["company", "code", "version"], name="hrms_statutory_rule_version_unique"),
            models.UniqueConstraint(fields=["company", "id"], name="hrms_statutory_rules_company_id_id_unique"),
            models.CheckConstraint(condition=models.Q(ends_on__isnull=True) | models.Q(ends_on__gte=models.F("starts_on")), name="hrms_statutory_rule_dates_valid"),
        ]


class PayrollPeriod(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="payroll_periods")
    legal_entity = models.ForeignKey("tenants.LegalEntity", on_delete=models.PROTECT, related_name="payroll_periods")
    name = models.CharField(max_length=120)
    starts_on = models.DateField()
    ends_on = models.DateField()
    status = models.CharField(max_length=32, choices=PayrollPeriodStatus.choices, default=PayrollPeriodStatus.OPEN)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "hrms_payroll_periods"
        constraints = [
            models.UniqueConstraint(fields=["company", "legal_entity", "starts_on", "ends_on"], name="hrms_payroll_period_unique"),
            models.UniqueConstraint(fields=["company", "id"], name="hrms_payroll_period_company_id_id_unique"),
            models.CheckConstraint(condition=models.Q(ends_on__gte=models.F("starts_on")), name="hrms_payroll_period_dates_valid"),
            models.CheckConstraint(condition=models.Q(status__in=[choice.value for choice in PayrollPeriodStatus]), name="hrms_payroll_period_status_valid"),
        ]


class PayrollRun(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="payroll_runs")
    period = models.ForeignKey(PayrollPeriod, on_delete=models.PROTECT, related_name="runs")
    run_number = models.PositiveSmallIntegerField(default=1)
    status = models.CharField(max_length=32, choices=PayrollRunStatus.choices, default=PayrollRunStatus.DRAFT)
    engine_version = models.CharField(max_length=64, default="pulse-payroll-1")
    input_snapshot = models.JSONField(default=dict, blank=True)
    output_snapshot = models.JSONField(default=dict, blank=True)
    exceptions = models.JSONField(default=list, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="payroll_runs_created")
    submitted_at = models.DateTimeField(null=True, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="payroll_runs_approved")
    finalized_at = models.DateTimeField(null=True, blank=True)
    finalized_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="payroll_runs_finalized")
    reverses = models.ForeignKey("self", null=True, blank=True, on_delete=models.PROTECT, related_name="reversal_runs")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "hrms_payroll_runs"
        constraints = [
            models.UniqueConstraint(fields=["company", "period", "run_number"], name="hrms_payroll_run_number_unique"),
            models.UniqueConstraint(fields=["company", "id"], name="hrms_payroll_run_company_id_id_unique"),
            models.CheckConstraint(condition=models.Q(status__in=[choice.value for choice in PayrollRunStatus]), name="hrms_payroll_run_status_valid"),
        ]

    def save(self, *args, **kwargs):
        existing = PayrollRun.objects.filter(pk=self.pk).first() if self.pk else None
        if existing and existing.status == PayrollRunStatus.FINALIZED:
            raise PermissionError("Finalized payroll runs are immutable.")
        super().save(*args, **kwargs)


class PayrollLine(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="payroll_lines")
    run = models.ForeignKey(PayrollRun, on_delete=models.PROTECT, related_name="lines")
    employment = models.ForeignKey(Employment, on_delete=models.PROTECT, related_name="payroll_lines")
    currency = models.CharField(max_length=3)
    earnings = models.DecimalField(max_digits=14, decimal_places=2)
    deductions = models.DecimalField(max_digits=14, decimal_places=2)
    net_pay = models.DecimalField(max_digits=14, decimal_places=2)
    inputs = models.JSONField(default=dict)
    outputs = models.JSONField(default=dict)

    class Meta:
        db_table = "hrms_payroll_lines"
        constraints = [
            models.UniqueConstraint(fields=["company", "id"], name="hrms_payroll_line_company_id_id_unique"),
            models.UniqueConstraint(fields=["company", "run", "employment"], name="hrms_payroll_line_unique"),
            models.CheckConstraint(condition=models.Q(earnings__gte=Decimal("0")), name="hrms_payroll_earnings_nonnegative"),
            models.CheckConstraint(condition=models.Q(deductions__gte=Decimal("0")), name="hrms_payroll_deductions_nonnegative"),
        ]

    def save(self, *args, **kwargs):
        if self.pk and PayrollLine.objects.filter(pk=self.pk, run__status=PayrollRunStatus.FINALIZED).exists():
            raise PermissionError("Finalized payroll lines are immutable.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        if PayrollRun.objects.filter(pk=self.run_id, status=PayrollRunStatus.FINALIZED).exists():
            raise PermissionError("Finalized payroll lines are immutable.")
        super().delete(*args, **kwargs)


class PayrollApproval(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="payroll_approvals")
    run = models.ForeignKey(PayrollRun, on_delete=models.PROTECT, related_name="approval_history")
    action = models.CharField(max_length=32)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    note = models.CharField(max_length=500, blank=True, default="")
    occurred_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "hrms_payroll_approvals"

    def save(self, *args, **kwargs):
        if self.pk and PayrollApproval.objects.filter(pk=self.pk).exists():
            raise PermissionError("Payroll approval history is append-only.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise PermissionError("Payroll approval history is append-only.")


class PayrollPaymentRecord(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="payroll_payment_records")
    run = models.ForeignKey(PayrollRun, on_delete=models.PROTECT, related_name="payment_records")
    status = models.CharField(max_length=32, choices=PayrollPaymentStatus.choices, default=PayrollPaymentStatus.PENDING)
    reference = models.CharField(max_length=120, blank=True, default="")
    note = models.CharField(max_length=500, blank=True, default="")
    recorded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    recorded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "hrms_payroll_payment_records"


class Payslip(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="payslips")
    run = models.ForeignKey(PayrollRun, on_delete=models.PROTECT, related_name="payslips")
    line = models.OneToOneField(PayrollLine, on_delete=models.PROTECT, related_name="payslip")
    snapshot = models.JSONField(default=dict)
    issued_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "hrms_payslips"

    def save(self, *args, **kwargs):
        if self.pk and Payslip.objects.filter(pk=self.pk).exists():
            raise PermissionError("Payslip snapshots are immutable.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise PermissionError("Payslip snapshots are immutable.")


class Designation(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="hrms_designations")
    code = models.CharField(max_length=50)
    name = models.CharField(max_length=150)
    department = models.ForeignKey("organization.Department", on_delete=models.SET_NULL, null=True, blank=True, related_name="hrms_designations")
    description = models.TextField(blank=True, default="")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "hrms_designations"
        constraints = [
            models.UniqueConstraint(fields=["company", "code"], name="hrms_designation_company_code_unique"),
        ]
        indexes = [
            models.Index(fields=["company", "name"], name="hrms_desig_comp_name_idx"),
        ]

    def __str__(self):
        return f"{self.name} ({self.code})"


class OnboardingTaskStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    IN_PROGRESS = "in_progress", "In Progress"
    COMPLETED = "completed", "Completed"
    WAIVED = "waived", "Waived"


class OnboardingTask(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="hrms_onboarding_tasks")
    employment = models.ForeignKey(Employment, on_delete=models.CASCADE, related_name="onboarding_tasks")
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True, default="")
    category = models.CharField(max_length=50, default="general")
    status = models.CharField(max_length=20, choices=OnboardingTaskStatus.choices, default=OnboardingTaskStatus.PENDING)
    assigned_to = models.ForeignKey("organization.Person", on_delete=models.SET_NULL, null=True, blank=True, related_name="assigned_onboarding_tasks")
    due_date = models.DateField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    completed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="completed_onboarding_tasks")
    notes = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "hrms_onboarding_tasks"
        indexes = [
            models.Index(fields=["company", "employment", "status"], name="hrms_onboard_comp_emp_stat_idx"),
        ]


class OffboardingTaskStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    IN_PROGRESS = "in_progress", "In Progress"
    COMPLETED = "completed", "Completed"
    WAIVED = "waived", "Waived"


class OffboardingTask(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="hrms_offboarding_tasks")
    employment = models.ForeignKey(Employment, on_delete=models.CASCADE, related_name="offboarding_tasks")
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True, default="")
    category = models.CharField(max_length=50, default="asset_return")
    status = models.CharField(max_length=20, choices=OffboardingTaskStatus.choices, default=OffboardingTaskStatus.PENDING)
    assigned_to = models.ForeignKey("organization.Person", on_delete=models.SET_NULL, null=True, blank=True, related_name="assigned_offboarding_tasks")
    due_date = models.DateField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    completed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="completed_offboarding_tasks")
    notes = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "hrms_offboarding_tasks"
        indexes = [
            models.Index(fields=["company", "employment", "status"], name="hrms_offboard_emp_stat_idx"),
        ]


class DocumentVerificationStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    VERIFIED = "verified", "Verified"
    REJECTED = "rejected", "Rejected"


class EmployeeDocument(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="hrms_employee_documents")
    employment = models.ForeignKey(Employment, on_delete=models.CASCADE, related_name="documents")
    title = models.CharField(max_length=200)
    category = models.CharField(max_length=50, default="other")
    file_name = models.CharField(max_length=255)
    file_path = models.CharField(max_length=500, blank=True, default="")
    file_size = models.PositiveIntegerField(default=0)
    mime_type = models.CharField(max_length=100, default="application/octet-stream")
    is_sensitive = models.BooleanField(default=False)
    status = models.CharField(max_length=20, choices=DocumentVerificationStatus.choices, default=DocumentVerificationStatus.PENDING)
    verified_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="hrms_verified_documents")
    verified_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "hrms_employee_documents"
        indexes = [
            models.Index(fields=["company", "employment", "category"], name="hrms_doc_comp_emp_cat_idx"),
        ]


class HRRequestCategory(models.TextChoices):
    GENERAL = "general", "General"
    PAYROLL = "payroll", "Payroll & Salary"
    BENEFITS = "benefits", "Benefits & Leave"
    WORKPLACE = "workplace", "Workplace & Equipment"
    POLICY = "policy", "Policy & Compliance"


class HRRequestStatus(models.TextChoices):
    OPEN = "open", "Open"
    IN_PROGRESS = "in_progress", "In Progress"
    RESOLVED = "resolved", "Resolved"
    CLOSED = "closed", "Closed"


class HRRequestPriority(models.TextChoices):
    LOW = "low", "Low"
    MEDIUM = "medium", "Medium"
    HIGH = "high", "High"
    URGENT = "urgent", "Urgent"


class HRRequest(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="hrms_hr_requests")
    employment = models.ForeignKey(Employment, on_delete=models.CASCADE, related_name="hr_requests")
    subject = models.CharField(max_length=250)
    category = models.CharField(max_length=30, choices=HRRequestCategory.choices, default=HRRequestCategory.GENERAL)
    priority = models.CharField(max_length=20, choices=HRRequestPriority.choices, default=HRRequestPriority.MEDIUM)
    status = models.CharField(max_length=20, choices=HRRequestStatus.choices, default=HRRequestStatus.OPEN)
    description = models.TextField()
    assigned_to = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="assigned_hr_requests")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="created_hr_requests")
    resolution_notes = models.TextField(blank=True, default="")
    resolved_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "hrms_hr_requests"
        indexes = [
            models.Index(fields=["company", "status", "priority"], name="hrms_req_comp_stat_prio_idx"),
            models.Index(fields=["company", "employment"], name="hrms_req_comp_emp_idx"),
        ]
