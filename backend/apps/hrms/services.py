"""HRMS leave domain services (Person-based Slice B)."""

from datetime import date, datetime, time, timedelta
from decimal import Decimal, ROUND_HALF_UP
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.db import IntegrityError, models, transaction
from django.db.models import F
from django.utils import timezone

from apps.authorization.scopes import (
    RecordScope,
    can_access_leave_request,
    filter_leave_queryset,
    scope_for_membership,
)
from django.utils.dateparse import parse_date
from apps.hrms.models import (
    ApprovalDelegation,
    AttendanceCorrectionRequest,
    AttendanceCorrectionStatus,
    AttendanceExceptionStatus,
    Designation,
    DocumentVerificationStatus,
    EmployeeDocument,
    HRRequest,
    HRRequestCategory,
    HRRequestPriority,
    HRRequestStatus,
    OffboardingTask,
    OffboardingTaskStatus,
    OnboardingTask,
    OnboardingTaskStatus,
    AttendanceDailySummary,
    AttendanceEvent,
    AttendanceEventSource,
    AttendanceEventType,
    AttendanceException,
    AttendancePolicy,
    AttendancePolicyAssignment,
    AttendanceSession,
    AttendanceSessionStatus,
    CompensationAssignment,
    PayrollApproval,
    PayrollLine,
    PayrollPeriod,
    PayrollPeriodStatus,
    PayrollPaymentRecord,
    PayrollPaymentStatus,
    PayrollRun,
    PayrollRunStatus,
    Payslip,
    SalaryCalculationType,
    SalaryComponent,
    SalaryComponentType,
    SalaryStructure,
    SalaryStructureComponent,
    StatutoryRuleVersion,
    EmploymentScheduleAssignment,
    Employment,
    EmploymentDepartmentAssignment,
    EmploymentHistory,
    EmploymentReportingLine,
    EmploymentStatus,
    EmploymentWorkLocationAssignment,
    HrmsActivation,
    LeaveBalance,
    LeavePolicy,
    LeaveRequest,
    LeaveRequestStatus,
    Shift,
    VerificationStatus,
    WorkLocation,
    WorkSchedule,
)
from apps.organization.models import Department, Person
from apps.tenants.models import LegalEntity
from common.api.errors import conflict, not_found, validation_error


def leave_days(starts_on: date, ends_on: date) -> int:
    return (ends_on - starts_on).days + 1


def ensure_balance(*, company, person, policy: LeavePolicy, year: int) -> LeaveBalance:
    balance, _created = LeaveBalance.objects.get_or_create(
        company=company,
        person=person,
        policy=policy,
        year=year,
        defaults={"allocated_days": policy.days_per_year, "used_days": 0},
    )
    return balance


def list_leave_requests(membership):
    return (
        filter_leave_queryset(LeaveRequest.objects.all(), membership)
        .select_related("person", "policy")
        .order_by("-created_at")
    )


def list_balances(membership):
    qs = LeaveBalance.objects.filter(company=membership.company).select_related("person", "policy")
    from apps.authorization.scopes import RecordScope, managed_person_ids, scope_for_membership, LEAVE_FAMILY

    scope = scope_for_membership(membership, LEAVE_FAMILY)
    if scope is RecordScope.COMPANY:
        return qs.order_by("person__last_name", "policy__name")
    if scope is RecordScope.MANAGE:
        return qs.filter(person_id__in=managed_person_ids(membership)).order_by("person__last_name", "policy__name")
    if membership.person_id is None:
        return qs.none()
    return qs.filter(person_id=membership.person_id).order_by("policy__name")


def create_leave_request(*, membership, starts_on, ends_on, reason: str) -> LeaveRequest:
    if membership.person_id is None:
        raise conflict("Link a person before requesting leave.")
    policy = LeavePolicy.objects.filter(company=membership.company).order_by("name").first()
    if policy is None:
        raise conflict("Leave is not configured.")
    if not starts_on or not ends_on:
        raise validation_error([{"field": "starts_on", "code": "required", "message": "Enter the leave dates."}])
    starts = date.fromisoformat(str(starts_on))
    ends = date.fromisoformat(str(ends_on))
    if ends < starts:
        raise validation_error([{"field": "ends_on", "code": "invalid", "message": "End date must be on or after the start date."}])
    days = leave_days(starts, ends)
    with transaction.atomic():
        balance = ensure_balance(company=membership.company, person=membership.person, policy=policy, year=starts.year)
        remaining = int(balance.allocated_days) - int(balance.used_days)
        if days > remaining:
            raise conflict(
                "Not enough leave balance.",
                [{"field": "starts_on", "code": "balance", "message": f"{remaining} day(s) remaining for {starts.year}."}],
            )
        return LeaveRequest.objects.create(
            company=membership.company,
            person=membership.person,
            policy=policy,
            starts_on=starts,
            ends_on=ends,
            reason=(reason or "")[:500],
        )


def decide_leave_request(*, membership, request_id, decision: str, actor) -> tuple[LeaveRequest, str]:
    row = LeaveRequest.objects.filter(company=membership.company, pk=request_id).select_related("policy", "person").first()
    if row is None or not can_access_leave_request(membership, row):
        raise not_found()
    if decision not in {LeaveRequestStatus.APPROVED, LeaveRequestStatus.REJECTED}:
        raise validation_error([{"field": "status", "code": "invalid", "message": "Choose approved or rejected."}])
    previous = row.status
    with transaction.atomic():
        row = LeaveRequest.objects.select_for_update().select_related("policy", "person").get(pk=row.pk)
        previous = row.status
        if previous == decision:
            return row, previous
        if previous == LeaveRequestStatus.APPROVED and decision == LeaveRequestStatus.REJECTED:
            days = leave_days(row.starts_on, row.ends_on)
            LeaveBalance.objects.filter(
                company=row.company,
                person=row.person,
                policy=row.policy,
                year=row.starts_on.year,
                used_days__gte=days,
            ).update(used_days=F("used_days") - days)
        if decision == LeaveRequestStatus.APPROVED and previous != LeaveRequestStatus.APPROVED:
            days = leave_days(row.starts_on, row.ends_on)
            balance = ensure_balance(company=row.company, person=row.person, policy=row.policy, year=row.starts_on.year)
            remaining = int(balance.allocated_days) - int(balance.used_days)
            if days > remaining:
                raise conflict("Not enough leave balance to approve.")
            LeaveBalance.objects.filter(pk=balance.pk).update(used_days=F("used_days") + days)
        row.status = decision
        row.decided_by = actor
        row.save(update_fields=["status", "decided_by", "updated_at"])
    return row, previous


def serialize_leave_request(row: LeaveRequest) -> dict:
    return {
        "id": str(row.id),
        "person": f"{row.person.first_name} {row.person.last_name}".strip(),
        "person_id": str(row.person_id),
        "policy": row.policy.name,
        "policy_id": str(row.policy_id),
        "status": row.status,
        "starts_on": row.starts_on.isoformat(),
        "ends_on": row.ends_on.isoformat(),
        "reason": row.reason,
        "days": leave_days(row.starts_on, row.ends_on),
    }


def serialize_balance(row: LeaveBalance) -> dict:
    return {
        "id": str(row.id),
        "person": f"{row.person.first_name} {row.person.last_name}".strip(),
        "person_id": str(row.person_id),
        "policy": row.policy.name,
        "policy_id": str(row.policy_id),
        "year": row.year,
        "allocated_days": row.allocated_days,
        "used_days": row.used_days,
        "remaining_days": max(0, int(row.allocated_days) - int(row.used_days)),
    }


def _parse_date(value, field: str, *, required: bool = True):
    if value in (None, "") and not required:
        return None
    if not isinstance(value, str):
        raise validation_error([{"field": field, "code": "invalid", "message": "Enter a valid date."}])
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise validation_error([{"field": field, "code": "invalid", "message": "Enter a valid date."}]) from None


def _employment_payload(row: Employment) -> dict:
    today = timezone.localdate()
    dept_assignment = (
        row.department_assignments.filter(starts_on__lte=today)
        .filter(models.Q(ends_on__isnull=True) | models.Q(ends_on__gte=today))
        .select_related("department", "department__parent", "department__parent__unit_type")
        .order_by("-starts_on")
        .first()
    )
    dept = dept_assignment.department if dept_assignment else row.person.department
    branch_name = ""
    branch_id = None
    if dept and dept.parent:
        parent = dept.parent
        branch_name = parent.name
        branch_id = str(parent.id)

    location_assignment = (
        row.work_location_assignments.filter(starts_on__lte=today)
        .filter(models.Q(ends_on__isnull=True) | models.Q(ends_on__gte=today))
        .select_related("work_location")
        .order_by("-starts_on")
        .first()
    )
    if not branch_name and location_assignment:
        branch_name = location_assignment.work_location.name
        branch_id = str(location_assignment.work_location_id)

    reporting_line = (
        row.manager_history.filter(starts_on__lte=today)
        .filter(models.Q(ends_on__isnull=True) | models.Q(ends_on__gte=today))
        .select_related("manager__person")
        .order_by("-starts_on")
        .first()
    )
    manager_name = ""
    manager_employment_id = None
    if reporting_line:
        manager_employment_id = str(reporting_line.manager_id)
        manager_name = f"{reporting_line.manager.person.first_name} {reporting_line.manager.person.last_name}".strip()
    elif dept and dept.manager and dept.manager_id != row.person_id:
        manager_name = f"{dept.manager.first_name} {dept.manager.last_name}".strip()

    from apps.tenants.models import CompanyMembership, MembershipStatus, MembershipInvitation, InvitationStatus
    membership = (
        CompanyMembership.objects.filter(company=row.company, person=row.person)
        .exclude(status=MembershipStatus.REMOVED)
        .select_related("user")
        .first()
    )
    invitation = (
        MembershipInvitation.objects.filter(company=row.company, person=row.person, status=InvitationStatus.PENDING)
        .order_by("-created_at")
        .first()
    )
    if not invitation and row.person.work_email:
        invitation = (
            MembershipInvitation.objects.filter(company=row.company, email__iexact=row.person.work_email, status=InvitationStatus.PENDING)
            .order_by("-created_at")
            .first()
        )

    login_status = (
        "active" if membership and membership.status == "active"
        else "invited" if invitation
        else "suspended" if membership and membership.status == "suspended"
        else "no_account"
    )

    return {
        "id": str(row.id),
        "person_id": str(row.person_id),
        "person_name": f"{row.person.first_name} {row.person.last_name}".strip() or row.person.work_email,
        "person_email": row.person.work_email or "",
        "employee_number": row.employee_number,
        "employment_type": row.employment_type,
        "job_title": row.job_title or row.person.job_title,
        "status": row.status,
        "starts_on": row.starts_on.isoformat(),
        "ends_on": row.ends_on.isoformat() if row.ends_on else None,
        "legal_entity_id": str(row.legal_entity_id) if row.legal_entity_id else None,
        "legal_entity_name": row.legal_entity.name if row.legal_entity_id else "",
        "department_id": str(dept.id) if dept else None,
        "department_name": dept.name if dept else "",
        "branch_id": branch_id,
        "branch_name": branch_name,
        "work_location_id": str(location_assignment.work_location_id) if location_assignment else None,
        "work_location_name": location_assignment.work_location.name if location_assignment else "",
        "manager_id": manager_employment_id,
        "manager_employment_id": manager_employment_id,
        "manager_name": manager_name,
        "login_status": login_status,
        "has_login": bool(membership and membership.user_id),
        "invitation_status": invitation.status if invitation else "none",
        "invitation_id": str(invitation.id) if invitation else None,
    }


def serialize_employment(row: Employment) -> dict:
    return _employment_payload(row)


def activation_payload(company) -> dict:
    activation, _created = HrmsActivation.objects.get_or_create(company=company)
    leave_configured = LeavePolicy.objects.filter(company=company).exists()
    entity_configured = LegalEntity.objects.filter(company=company, status="active").exists()
    attendance_ready = (
        company.status == "active"
        and WorkLocation.objects.filter(company=company, status="active").exists()
        and Shift.objects.filter(company=company, status="active").exists()
        and WorkSchedule.objects.filter(company=company, status="active").exists()
        and AttendancePolicy.objects.filter(company=company, status="active").exists()
        and AttendancePolicyAssignment.objects.filter(company=company, policy__status="active").exists()
        and EmploymentScheduleAssignment.objects.filter(company=company).exists()
    )
    previous_readiness = activation.readiness if isinstance(activation.readiness, dict) else {}
    previous_attendance = previous_readiness.get("attendance", {})
    attendance_activated = bool(previous_attendance.get("activated")) and attendance_ready
    previous_payroll = previous_readiness.get("payroll", {})
    from apps.authorization.models import CompanyRolePermission
    from apps.tenants.models import MembershipStatus

    required_payroll_permissions = (
        "hrms.payroll.calculate",
        "hrms.payroll.approve",
        "hrms.payroll.finalize",
        "hrms.compensation.manage",
    )
    permissions_ready = all(
        CompanyRolePermission.objects.filter(
            permission_id=code,
            role__company=company,
            role__is_active=True,
            role__assignments__membership__company=company,
            role__assignments__membership__status=MembershipStatus.ACTIVE,
        ).exists()
        for code in required_payroll_permissions
    )
    payroll_ready = (
        company.status == "active"
        and entity_configured
        and SalaryStructure.objects.filter(company=company).exists()
        and CompensationAssignment.objects.filter(company=company, employment__status=EmploymentStatus.ACTIVE).exists()
        and StatutoryRuleVersion.objects.filter(company=company, is_active=True).exists()
        and PayrollPeriod.objects.filter(company=company, status=PayrollPeriodStatus.OPEN).exists()
        and permissions_ready
    )
    payroll_reasons = []
    if not entity_configured:
        payroll_reasons.append("Create an active LegalEntity.")
    if not SalaryStructure.objects.filter(company=company).exists() or not CompensationAssignment.objects.filter(company=company).exists():
        payroll_reasons.append("Configure a salary structure and an effective compensation assignment.")
    if not StatutoryRuleVersion.objects.filter(company=company, is_active=True).exists():
        payroll_reasons.append("Configure reviewed, effective-dated statutory rules; no rates are seeded by Pulse.")
    if not PayrollPeriod.objects.filter(company=company, status=PayrollPeriodStatus.OPEN).exists():
        payroll_reasons.append("Create an open payroll period.")
    if not permissions_ready:
        payroll_reasons.append("Assign explicit calculation, approval, finalization, and compensation permissions to active operators.")
    readiness = {
        "employee_leave": {
            "ready": company.status == "active" and leave_configured,
            "activated": activation.status == "active" and company.status == "active" and leave_configured,
        },
        "attendance": {
            "ready": attendance_ready,
            "activated": attendance_activated,
            "reason": "Configure an active work location, shift, schedule, policy assignment, and employee schedule." if not attendance_ready else "",
        },
        "payroll": {
            "ready": payroll_ready,
            "activated": bool(previous_payroll.get("activated")) and payroll_ready,
            "legal_entity_configured": entity_configured,
            "reasons": payroll_reasons,
        },
    }
    activation.readiness = readiness
    activation.save(update_fields=["readiness", "updated_at"])
    return {"status": activation.status, "readiness": readiness}


def activate_employee_leave(*, company, actor):
    if company.status != "active":
        raise conflict("Activate the company before enabling the HR workspace.")
    if not LeavePolicy.objects.filter(company=company).exists():
        raise conflict("Configure at least one leave policy before activation.")
    activation, _created = HrmsActivation.objects.get_or_create(company=company)
    activation.status = "active"
    activation.activated_at = timezone.now()
    activation.activated_by = actor
    activation.save(update_fields=["status", "activated_at", "activated_by", "updated_at"])
    return activation


def activate_attendance(*, company, actor):
    if company.status != "active":
        raise conflict("Activate the company before enabling attendance.")
    state = activation_payload(company)
    if not state["readiness"]["employee_leave"]["activated"]:
        raise conflict("Activate the employee and Leave workspace first.")
    if not state["readiness"]["attendance"]["ready"]:
        raise conflict("Complete the required attendance configuration before activation.")
    activation = HrmsActivation.objects.get(company=company)
    readiness = dict(activation.readiness or {})
    readiness["attendance"] = {**readiness.get("attendance", {}), "ready": True, "activated": True}
    activation.readiness = readiness
    activation.activated_by = actor
    activation.activated_at = timezone.now()
    activation.save(update_fields=["readiness", "activated_by", "activated_at", "updated_at"])
    return activation


def activate_payroll(*, company, actor):
    if company.status != "active":
        raise conflict("Activate the company before enabling payroll.")
    state = activation_payload(company)
    if not state["readiness"]["employee_leave"]["activated"]:
        raise conflict("Activate the employee and Leave workspace first.")
    if not state["readiness"]["payroll"]["ready"]:
        raise conflict("Complete all payroll readiness requirements before activation.")
    activation = HrmsActivation.objects.get(company=company)
    readiness = dict(activation.readiness or {})
    readiness["payroll"] = {**readiness.get("payroll", {}), "ready": True, "activated": True}
    activation.readiness = readiness
    activation.activated_by = actor
    activation.activated_at = timezone.now()
    activation.save(update_fields=["readiness", "activated_by", "activated_at", "updated_at"])
    return activation


def _managed_employment_ids(manager_employment: Employment, *, on_date: date) -> set:
    """Resolve indirect reports from effective-dated primary reporting lines."""
    found = {manager_employment.id}
    frontier = {manager_employment.id}
    while frontier:
        direct = set(
            EmploymentReportingLine.objects.filter(
                company_id=manager_employment.company_id,
                manager_id__in=frontier,
                starts_on__lte=on_date,
            )
            .filter(models.Q(ends_on__isnull=True) | models.Q(ends_on__gte=on_date))
            .values_list("report_id", flat=True)
        )
        frontier = direct - found
        found.update(frontier)
        if len(found) > 10000:
            raise conflict("The reporting hierarchy exceeds the supported traversal limit.")
    return found


def list_employments(membership, *, manager_employment_id=None):
    from apps.authorization.scopes import EMPLOYMENT_FAMILY

    scope = scope_for_membership(membership, EMPLOYMENT_FAMILY)
    rows = Employment.objects.filter(company=membership.company).select_related("person", "legal_entity")
    if scope is RecordScope.COMPANY:
        return rows.order_by("person__last_name", "person__first_name", "starts_on")
    if scope is RecordScope.MANAGE:
        manager_ids = list(
            Employment.objects.filter(
                company=membership.company,
                person_id=membership.person_id,
                status=EmploymentStatus.ACTIVE,
            ).values_list("id", flat=True)
        )
        if manager_employment_id:
            selected = Employment.objects.filter(
                company=membership.company,
                person_id=membership.person_id,
                status=EmploymentStatus.ACTIVE,
                pk=manager_employment_id,
            ).first()
            if selected is None:
                raise not_found("That Employment context was not found.")
            manager_ids = [selected.id]
        elif len(manager_ids) > 1:
            raise validation_error(
                [{"field": "manager_employment_id", "code": "required", "message": "Choose a manager Employment context."}]
            )
        if not manager_ids:
            return rows.none()
        visible_ids = set()
        for manager_id in manager_ids:
            manager = Employment.objects.get(company=membership.company, pk=manager_id)
            visible_ids.update(_managed_employment_ids(manager, on_date=timezone.localdate()))
        return rows.filter(pk__in=visible_ids).order_by("person__last_name", "person__first_name", "starts_on")
    if membership.person_id is None:
        return rows.none()
    return rows.filter(person_id=membership.person_id).order_by("-starts_on")


def get_employment(membership, employment_id, *, manager_employment_id=None) -> Employment:
    row = Employment.objects.filter(company=membership.company, pk=employment_id).select_related("person", "legal_entity").first()
    if row is None:
        raise not_found("That Employment was not found.")
    if not list_employments(membership, manager_employment_id=manager_employment_id).filter(pk=row.pk).exists():
        raise not_found("That Employment was not found.")
    return row


def create_employment(*, company, actor, payload: dict) -> Employment:
    if not isinstance(payload, dict):
        raise validation_error([{"field": "", "code": "invalid", "message": "Send a JSON object."}])
    person = Person.objects.filter(company=company, pk=payload.get("person_id")).first()
    if person is None:
        raise not_found("That Person was not found.")

    status = payload.get("status") or EmploymentStatus.DRAFT
    if status not in {choice.value for choice in EmploymentStatus}:
        raise validation_error([{"field": "status", "code": "invalid", "message": "Choose a valid Employment status."}])
    if status == EmploymentStatus.ACTIVE and Employment.objects.filter(company=company, person=person, status=EmploymentStatus.ACTIVE).exists():
        raise conflict(
            "This person already has an active employee profile in this company.",
            [{"field": "person_id", "code": "duplicate", "message": "This person already has an active employee profile."}],
        )

    entity_id = payload.get("legal_entity_id") or None
    legal_entity = None
    if entity_id:
        legal_entity = LegalEntity.objects.filter(company=company, pk=entity_id).first()
        if legal_entity is None:
            raise not_found("That LegalEntity was not found.")
    elif status == EmploymentStatus.ACTIVE:
        legal_entity = LegalEntity.objects.filter(company=company, status="active").first()

    if status == EmploymentStatus.ACTIVE and (legal_entity is None or legal_entity.status != "active"):
        raise conflict("An active Employment requires an active same-company LegalEntity.")

    starts_on = _parse_date(payload.get("starts_on"), "starts_on")
    ends_on = _parse_date(payload.get("ends_on"), "ends_on", required=False)
    if ends_on and ends_on < starts_on:
        raise validation_error([{"field": "ends_on", "code": "invalid", "message": "End date must be on or after the start date."}])

    employee_number = payload.get("employee_number", "")
    if not isinstance(employee_number, str) or not employee_number.strip():
        user_suffix = str(person.id.hex)[:6].upper()
        employee_number = f"EMP-{user_suffix}"
        counter = 1
        base_num = employee_number
        while Employment.objects.filter(company=company, employee_number=employee_number).exists():
            employee_number = f"{base_num}-{counter}"
            counter += 1

    employment_type = payload.get("employment_type", "full_time") or "full_time"
    job_title = payload.get("job_title") or person.job_title or "Team Member"
    for field, value, maximum in (
        ("employee_number", employee_number, 64),
        ("employment_type", employment_type, 64),
        ("job_title", job_title, 150),
    ):
        if not isinstance(value, str) or len(value) > maximum:
            raise validation_error([{"field": field, "code": "invalid", "message": f"Enter text up to {maximum} characters."}])

    department_id = payload.get("department_id") or (str(person.department_id) if person.department_id else None)
    department = None
    if department_id:
        department = Department.objects.filter(company=company, pk=department_id).first()
        if department is None:
            raise not_found("That Department was not found.")

    work_location_id = payload.get("work_location_id")
    work_location = None
    if work_location_id:
        work_location = WorkLocation.objects.filter(company=company, pk=work_location_id).first()
        if work_location is None:
            raise not_found("That WorkLocation was not found.")

    manager_employment_id = payload.get("manager_employment_id")
    manager = None
    if manager_employment_id:
        manager = Employment.objects.filter(company=company, pk=manager_employment_id).first()
        if manager is None:
            raise not_found("That Manager was not found.")

    try:
        with transaction.atomic():
            row = Employment.objects.create(
                company=company,
                person=person,
                legal_entity=legal_entity,
                employee_number=employee_number.strip(),
                employment_type=employment_type.strip(),
                job_title=job_title.strip(),
                status=status,
                starts_on=starts_on,
                ends_on=ends_on,
                created_by=actor,
            )

            # Department Assignment & Person synchronization
            if department:
                EmploymentDepartmentAssignment.objects.create(
                    company=company,
                    employment=row,
                    department=department,
                    starts_on=starts_on,
                )
                if person.department_id != department.id:
                    person.department = department
                    person.save(update_fields=["department", "updated_at"])

            # Work Location Assignment
            if work_location:
                EmploymentWorkLocationAssignment.objects.create(
                    company=company,
                    employment=row,
                    work_location=work_location,
                    starts_on=starts_on,
                )

            # Reporting Line
            if manager:
                if manager.id == row.id:
                    raise validation_error([{"field": "manager_employment_id", "code": "invalid", "message": "An employee cannot report to themselves."}])
                EmploymentReportingLine.objects.create(
                    company=company,
                    manager=manager,
                    report=row,
                    starts_on=starts_on,
                    created_by=actor,
                )

            EmploymentHistory.objects.create(
                company=company,
                employment=row,
                action="employment.created",
                after=_employment_payload(row),
                actor=actor,
            )
    except IntegrityError as exc:
        if "hrms_employments_company_number_unique" in str(exc):
            raise conflict("That employee number is already in use.") from exc
        raise
    return row


def sync_company_memberships_to_employments(*, company, actor=None) -> list[Employment]:
    """
    Ensures every platform member (CompanyMembership) has an associated Employment in the company.
    If no active LegalEntity exists, provisions a default active primary LegalEntity.
    Creates active Employment records for members who do not yet have an Employment.
    """
    from apps.tenants.models import LegalEntity, LegalEntityStatus, CompanyMembership, MembershipStatus
    from apps.organization.models import Person, PersonStatus
    from django.contrib.auth import get_user_model
    from apps.authorization.company import assign_default_member_role
    from django.utils.text import slugify

    User = get_user_model()

    # 1. Ensure an active LegalEntity exists for the company
    primary_entity = LegalEntity.objects.filter(company=company, status=LegalEntityStatus.ACTIVE).first()
    if primary_entity is None:
        entity_name = (company.legal_name or company.display_name or "Primary Entity").strip()
        code_slug = slugify(entity_name)[:60] or "primary"
        base_code = code_slug
        counter = 1
        while LegalEntity.objects.filter(company=company, code=code_slug).exists():
            code_slug = f"{base_code[:55]}-{counter}"
            counter += 1
        primary_entity = LegalEntity.objects.create(
            company=company,
            name=entity_name[:180],
            code=code_slug,
            status=LegalEntityStatus.ACTIVE,
            country_code="IN",
            created_by=actor if getattr(actor, "is_authenticated", False) else None,
        )

    # 2. Ensure all active platform users are members of this company
    for u in User.objects.filter(is_active=True):
        m = CompanyMembership.objects.filter(company=company, user=u).first()
        if m is None:
            m = CompanyMembership.objects.create(
                company=company,
                user=u,
                status=MembershipStatus.ACTIVE,
            )
            assign_default_member_role(m, assigned_by=actor if getattr(actor, "is_authenticated", False) else None)

    # 3. Iterate through company memberships
    memberships = (
        CompanyMembership.objects.filter(company=company)
        .exclude(status=MembershipStatus.REMOVED)
        .select_related("person", "user")
        .order_by("created_at")
    )
    created_employments = []
    today = timezone.localdate()

    with transaction.atomic():
        for index, membership in enumerate(memberships, start=1):
            person = membership.person
            # If membership lacks a person, find or create one
            if person is None:
                first_name = (membership.user.first_name if hasattr(membership.user, "first_name") else "") or membership.user.email.split("@")[0]
                last_name = membership.user.last_name if hasattr(membership.user, "last_name") else ""
                person = Person.objects.create(
                    company=company,
                    first_name=first_name[:100],
                    last_name=last_name[:100],
                    work_email=membership.user.email[:254],
                    status=PersonStatus.ACTIVE,
                )
                membership.person = person
                membership.save(update_fields=["person", "updated_at"])

            # Check if this person already has an Employment in this company
            existing = Employment.objects.filter(company=company, person=person).first()
            if existing is not None:
                # If it's a draft without legal_entity, connect it
                if existing.legal_entity is None and primary_entity:
                    existing.legal_entity = primary_entity
                    if existing.status == EmploymentStatus.DRAFT:
                        existing.status = EmploymentStatus.ACTIVE
                    existing.save(update_fields=["legal_entity", "status", "updated_at"])
                continue

            # Generate unique employee number
            user_suffix = str(membership.id.hex)[:6].upper()
            emp_number = f"EMP-{user_suffix}"
            if Employment.objects.filter(company=company, employee_number=emp_number).exists():
                emp_number = f"EMP-{user_suffix}-{index}"

            job_title = (getattr(person, "job_title", "") or "").strip()
            if not job_title:
                if "admin" in membership.user.email.lower():
                    job_title = "HR Administrator"
                else:
                    job_title = "Team Member"
            starts_on = membership.created_at.date() if getattr(membership, "created_at", None) else today

            employment = Employment.objects.create(
                company=company,
                person=person,
                legal_entity=primary_entity,
                employee_number=emp_number[:64],
                employment_type="full_time",
                job_title=job_title[:150],
                status=EmploymentStatus.ACTIVE,
                starts_on=starts_on,
                created_by=actor if getattr(actor, "is_authenticated", False) else None,
            )
            EmploymentHistory.objects.create(
                company=company,
                employment=employment,
                action="employment.created",
                after=_employment_payload(employment),
                actor=actor if getattr(actor, "is_authenticated", False) else None,
            )
            created_employments.append(employment)

    return created_employments


def transition_employment(*, company, employment_id, status: str, actor) -> Employment:
    allowed = {
        EmploymentStatus.DRAFT: {EmploymentStatus.PENDING, EmploymentStatus.ACTIVE, EmploymentStatus.CANCELLED},
        EmploymentStatus.PENDING: {EmploymentStatus.ACTIVE, EmploymentStatus.CANCELLED},
        EmploymentStatus.ACTIVE: {EmploymentStatus.ON_LEAVE, EmploymentStatus.SUSPENDED, EmploymentStatus.ENDED},
        EmploymentStatus.ON_LEAVE: {EmploymentStatus.ACTIVE, EmploymentStatus.SUSPENDED, EmploymentStatus.ENDED},
        EmploymentStatus.SUSPENDED: {EmploymentStatus.ACTIVE, EmploymentStatus.ENDED},
        EmploymentStatus.ENDED: set(),
        EmploymentStatus.CANCELLED: set(),
    }
    if status not in {choice.value for choice in EmploymentStatus}:
        raise validation_error([{"field": "status", "code": "invalid", "message": "Choose a valid Employment status."}])
    with transaction.atomic():
        row = Employment.objects.select_for_update().filter(company=company, pk=employment_id).select_related("person", "legal_entity").first()
        if row is None:
            raise not_found("That Employment was not found.")
        if status == row.status:
            return row
        if status not in allowed[row.status]:
            raise conflict(f"Employment cannot transition from {row.status} to {status}.")
        if status == EmploymentStatus.ACTIVE and (row.legal_entity is None or row.legal_entity.status != "active"):
            raise conflict("An active Employment requires an active same-company LegalEntity.")
        before = _employment_payload(row)
        row.status = status
        if status == EmploymentStatus.ENDED and row.ends_on is None:
            row.ends_on = timezone.localdate()
        row.save(update_fields=["status", "ends_on", "updated_at"])
        EmploymentHistory.objects.create(
            company=company,
            employment=row,
            action="employment.status_changed",
            before=before,
            after=_employment_payload(row),
            actor=actor,
        )
    return row


def assign_employment_legal_entity(*, company, employment_id, legal_entity_id, actor) -> Employment:
    with transaction.atomic():
        row = Employment.objects.select_for_update().filter(company=company, pk=employment_id).select_related(
            "person", "legal_entity"
        ).first()
        if row is None:
            raise not_found("That Employment was not found.")
        if row.status not in {EmploymentStatus.DRAFT, EmploymentStatus.PENDING}:
            raise conflict("LegalEntity can only be assigned before Employment activation.")
        entity = LegalEntity.objects.filter(company=company, pk=legal_entity_id, status="active").first()
        if entity is None:
            raise not_found("That active LegalEntity was not found.")
        before = _employment_payload(row)
        row.legal_entity = entity
        row.save(update_fields=["legal_entity", "updated_at"])
        EmploymentHistory.objects.create(
            company=company,
            employment=row,
            action="employment.legal_entity_assigned",
            before=before,
            after=_employment_payload(row),
            actor=actor,
        )
    return row


def assign_employment_department(*, company, employment_id, department_id, starts_on, actor) -> EmploymentDepartmentAssignment:
    effective_date = _parse_date(starts_on, "starts_on")
    with transaction.atomic():
        row = Employment.objects.select_for_update().filter(company=company, pk=employment_id).select_related("person").first()
        if row is None:
            raise not_found("That Employment was not found.")
        department = Department.objects.filter(company=company, pk=department_id).first()
        if department is None:
            raise not_found("That Department was not found.")
        current = EmploymentDepartmentAssignment.objects.select_for_update().filter(
            company=company,
            employment=row,
            ends_on__isnull=True,
            starts_on__lte=effective_date,
        ).order_by("-starts_on").first()
        if current and current.department_id == department.id:
            if row.person.department_id != department.id:
                row.person.department = department
                row.person.save(update_fields=["department", "updated_at"])
            return current
        if current:
            current.ends_on = effective_date - timedelta(days=1)
            current.save(update_fields=["ends_on"])
        assignment = EmploymentDepartmentAssignment.objects.create(
            company=company,
            employment=row,
            department=department,
            starts_on=effective_date,
        )
        if row.person.department_id != department.id:
            row.person.department = department
            row.person.save(update_fields=["department", "updated_at"])
        EmploymentHistory.objects.create(
            company=company,
            employment=row,
            action="employment.department_assigned",
            after={"department_id": str(department.id), "starts_on": effective_date.isoformat()},
            actor=actor,
        )
    return assignment


def assign_employment_location(*, company, employment_id, location_id, starts_on, actor) -> EmploymentWorkLocationAssignment:
    effective_date = _parse_date(starts_on, "starts_on")
    with transaction.atomic():
        row = Employment.objects.select_for_update().filter(company=company, pk=employment_id).first()
        if row is None:
            raise not_found("That Employment was not found.")
        location = WorkLocation.objects.filter(company=company, pk=location_id, status="active").first()
        if location is None:
            raise not_found("That WorkLocation was not found.")
        current = EmploymentWorkLocationAssignment.objects.select_for_update().filter(
            company=company,
            employment=row,
            ends_on__isnull=True,
            starts_on__lte=effective_date,
        ).order_by("-starts_on").first()
        if current and current.work_location_id == location.id:
            return current
        if current:
            current.ends_on = effective_date - timedelta(days=1)
            current.save(update_fields=["ends_on"])
        assignment = EmploymentWorkLocationAssignment.objects.create(
            company=company,
            employment=row,
            work_location=location,
            starts_on=effective_date,
        )
        EmploymentHistory.objects.create(
            company=company,
            employment=row,
            action="employment.location_assigned",
            after={"work_location_id": str(location.id), "starts_on": effective_date.isoformat()},
            actor=actor,
        )
    return assignment


def assign_reporting_line(*, company, manager_id, report_id, starts_on, actor) -> EmploymentReportingLine:
    effective_date = _parse_date(starts_on, "starts_on")
    with transaction.atomic():
        employments = list(Employment.objects.select_for_update().filter(company=company).order_by("id"))
        by_id = {row.id: row for row in employments}
        manager = by_id.get(manager_id)
        report = by_id.get(report_id)
        if manager is None or report is None:
            raise not_found("That Employment was not found.")
        if manager.id == report.id:
            raise conflict("An Employment cannot report to itself.")
        if manager.status != EmploymentStatus.ACTIVE or report.status not in {EmploymentStatus.ACTIVE, EmploymentStatus.PENDING}:
            raise conflict("Reporting lines require an active manager and an active or pending report.")
        cursor = manager.id
        visited = set()
        while cursor not in visited:
            if cursor == report.id:
                raise conflict("That reporting line would create a hierarchy cycle.")
            visited.add(cursor)
            parent = (
                EmploymentReportingLine.objects.filter(company=company, report_id=cursor, starts_on__lte=effective_date)
                .filter(models.Q(ends_on__isnull=True) | models.Q(ends_on__gte=effective_date))
                .order_by("-starts_on")
                .first()
            )
            if parent is None:
                break
            cursor = parent.manager_id
        current = EmploymentReportingLine.objects.select_for_update().filter(
            company=company,
            report=report,
            ends_on__isnull=True,
        ).order_by("-starts_on").first()
        if current and current.manager_id == manager.id:
            return current
        if current:
            current.ends_on = effective_date - timedelta(days=1)
            current.save(update_fields=["ends_on"])
        line = EmploymentReportingLine.objects.create(
            company=company,
            manager=manager,
            report=report,
            starts_on=effective_date,
            created_by=actor,
        )
        EmploymentHistory.objects.create(
            company=company,
            employment=report,
            action="employment.reporting_changed",
            before={"manager_employment_id": str(current.manager_id)} if current else None,
            after={"manager_employment_id": str(manager.id), "starts_on": effective_date.isoformat()},
            actor=actor,
        )
    return line


def list_legal_entities(company):
    return company.legal_entities.order_by("name")


def list_work_locations(company):
    return WorkLocation.objects.filter(company=company).order_by("name")


def create_legal_entity(*, company, actor, payload: dict):
    name = payload.get("name") if isinstance(payload, dict) else None
    code = payload.get("code") if isinstance(payload, dict) else None
    if not isinstance(name, str) or not name.strip() or not isinstance(code, str) or not code.strip():
        raise validation_error([{"field": "name", "code": "required", "message": "Enter a name and code."}])
    status = payload.get("status", "draft")
    if status not in {"draft", "active", "inactive"}:
        raise validation_error([{"field": "status", "code": "invalid", "message": "Choose draft, active, or inactive."}])
    from apps.tenants.models import LegalEntity

    try:
        return LegalEntity.objects.create(
            company=company,
            name=name.strip()[:180],
            code=code.strip().lower()[:64],
            status=status,
            country_code=str(payload.get("country_code") or "IN").upper()[:2],
            created_by=actor,
        )
    except IntegrityError as exc:
        raise conflict("A LegalEntity with that name or code already exists.") from exc


def create_work_location(*, company, payload: dict):
    if not isinstance(payload, dict):
        raise validation_error([{"field": "", "code": "invalid", "message": "Send a JSON object."}])
    name = payload.get("name")
    code = payload.get("code")
    timezone_name = payload.get("timezone") or ""
    if not isinstance(name, str) or not name.strip() or not isinstance(code, str) or not code.strip():
        raise validation_error([{"field": "name", "code": "required", "message": "Enter a name and code."}])
    if not isinstance(timezone_name, str):
        raise validation_error([{"field": "timezone", "code": "invalid", "message": "Enter a timezone name."}])
    try:
        return WorkLocation.objects.create(
            company=company,
            name=name.strip()[:150],
            code=code.strip().lower()[:64],
            address=str(payload.get("address") or "")[:4000],
            timezone=timezone_name.strip()[:64],
        )
    except IntegrityError as exc:
        raise conflict("A WorkLocation with that name or code already exists.") from exc


def create_shift(*, company, payload: dict) -> Shift:
    if not isinstance(payload, dict):
        raise validation_error([{"field": "", "code": "invalid", "message": "Send a JSON object."}])
    name = payload.get("name")
    code = payload.get("code")
    try:
        starts_at = time.fromisoformat(payload.get("starts_at"))
        ends_at = time.fromisoformat(payload.get("ends_at"))
    except (TypeError, ValueError):
        raise validation_error([{"field": "starts_at", "code": "invalid", "message": "Enter valid local shift start and end times."}]) from None
    grace = payload.get("grace_minutes", 0)
    if not isinstance(name, str) or not name.strip() or not isinstance(code, str) or not code.strip():
        raise validation_error([{"field": "name", "code": "required", "message": "Enter a shift name and code."}])
    if isinstance(grace, bool) or not isinstance(grace, int) or not 0 <= grace <= 180:
        raise validation_error([{"field": "grace_minutes", "code": "invalid", "message": "Grace minutes must be between 0 and 180."}])
    try:
        return Shift.objects.create(
            company=company,
            name=name.strip()[:120],
            code=code.strip().lower()[:64],
            starts_at=starts_at,
            ends_at=ends_at,
            grace_minutes=grace,
        )
    except IntegrityError as exc:
        raise conflict("A shift with that name or code already exists.") from exc


def create_work_schedule(*, company, payload: dict) -> WorkSchedule:
    if not isinstance(payload, dict):
        raise validation_error([{"field": "", "code": "invalid", "message": "Send a JSON object."}])
    name = payload.get("name")
    weekdays = payload.get("weekdays")
    if not isinstance(name, str) or not name.strip():
        raise validation_error([{"field": "name", "code": "required", "message": "Enter a schedule name."}])
    if not isinstance(weekdays, list) or not weekdays or any(
        isinstance(day, bool) or not isinstance(day, int) or day < 0 or day > 6 for day in weekdays
    ):
        raise validation_error([{"field": "weekdays", "code": "invalid", "message": "Choose one or more weekdays from 0 to 6."}])
    try:
        return WorkSchedule.objects.create(company=company, name=name.strip()[:120], weekdays=sorted(set(weekdays)))
    except IntegrityError as exc:
        raise conflict("A work schedule with that name already exists.") from exc


def create_attendance_policy(*, company, payload: dict) -> AttendancePolicy:
    if not isinstance(payload, dict):
        raise validation_error([{"field": "", "code": "invalid", "message": "Send a JSON object."}])
    name = payload.get("name")
    methods = payload.get("allowed_methods")
    fallbacks = payload.get("fallback_methods", [])
    supported = {"manual", "gps", "qr", "device"}
    if not isinstance(name, str) or not name.strip():
        raise validation_error([{"field": "name", "code": "required", "message": "Enter a policy name."}])
    if not isinstance(methods, list) or not methods or any(not isinstance(method, str) or method not in supported for method in methods):
        raise validation_error([{"field": "allowed_methods", "code": "invalid", "message": "Choose supported methods: manual, GPS, QR, or device."}])
    if not isinstance(fallbacks, list) or any(not isinstance(method, str) or method not in methods for method in fallbacks):
        raise validation_error([{"field": "fallback_methods", "code": "invalid", "message": "Fallback methods must also be allowed methods."}])
    try:
        return AttendancePolicy.objects.create(
            company=company,
            name=name.strip()[:120],
            allowed_methods=sorted(set(methods)),
            fallback_methods=sorted(set(fallbacks)),
        )
    except IntegrityError as exc:
        raise conflict("An attendance policy with that name already exists.") from exc


def assign_attendance_policy(*, company, policy_id, starts_on, work_location_id=None, shift_id=None, employment_id=None, employee_group=""):
    effective_date = _parse_date(starts_on, "starts_on")
    policy = AttendancePolicy.objects.filter(company=company, pk=policy_id, status="active").first()
    if policy is None:
        raise not_found("That active attendance policy was not found.")
    dimensions = [bool(work_location_id), bool(shift_id), bool(employment_id), bool(employee_group)]
    if sum(dimensions) > 1:
        raise validation_error([{"field": "scope", "code": "invalid", "message": "Choose one assignment scope."}])
    location = WorkLocation.objects.filter(company=company, pk=work_location_id, status="active").first() if work_location_id else None
    shift = Shift.objects.filter(company=company, pk=shift_id, status="active").first() if shift_id else None
    employment = Employment.objects.filter(company=company, pk=employment_id).first() if employment_id else None
    if (work_location_id and location is None) or (shift_id and shift is None) or (employment_id and employment is None):
        raise not_found("The attendance assignment target was not found in this company.")
    criteria = {
        "company": company,
        "policy": policy,
        "work_location": location,
        "shift": shift,
        "employment": employment,
        "employee_group": employee_group.strip(),
    }
    existing = AttendancePolicyAssignment.objects.filter(**criteria, starts_on__lte=effective_date).filter(
        models.Q(ends_on__isnull=True) | models.Q(ends_on__gte=effective_date)
    ).first()
    if existing:
        raise conflict("An attendance policy assignment already applies at this scope and date.")
    return AttendancePolicyAssignment.objects.create(**criteria, starts_on=effective_date)


def assign_employment_schedule(*, company, employment_id, schedule_id, shift_id, starts_on):
    effective_date = _parse_date(starts_on, "starts_on")
    with transaction.atomic():
        employment = Employment.objects.select_for_update().filter(company=company, pk=employment_id).first()
        schedule = WorkSchedule.objects.filter(company=company, pk=schedule_id, status="active").first()
        shift = Shift.objects.filter(company=company, pk=shift_id, status="active").first()
        if employment is None or schedule is None or shift is None:
            raise not_found("The Employment, schedule, or shift was not found in this company.")
        assignments = EmploymentScheduleAssignment.objects.select_for_update().filter(
            company=company,
            employment=employment,
        ).order_by("starts_on")
        current = assignments.filter(ends_on__isnull=True, starts_on__lte=effective_date).order_by("-starts_on").first()
        if assignments.filter(starts_on__gte=effective_date).exists():
            raise conflict("Schedule changes cannot be inserted before a future assignment.")
        if current and effective_date <= current.starts_on:
            raise conflict("A new schedule must start after the current assignment starts.")
        if current:
            current.ends_on = effective_date - timedelta(days=1)
            current.save(update_fields=["ends_on"])
        return EmploymentScheduleAssignment.objects.create(
            company=company,
            employment=employment,
            schedule=schedule,
            shift=shift,
            starts_on=effective_date,
        )


def create_company_holiday(*, company, name, holiday_date, work_location_id=None):
    effective_date = _parse_date(holiday_date, "holiday_date")
    if not isinstance(name, str) or not name.strip():
        raise validation_error([{"field": "name", "code": "required", "message": "Enter a holiday name."}])
    location = None
    if work_location_id:
        location = WorkLocation.objects.filter(company=company, pk=work_location_id).first()
        if location is None:
            raise not_found("That WorkLocation was not found.")
    try:
        from apps.hrms.models import CompanyHoliday

        return CompanyHoliday.objects.create(
            company=company,
            work_location=location,
            name=name.strip()[:150],
            holiday_date=effective_date,
        )
    except IntegrityError as exc:
        raise conflict("A holiday already exists for that location and date.") from exc


def _attendance_timestamp(value) -> datetime:
    if not isinstance(value, str):
        raise validation_error([{"field": "occurred_at", "code": "required", "message": "Enter an ISO-8601 timestamp with timezone."}])
    try:
        timestamp = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise validation_error([{"field": "occurred_at", "code": "invalid", "message": "Enter a valid ISO-8601 timestamp."}]) from None
    if timezone.is_naive(timestamp):
        raise validation_error([{"field": "occurred_at", "code": "timezone_required", "message": "The timestamp must include a timezone."}])
    return timestamp


def _attendance_schedule(company, employment, timestamp):
    location_assignment = (
        EmploymentWorkLocationAssignment.objects.filter(company=company, employment=employment, starts_on__lte=timestamp.date())
        .filter(models.Q(ends_on__isnull=True) | models.Q(ends_on__gte=timestamp.date()))
        .select_related("work_location")
        .order_by("-starts_on")
        .first()
    )
    timezone_name = (location_assignment.work_location.timezone if location_assignment else "") or company.timezone
    try:
        work_date = timestamp.astimezone(ZoneInfo(timezone_name)).date()
    except (ZoneInfoNotFoundError, ValueError):
        raise conflict("The assigned work timezone is invalid.") from None
    schedule_assignment = (
        EmploymentScheduleAssignment.objects.filter(company=company, employment=employment, starts_on__lte=work_date)
        .filter(models.Q(ends_on__isnull=True) | models.Q(ends_on__gte=work_date))
        .select_related("schedule", "shift")
        .order_by("-starts_on")
        .first()
    )
    return timezone_name, location_assignment.work_location if location_assignment else None, work_date, schedule_assignment


def resolve_attendance_policy(*, company, employment, work_location, shift, on_date):
    assignments = AttendancePolicyAssignment.objects.filter(
        company=company,
        starts_on__lte=on_date,
        policy__status="active",
    ).filter(models.Q(ends_on__isnull=True) | models.Q(ends_on__gte=on_date)).select_related("policy")
    candidates = []
    group = employment.employment_type.strip().casefold()
    for assignment in assignments:
        if assignment.employment_id:
            if assignment.employment_id != employment.id:
                continue
            rank = 4
        elif assignment.employee_group:
            if assignment.employee_group.casefold() != group:
                continue
            rank = 3
        elif assignment.shift_id:
            if shift is None or assignment.shift_id != shift.id:
                continue
            rank = 2
        elif assignment.work_location_id:
            if work_location is None or assignment.work_location_id != work_location.id:
                continue
            rank = 1
        else:
            rank = 0
        candidates.append((rank, assignment.policy))
    if not candidates:
        raise conflict("No active attendance policy applies to this Employment.")
    rank = max(candidate_rank for candidate_rank, _policy in candidates)
    policies = {policy.id: policy for candidate_rank, policy in candidates if candidate_rank == rank}
    if len(policies) != 1:
        raise conflict("Conflicting attendance policies apply at the same specificity.")
    return next(iter(policies.values()))


def _validate_attendance_method(policy, method):
    if not isinstance(method, str) or method not in set(policy.allowed_methods or []):
        raise validation_error([{"field": "verification_method", "code": "not_allowed", "message": "This method is not allowed by the attendance policy."}])
    if method not in {"manual", "gps", "qr", "device", "face"}:
        raise validation_error([{"field": "verification_method", "code": "invalid", "message": "Choose a supported verification method."}])


def _attendance_result(event, session, summary, *, replay=False):
    return {
        "event_id": str(event.id),
        "event_type": event.event_type,
        "occurred_at": event.occurred_at.isoformat(),
        "verification_status": event.verification_status,
        "session_id": str(session.id) if session else None,
        "session_status": session.status if session else None,
        "daily_summary": {
            "work_date": summary.work_date.isoformat(),
            "status": summary.status,
            "minutes_worked": summary.minutes_worked,
        } if summary else None,
        "idempotent_replay": replay,
    }


def _rebuild_attendance_summary(*, company, employment, work_date, timezone_name):
    sessions = AttendanceSession.objects.filter(company=company, employment=employment, work_date=work_date)
    has_exceptions = AttendanceException.objects.filter(
        company=company,
        employment=employment,
        status="open",
        event__occurred_at__date=work_date,
    ).exists()
    has_incomplete = sessions.filter(
        status__in=[AttendanceSessionStatus.OPEN, AttendanceSessionStatus.PROVISIONAL, AttendanceSessionStatus.PENDING_REVIEW]
    ).exists()
    status = AttendanceSessionStatus.PENDING_REVIEW if has_exceptions else (
        AttendanceSessionStatus.PROVISIONAL if has_incomplete else AttendanceSessionStatus.COMPLETE
    )
    summary, _created = AttendanceDailySummary.objects.update_or_create(
        company=company,
        employment=employment,
        work_date=work_date,
        defaults={
            "status": status,
            "timezone_name": timezone_name,
            "minutes_worked": sum(sessions.values_list("minutes_worked", flat=True)),
            "session_count": sessions.count(),
        },
    )
    return summary


def _existing_attendance_event(*, company, actor, event_key, employment, event_type):
    if not isinstance(event_key, str) or not event_key.strip():
        raise validation_error([{"field": "event_key", "code": "required", "message": "Send an idempotency event key."}])
    existing = AttendanceEvent.objects.filter(
        company=company,
        source=AttendanceEventSource.EMPLOYEE,
        source_id=str(actor.id),
        event_key=event_key.strip(),
    ).first()
    if existing and (existing.employment_id != employment.id or existing.event_type != event_type):
        raise conflict("That event key was already used for a different attendance operation.")
    return existing


def _new_attendance_event(*, company, employment, actor, event_type, timestamp, timezone_name, method, event_key):
    return AttendanceEvent.objects.create(
        company=company,
        employment=employment,
        actor=actor,
        event_type=event_type,
        source=AttendanceEventSource.EMPLOYEE,
        source_id=str(actor.id),
        event_key=event_key.strip(),
        occurred_at=timestamp,
        timezone_name=timezone_name,
        verification_method=method,
        verification_status=VerificationStatus.PENDING,
        evidence_metadata={"capture": "employee_self_service"},
    )


def check_in(*, membership, employment_id, occurred_at, event_key, verification_method, actor):
    employment = Employment.objects.filter(
        company=membership.company,
        pk=employment_id,
        person_id=membership.person_id,
        status=EmploymentStatus.ACTIVE,
    ).first()
    if employment is None:
        raise not_found("That active Employment was not found for this membership.")
    timestamp = _attendance_timestamp(occurred_at)
    timezone_name, location, work_date, schedule = _attendance_schedule(membership.company, employment, timestamp)
    shift = schedule.shift if schedule else None
    policy = resolve_attendance_policy(
        company=membership.company,
        employment=employment,
        work_location=location,
        shift=shift,
        on_date=work_date,
    )
    _validate_attendance_method(policy, verification_method)
    with transaction.atomic():
        existing = _existing_attendance_event(
            company=membership.company,
            actor=actor,
            event_key=event_key,
            employment=employment,
            event_type=AttendanceEventType.CHECK_IN,
        )
        if existing:
            session = AttendanceSession.objects.filter(company=membership.company, check_in_event=existing).first()
            summary = _rebuild_attendance_summary(
                company=membership.company,
                employment=employment,
                work_date=existing.occurred_at.astimezone(ZoneInfo(existing.timezone_name or timezone_name)).date(),
                timezone_name=existing.timezone_name or timezone_name,
            )
            return _attendance_result(existing, session, summary, replay=True)
        event = _new_attendance_event(
            company=membership.company,
            employment=employment,
            actor=actor,
            event_type=AttendanceEventType.CHECK_IN,
            timestamp=timestamp,
            timezone_name=timezone_name,
            method=verification_method,
            event_key=event_key,
        )
        open_session = AttendanceSession.objects.select_for_update().filter(
            company=membership.company,
            employment=employment,
            check_out_event__isnull=True,
            status__in=[AttendanceSessionStatus.OPEN, AttendanceSessionStatus.PROVISIONAL, AttendanceSessionStatus.PENDING_REVIEW],
        ).order_by("-work_date", "-sequence").first()
        if open_session:
            AttendanceException.objects.create(
                company=membership.company,
                employment=employment,
                event=event,
                session=open_session,
                code="duplicate_check_in",
                details={"existing_session_id": str(open_session.id)},
            )
            summary = _rebuild_attendance_summary(
                company=membership.company,
                employment=employment,
                work_date=work_date,
                timezone_name=timezone_name,
            )
            return _attendance_result(event, open_session, summary)
        sequence = (
            AttendanceSession.objects.filter(company=membership.company, employment=employment, work_date=work_date)
            .order_by("-sequence")
            .values_list("sequence", flat=True)
            .first()
            or 0
        ) + 1
        session = AttendanceSession.objects.create(
            company=membership.company,
            employment=employment,
            shift=shift,
            work_date=work_date,
            sequence=sequence,
            check_in_event=event,
            status=AttendanceSessionStatus.PROVISIONAL,
            timezone_name=timezone_name,
        )
        AttendanceException.objects.create(
            company=membership.company,
            employment=employment,
            event=event,
            session=session,
            code="verification_pending",
            details={"method": verification_method},
        )
        if schedule is None:
            AttendanceException.objects.create(
                company=membership.company,
                employment=employment,
                event=event,
                session=session,
                code="schedule_missing",
            )
        summary = _rebuild_attendance_summary(
            company=membership.company,
            employment=employment,
            work_date=work_date,
            timezone_name=timezone_name,
        )
    return _attendance_result(event, session, summary)


def check_out(*, membership, employment_id, occurred_at, event_key, verification_method, actor):
    employment = Employment.objects.filter(
        company=membership.company,
        pk=employment_id,
        person_id=membership.person_id,
        status=EmploymentStatus.ACTIVE,
    ).first()
    if employment is None:
        raise not_found("That active Employment was not found for this membership.")
    timestamp = _attendance_timestamp(occurred_at)
    timezone_name, location, work_date, schedule = _attendance_schedule(membership.company, employment, timestamp)
    policy = resolve_attendance_policy(
        company=membership.company,
        employment=employment,
        work_location=location,
        shift=schedule.shift if schedule else None,
        on_date=work_date,
    )
    _validate_attendance_method(policy, verification_method)
    with transaction.atomic():
        existing = _existing_attendance_event(
            company=membership.company,
            actor=actor,
            event_key=event_key,
            employment=employment,
            event_type=AttendanceEventType.CHECK_OUT,
        )
        if existing:
            session = AttendanceSession.objects.filter(company=membership.company, check_out_event=existing).first()
            event_date = existing.occurred_at.astimezone(ZoneInfo(existing.timezone_name or timezone_name)).date()
            summary = _rebuild_attendance_summary(
                company=membership.company,
                employment=employment,
                work_date=session.work_date if session else event_date,
                timezone_name=existing.timezone_name or timezone_name,
            )
            return _attendance_result(existing, session, summary, replay=True)
        event = _new_attendance_event(
            company=membership.company,
            employment=employment,
            actor=actor,
            event_type=AttendanceEventType.CHECK_OUT,
            timestamp=timestamp,
            timezone_name=timezone_name,
            method=verification_method,
            event_key=event_key,
        )
        session = AttendanceSession.objects.select_for_update().filter(
            company=membership.company,
            employment=employment,
            check_in_event__isnull=False,
            check_out_event__isnull=True,
            status__in=[AttendanceSessionStatus.OPEN, AttendanceSessionStatus.PROVISIONAL, AttendanceSessionStatus.PENDING_REVIEW],
        ).order_by("-work_date", "-sequence").first()
        if session is None:
            AttendanceException.objects.create(company=membership.company, employment=employment, event=event, code="orphan_check_out")
            summary = _rebuild_attendance_summary(
                company=membership.company,
                employment=employment,
                work_date=work_date,
                timezone_name=timezone_name,
            )
            return _attendance_result(event, None, summary)
        check_in_event = session.check_in_event
        if check_in_event is None or timestamp < check_in_event.occurred_at:
            AttendanceException.objects.create(
                company=membership.company,
                employment=employment,
                event=event,
                session=session,
                code="out_of_order_check_out",
            )
            summary = _rebuild_attendance_summary(
                company=membership.company,
                employment=employment,
                work_date=session.work_date,
                timezone_name=session.timezone_name,
            )
            return _attendance_result(event, session, summary)
        session.check_out_event = event
        session.status = AttendanceSessionStatus.PENDING_REVIEW
        session.minutes_worked = max(0, int((timestamp - check_in_event.occurred_at).total_seconds() // 60))
        session.calculated_version += 1
        session.save(update_fields=["check_out_event", "status", "minutes_worked", "calculated_version", "updated_at"])
        AttendanceException.objects.create(
            company=membership.company,
            employment=employment,
            event=event,
            session=session,
            code="verification_pending",
            details={"method": verification_method},
        )
        if work_date != session.work_date:
            AttendanceException.objects.create(
                company=membership.company,
                employment=employment,
                event=event,
                session=session,
                code="overnight_shift",
                details={"scheduled_work_date": session.work_date.isoformat(), "check_out_local_date": work_date.isoformat()},
            )
        summary = _rebuild_attendance_summary(
            company=membership.company,
            employment=employment,
            work_date=session.work_date,
            timezone_name=session.timezone_name,
        )
    return _attendance_result(event, session, summary)


def _decimal_value(value, field: str) -> Decimal:
    try:
        return Decimal(str(value))
    except Exception:
        raise validation_error([{"field": field, "code": "invalid", "message": "Enter a valid decimal amount."}]) from None


def create_salary_component(*, company, payload: dict):
    if not isinstance(payload, dict):
        raise validation_error([{"field": "", "code": "invalid", "message": "Send a JSON object."}])
    component_type = payload.get("component_type")
    calculation_type = payload.get("calculation_type")
    if component_type not in {choice.value for choice in SalaryComponentType}:
        raise validation_error([{"field": "component_type", "code": "invalid", "message": "Choose earning or deduction."}])
    if calculation_type not in {choice.value for choice in SalaryCalculationType}:
        raise validation_error([{"field": "calculation_type", "code": "invalid", "message": "Choose a supported calculation type."}])
    name = payload.get("name")
    code = payload.get("code")
    if not isinstance(name, str) or not name.strip() or not isinstance(code, str) or not code.strip():
        raise validation_error([{"field": "name", "code": "required", "message": "Enter a component name and code."}])
    starts_on = _parse_date(payload.get("starts_on"), "starts_on")
    ends_on = _parse_date(payload.get("ends_on"), "ends_on", required=False)
    if ends_on and ends_on < starts_on:
        raise validation_error([{"field": "ends_on", "code": "invalid", "message": "End date must be on or after start date."}])
    fixed_amount = None
    percentage = None
    if calculation_type == SalaryCalculationType.FIXED:
        fixed_amount = _decimal_value(payload.get("fixed_amount"), "fixed_amount")
        if fixed_amount < 0:
            raise validation_error([{"field": "fixed_amount", "code": "invalid", "message": "Amount must be zero or greater."}])
    else:
        percentage = _decimal_value(payload.get("percentage"), "percentage")
        if percentage < 0 or percentage > 100:
            raise validation_error([{"field": "percentage", "code": "invalid", "message": "Percentage must be from 0 to 100."}])
    try:
        return SalaryComponent.objects.create(
            company=company,
            code=code.strip().lower()[:64],
            name=name.strip()[:120],
            component_type=component_type,
            calculation_type=calculation_type,
            fixed_amount=fixed_amount,
            percentage=percentage,
            is_statutory=bool(payload.get("is_statutory", False)),
            starts_on=starts_on,
            ends_on=ends_on,
        )
    except IntegrityError as exc:
        raise conflict("A component version with that code and effective date already exists.") from exc


def create_salary_structure(*, company, payload: dict):
    if not isinstance(payload, dict):
        raise validation_error([{"field": "", "code": "invalid", "message": "Send a JSON object."}])
    name = payload.get("name")
    component_ids = payload.get("component_ids", [])
    starts_on = _parse_date(payload.get("starts_on"), "starts_on")
    ends_on = _parse_date(payload.get("ends_on"), "ends_on", required=False)
    if not isinstance(name, str) or not name.strip():
        raise validation_error([{"field": "name", "code": "required", "message": "Enter a structure name."}])
    if ends_on and ends_on < starts_on:
        raise validation_error([{"field": "ends_on", "code": "invalid", "message": "End date must be on or after start date."}])
    if not isinstance(component_ids, list) or any(not isinstance(value, str) for value in component_ids):
        raise validation_error([{"field": "component_ids", "code": "invalid", "message": "Send component IDs as a list."}])
    components = list(SalaryComponent.objects.filter(company=company, pk__in=component_ids, status="active"))
    if len(components) != len(set(component_ids)):
        raise not_found("A salary component was not found in this company.")
    with transaction.atomic():
        version = (SalaryStructure.objects.filter(company=company, name=name.strip()).aggregate(value=models.Max("version"))["value"] or 0) + 1
        structure = SalaryStructure.objects.create(
            company=company,
            name=name.strip()[:150],
            version=version,
            starts_on=starts_on,
            ends_on=ends_on,
        )
        SalaryStructureComponent.objects.bulk_create(
            [SalaryStructureComponent(company=company, structure=structure, component=component) for component in components]
        )
    return structure


def assign_compensation(
    *, company, employment_id, structure_id, monthly_base_salary, currency, currency_precision, starts_on, ends_on, actor
):
    employment = Employment.objects.filter(company=company, pk=employment_id, status=EmploymentStatus.ACTIVE).first()
    structure = SalaryStructure.objects.filter(company=company, pk=structure_id).first()
    if employment is None or structure is None:
        raise not_found("An active Employment or SalaryStructure was not found in this company.")
    base = _decimal_value(monthly_base_salary, "monthly_base_salary")
    if base < 0:
        raise validation_error([{"field": "monthly_base_salary", "code": "invalid", "message": "Base salary must be zero or greater."}])
    start = _parse_date(starts_on, "starts_on")
    end = _parse_date(ends_on, "ends_on", required=False)
    if end and end < start:
        raise validation_error([{"field": "ends_on", "code": "invalid", "message": "End date must be on or after start date."}])
    if not isinstance(currency, str) or len(currency.strip()) != 3:
        raise validation_error([{"field": "currency", "code": "invalid", "message": "Enter a three-letter currency code."}])
    if isinstance(currency_precision, bool) or not isinstance(currency_precision, int) or not 0 <= currency_precision <= 4:
        raise validation_error([{"field": "currency_precision", "code": "invalid", "message": "Precision must be from 0 to 4 decimal places."}])
    return CompensationAssignment.objects.create(
        company=company,
        employment=employment,
        structure=structure,
        monthly_base_salary=base,
        currency=currency.strip().upper(),
        currency_precision=currency_precision,
        starts_on=start,
        ends_on=end,
        created_by=actor,
    )


def create_statutory_rule(*, company, actor, payload: dict):
    if not isinstance(payload, dict):
        raise validation_error([{"field": "", "code": "invalid", "message": "Send a JSON object."}])
    code = payload.get("code")
    name = payload.get("name")
    configuration = payload.get("configuration", {})
    if not isinstance(code, str) or not code.strip() or not isinstance(name, str) or not name.strip():
        raise validation_error([{"field": "code", "code": "required", "message": "Enter a rule name and code."}])
    if not isinstance(configuration, dict):
        raise validation_error([{"field": "configuration", "code": "invalid", "message": "Send rule configuration as an object."}])
    starts_on = _parse_date(payload.get("starts_on"), "starts_on")
    ends_on = _parse_date(payload.get("ends_on"), "ends_on", required=False)
    if ends_on and ends_on < starts_on:
        raise validation_error([{"field": "ends_on", "code": "invalid", "message": "End date must be on or after start date."}])
    version = (StatutoryRuleVersion.objects.filter(company=company, code=code.strip().lower()).aggregate(value=models.Max("version"))["value"] or 0) + 1
    return StatutoryRuleVersion.objects.create(
        company=company,
        code=code.strip().lower()[:64],
        name=name.strip()[:150],
        version=version,
        configuration=configuration,
        source_reference=str(payload.get("source_reference") or "")[:500],
        starts_on=starts_on,
        ends_on=ends_on,
        created_by=actor,
    )


def create_payroll_period(*, company, actor, payload: dict):
    if not isinstance(payload, dict):
        raise validation_error([{"field": "", "code": "invalid", "message": "Send a JSON object."}])
    entity = LegalEntity.objects.filter(company=company, pk=payload.get("legal_entity_id"), status="active").first()
    if entity is None:
        raise not_found("An active same-company LegalEntity is required for a PayrollPeriod.")
    starts_on = _parse_date(payload.get("starts_on"), "starts_on")
    ends_on = _parse_date(payload.get("ends_on"), "ends_on")
    if ends_on < starts_on:
        raise validation_error([{"field": "ends_on", "code": "invalid", "message": "Period end must be on or after its start."}])
    name = payload.get("name")
    if not isinstance(name, str) or not name.strip():
        raise validation_error([{"field": "name", "code": "required", "message": "Enter a period name."}])
    overlaps = PayrollPeriod.objects.filter(company=company, legal_entity=entity, starts_on__lte=ends_on, ends_on__gte=starts_on).exists()
    if overlaps:
        raise conflict("Payroll periods for this LegalEntity cannot overlap.")
    try:
        return PayrollPeriod.objects.create(
            company=company,
            legal_entity=entity,
            name=name.strip()[:120],
            starts_on=starts_on,
            ends_on=ends_on,
            created_by=actor,
        )
    except IntegrityError as exc:
        raise conflict("That PayrollPeriod already exists.") from exc


def create_payroll_run(*, company, actor, period_id):
    period = PayrollPeriod.objects.filter(company=company, pk=period_id, status=PayrollPeriodStatus.OPEN).first()
    if period is None:
        raise not_found("That open PayrollPeriod was not found.")
    with transaction.atomic():
        last_number = PayrollRun.objects.filter(company=company, period=period).aggregate(value=models.Max("run_number"))["value"] or 0
        return PayrollRun.objects.create(company=company, period=period, run_number=last_number + 1, created_by=actor)


def _money(value: Decimal, precision: int = 2) -> Decimal:
    quantum = Decimal(1).scaleb(-precision)
    return value.quantize(quantum, rounding=ROUND_HALF_UP)


def calculate_payroll(*, company, run_id, actor):
    payroll_readiness = activation_payload(company)["readiness"]["payroll"]
    if not payroll_readiness.get("activated"):
        raise conflict("Payroll is not ready and explicitly activated for this company.")
    with transaction.atomic():
        run = PayrollRun.objects.select_for_update().filter(company=company, pk=run_id).select_related("period__legal_entity").first()
        if run is None:
            raise not_found("That PayrollRun was not found.")
        if run.status not in {PayrollRunStatus.DRAFT, PayrollRunStatus.CALCULATED}:
            raise conflict("Only a draft PayrollRun can be calculated.")
        period = run.period
        if period.status != PayrollPeriodStatus.OPEN:
            raise conflict("The PayrollPeriod is not open.")
        if period.starts_on.day != 1:
            raise conflict("The current calculator supports calendar-month periods only.")
        import calendar

        if period.ends_on.day != calendar.monthrange(period.ends_on.year, period.ends_on.month)[1]:
            raise conflict("The current calculator supports calendar-month periods only.")

        PayrollLine.objects.filter(company=company, run=run).delete()
        exceptions = []
        lines = []
        employment_rows = Employment.objects.filter(
            company=company,
            legal_entity=period.legal_entity,
            status=EmploymentStatus.ACTIVE,
            starts_on__lte=period.ends_on,
        ).filter(models.Q(ends_on__isnull=True) | models.Q(ends_on__gte=period.starts_on)).select_related("person")
        rule_rows = list(
            StatutoryRuleVersion.objects.filter(
                company=company,
                is_active=True,
                starts_on__lte=period.ends_on,
            ).filter(models.Q(ends_on__isnull=True) | models.Q(ends_on__gte=period.starts_on)).order_by("code", "version")
        )
        for employment in employment_rows:
            assignment = CompensationAssignment.objects.filter(
                company=company,
                employment=employment,
                starts_on__lte=period.starts_on,
            ).filter(models.Q(ends_on__isnull=True) | models.Q(ends_on__gte=period.ends_on)).select_related("structure").first()
            if assignment is None:
                exceptions.append({"employment_id": str(employment.id), "code": "compensation_missing"})
                continue
            pending_days = list(
                AttendanceDailySummary.objects.filter(
                    company=company,
                    employment=employment,
                    work_date__gte=period.starts_on,
                    work_date__lte=period.ends_on,
                    status__in=[AttendanceSessionStatus.OPEN, AttendanceSessionStatus.PROVISIONAL, AttendanceSessionStatus.PENDING_REVIEW],
                ).values_list("work_date", "status")
            )
            if pending_days:
                exceptions.append(
                    {
                        "employment_id": str(employment.id),
                        "code": "attendance_review_pending",
                        "days": [{"work_date": day.isoformat(), "status": status} for day, status in pending_days],
                    }
                )
                continue
            components = list(
                SalaryStructureComponent.objects.filter(company=company, structure=assignment.structure)
                .select_related("component")
                .order_by("component__code")
            )
            precision = assignment.currency_precision
            earning_items = [{"code": "base_salary", "amount": str(_money(assignment.monthly_base_salary, precision))}]
            deduction_items = []
            earnings = assignment.monthly_base_salary
            deductions = Decimal("0")
            component_snapshots = []
            for structure_item in components:
                component = structure_item.component
                if component.status != "active" or component.starts_on > period.starts_on or (component.ends_on and component.ends_on < period.ends_on):
                    exceptions.append({"employment_id": str(employment.id), "code": "component_not_effective", "component_id": str(component.id)})
                    continue
                amount = component.fixed_amount if component.calculation_type == SalaryCalculationType.FIXED else (
                    assignment.monthly_base_salary * (component.percentage or Decimal("0")) / Decimal("100")
                )
                amount = _money(amount or Decimal("0"), precision)
                item_snapshot = {
                    "id": str(component.id),
                    "code": component.code,
                    "name": component.name,
                    "component_type": component.component_type,
                    "calculation_type": component.calculation_type,
                    "fixed_amount": str(component.fixed_amount) if component.fixed_amount is not None else None,
                    "percentage": str(component.percentage) if component.percentage is not None else None,
                    "is_statutory": component.is_statutory,
                    "starts_on": component.starts_on.isoformat(),
                    "ends_on": component.ends_on.isoformat() if component.ends_on else None,
                    "calculated_amount": str(amount),
                }
                component_snapshots.append(item_snapshot)
                target = earning_items if component.component_type == SalaryComponentType.EARNING else deduction_items
                target.append({"code": component.code, "amount": str(amount)})
                if component.component_type == SalaryComponentType.EARNING:
                    earnings += amount
                else:
                    deductions += amount
            earnings = _money(earnings, precision)
            deductions = _money(deductions, precision)
            net = _money(earnings - deductions, precision)
            if net < 0:
                exceptions.append({"employment_id": str(employment.id), "code": "negative_net_pay"})
                continue
            attendance_inputs = list(
                AttendanceDailySummary.objects.filter(
                    company=company,
                    employment=employment,
                    work_date__gte=period.starts_on,
                    work_date__lte=period.ends_on,
                ).order_by("work_date").values("work_date", "status", "minutes_worked", "calculation_version", "timezone_name")
            )
            leave_inputs = list(
                LeaveRequest.objects.filter(
                    company=company,
                    person=employment.person,
                    starts_on__lte=period.ends_on,
                    ends_on__gte=period.starts_on,
                ).order_by("starts_on", "id").values("id", "status", "starts_on", "ends_on", "policy_id")
            )
            inputs = {
                "employment_id": str(employment.id),
                "person_id": str(employment.person_id),
                "legal_entity_id": str(employment.legal_entity_id),
                "period_id": str(period.id),
                "period_starts_on": period.starts_on.isoformat(),
                "period_ends_on": period.ends_on.isoformat(),
                "compensation_assignment_id": str(assignment.id),
                "salary_structure_id": str(assignment.structure_id),
                "salary_structure_version": assignment.structure.version,
                "monthly_base_salary": str(assignment.monthly_base_salary),
                "currency": assignment.currency,
                "currency_precision": precision,
                "rounding": "ROUND_HALF_UP",
                "rounding_quantum": "0.01",
                "components": component_snapshots,
                "statutory_rule_versions": [
                    {"id": str(rule.id), "code": rule.code, "version": rule.version, "configuration": rule.configuration, "source_reference": rule.source_reference}
                    for rule in rule_rows
                ],
                "attendance_inputs": [
                    {**item, "work_date": item["work_date"].isoformat()} for item in attendance_inputs
                ],
                "leave_inputs": [
                    {**item, "starts_on": item["starts_on"].isoformat(), "ends_on": item["ends_on"].isoformat()}
                    for item in leave_inputs
                ],
                "proration": {"mode": "full_calendar_month", "applied": False},
                "engine_version": run.engine_version,
            }
            output = {"earnings": str(earnings), "deductions": str(deductions), "net_pay": str(net), "earning_items": earning_items, "deduction_items": deduction_items}
            lines.append((employment, assignment.currency, earnings, deductions, net, inputs, output))

        for employment, currency, earnings, deductions, net, inputs, output in lines:
            PayrollLine.objects.create(
                company=company,
                run=run,
                employment=employment,
                currency=currency,
                earnings=earnings,
                deductions=deductions,
                net_pay=net,
                inputs=inputs,
                outputs=output,
            )
        run.input_snapshot = {
            "period": {"id": str(period.id), "legal_entity_id": str(period.legal_entity_id), "starts_on": period.starts_on.isoformat(), "ends_on": period.ends_on.isoformat()},
            "engine_version": run.engine_version,
            "calculated_by": str(actor.id),
            "rounding": {"mode": "ROUND_HALF_UP", "precision": 2},
            "line_count": len(lines),
        }
        run.output_snapshot = {"lines": [{"employment_id": str(employment.id), **output} for employment, _currency, _earnings, _deductions, _net, _inputs, output in lines]}
        run.exceptions = exceptions
        run.status = PayrollRunStatus.CALCULATED
        run.save(update_fields=["input_snapshot", "output_snapshot", "exceptions", "status", "updated_at"])
        PayrollApproval.objects.create(company=company, run=run, action="calculated", actor=actor)
    return run


def submit_payroll(*, company, run_id, actor):
    with transaction.atomic():
        run = PayrollRun.objects.select_for_update().filter(company=company, pk=run_id).first()
        if run is None:
            raise not_found("That PayrollRun was not found.")
        if run.status != PayrollRunStatus.CALCULATED:
            raise conflict("Only a calculated PayrollRun can be submitted.")
        if run.exceptions:
            raise conflict("Resolve all payroll calculation exceptions before submission.")
        if not run.lines.exists():
            raise conflict("A payroll run with no lines cannot be submitted.")
        run.status = PayrollRunStatus.SUBMITTED
        run.submitted_at = timezone.now()
        run.save(update_fields=["status", "submitted_at", "updated_at"])
        PayrollApproval.objects.create(company=company, run=run, action="submitted", actor=actor)
    return run


def approve_payroll(*, company, run_id, actor):
    with transaction.atomic():
        run = PayrollRun.objects.select_for_update().filter(company=company, pk=run_id).first()
        if run is None:
            raise not_found("That PayrollRun was not found.")
        if run.status != PayrollRunStatus.SUBMITTED:
            raise conflict("Only a submitted PayrollRun can be approved.")
        if run.created_by_id == actor.id:
            raise conflict("The payroll preparer cannot approve their own run.")
        run.status = PayrollRunStatus.APPROVED
        run.approved_by = actor
        run.approved_at = timezone.now()
        run.save(update_fields=["status", "approved_by", "approved_at", "updated_at"])
        PayrollApproval.objects.create(company=company, run=run, action="approved", actor=actor)
    return run


def finalize_payroll(*, company, run_id, actor):
    with transaction.atomic():
        run = PayrollRun.objects.select_for_update().filter(company=company, pk=run_id).first()
        if run is None:
            raise not_found("That PayrollRun was not found.")
        if run.status != PayrollRunStatus.APPROVED:
            raise conflict("Only an approved PayrollRun can be finalized.")
        if run.created_by_id == actor.id or run.approved_by_id == actor.id:
            raise conflict("The preparer and approver cannot finalize this run.")
        run.status = PayrollRunStatus.FINALIZED
        run.finalized_by = actor
        run.finalized_at = timezone.now()
        run.save(update_fields=["status", "finalized_by", "finalized_at", "updated_at"])
        PayrollApproval.objects.create(company=company, run=run, action="finalized", actor=actor)
        for line in run.lines.all():
            Payslip.objects.get_or_create(
                company=company,
                run=run,
                line=line,
                defaults={"snapshot": {"inputs": line.inputs, "outputs": line.outputs, "engine_version": run.engine_version}},
            )
    return run


def reverse_payroll(*, company, run_id, actor, note: str):
    with transaction.atomic():
        original = PayrollRun.objects.select_for_update().filter(company=company, pk=run_id).first()
        if original is None or original.status != PayrollRunStatus.FINALIZED:
            raise not_found("That finalized PayrollRun was not found.")
        if not isinstance(note, str) or not note.strip():
            raise validation_error([{"field": "note", "code": "required", "message": "Enter a reversal reason."}])
        latest = PayrollRun.objects.filter(company=company, period=original.period).aggregate(value=models.Max("run_number"))["value"] or 0
        reversal = PayrollRun.objects.create(
            company=company,
            period=original.period,
            run_number=latest + 1,
            reverses=original,
            created_by=actor,
            input_snapshot={"reverses_run_id": str(original.id), "source_snapshot": original.input_snapshot, "reason": note.strip()[:500]},
            engine_version=original.engine_version,
        )
        for line in original.lines.all():
            PayrollLine.objects.create(
                company=company,
                run=reversal,
                employment=line.employment,
                currency=line.currency,
                earnings=line.deductions,
                deductions=line.earnings,
                net_pay=-line.net_pay,
                inputs={"reversal_of_line_id": str(line.id), "original_inputs": line.inputs},
                outputs={"reversal_of_line_id": str(line.id), "earnings": str(line.deductions), "deductions": str(line.earnings), "net_pay": str(-line.net_pay)},
            )
        reversal.output_snapshot = {"reversal_of_run_id": str(original.id), "line_count": original.lines.count()}
        reversal.status = PayrollRunStatus.DRAFT
        reversal.save(update_fields=["output_snapshot", "status", "updated_at"])
        PayrollApproval.objects.create(company=company, run=reversal, action="reversal_created", actor=actor, note=note.strip()[:500])
    return reversal


def record_payroll_payment_status(*, company, run_id, status, reference, note, actor):
    run = PayrollRun.objects.filter(company=company, pk=run_id, status=PayrollRunStatus.FINALIZED).first()
    if run is None:
        raise not_found("That finalized PayrollRun was not found.")
    if status not in {choice.value for choice in PayrollPaymentStatus}:
        raise validation_error([{"field": "status", "code": "invalid", "message": "Choose pending, paid, or failed."}])
    return PayrollPaymentRecord.objects.create(
        company=company,
        run=run,
        status=status,
        reference=str(reference or "")[:120],
        note=str(note or "")[:500],
        recorded_by=actor,
    )


# --- Designations ---

def list_designations(*, company):
    return Designation.objects.filter(company=company, is_active=True).select_related("department").order_by("name")


def create_designation(*, company, payload: dict) -> Designation:
    code = str(payload.get("code") or "").strip().lower()
    name = str(payload.get("name") or "").strip()
    if not code or not name:
        raise validation_error([{"field": "name", "code": "required", "message": "Code and name are required."}])
    dept_id = payload.get("department_id")
    dept = Department.objects.filter(company=company, pk=dept_id).first() if dept_id else None
    try:
        with transaction.atomic():
            return Designation.objects.create(
                company=company,
                code=code,
                name=name,
                department=dept,
                description=str(payload.get("description") or "").strip(),
            )
    except IntegrityError as exc:
        raise conflict("That designation code is already in use.") from exc


def serialize_designation(row: Designation) -> dict:
    return {
        "id": str(row.id),
        "code": row.code,
        "name": row.name,
        "department_id": str(row.department_id) if row.department_id else None,
        "department_name": row.department.name if row.department else None,
        "description": row.description,
        "is_active": row.is_active,
        "created_at": row.created_at.isoformat(),
    }


# --- Onboarding Tasks ---

def list_onboarding_tasks(*, company, employment_id=None):
    qs = OnboardingTask.objects.filter(company=company).select_related("employment__person", "assigned_to")
    if employment_id:
        qs = qs.filter(employment_id=employment_id)
    return qs.order_by("status", "due_date", "created_at")


def create_onboarding_task(*, company, employment_id, payload: dict) -> OnboardingTask:
    emp = Employment.objects.filter(company=company, pk=employment_id).first()
    if emp is None:
        raise not_found("That Employment was not found.")
    title = str(payload.get("title") or "").strip()
    if not title:
        raise validation_error([{"field": "title", "code": "required", "message": "Title is required."}])
    due_date = _parse_date(payload.get("due_date"), "due_date") if payload.get("due_date") else None
    assigned_to = None
    if payload.get("assigned_to_id"):
        assigned_to = Person.objects.filter(company=company, pk=payload.get("assigned_to_id")).first()
    return OnboardingTask.objects.create(
        company=company,
        employment=emp,
        title=title,
        description=str(payload.get("description") or "").strip(),
        category=str(payload.get("category") or "general").strip(),
        due_date=due_date,
        assigned_to=assigned_to,
        notes=str(payload.get("notes") or "").strip(),
    )


def update_onboarding_task(*, company, task_id, payload: dict, actor) -> OnboardingTask:
    task = OnboardingTask.objects.filter(company=company, pk=task_id).first()
    if task is None:
        raise not_found("That OnboardingTask was not found.")
    status = payload.get("status")
    if status and status in {choice.value for choice in OnboardingTaskStatus}:
        task.status = status
        if status == OnboardingTaskStatus.COMPLETED and not task.completed_at:
            task.completed_at = timezone.now()
            task.completed_by = actor
    if "notes" in payload:
        task.notes = str(payload.get("notes") or "").strip()
    task.save()
    return task


def serialize_onboarding_task(row: OnboardingTask) -> dict:
    return {
        "id": str(row.id),
        "employment_id": str(row.employment_id),
        "employee_name": f"{row.employment.person.first_name} {row.employment.person.last_name}".strip(),
        "title": row.title,
        "description": row.description,
        "category": row.category,
        "status": row.status,
        "assigned_to_id": str(row.assigned_to_id) if row.assigned_to_id else None,
        "due_date": row.due_date.isoformat() if row.due_date else None,
        "completed_at": row.completed_at.isoformat() if row.completed_at else None,
        "notes": row.notes,
        "created_at": row.created_at.isoformat(),
    }


# --- Offboarding Tasks ---

def list_offboarding_tasks(*, company, employment_id=None):
    qs = OffboardingTask.objects.filter(company=company).select_related("employment__person", "assigned_to")
    if employment_id:
        qs = qs.filter(employment_id=employment_id)
    return qs.order_by("status", "due_date", "created_at")


def create_offboarding_task(*, company, employment_id, payload: dict) -> OffboardingTask:
    emp = Employment.objects.filter(company=company, pk=employment_id).first()
    if emp is None:
        raise not_found("That Employment was not found.")
    title = str(payload.get("title") or "").strip()
    if not title:
        raise validation_error([{"field": "title", "code": "required", "message": "Title is required."}])
    due_date = _parse_date(payload.get("due_date"), "due_date") if payload.get("due_date") else None
    assigned_to = None
    if payload.get("assigned_to_id"):
        assigned_to = Person.objects.filter(company=company, pk=payload.get("assigned_to_id")).first()
    return OffboardingTask.objects.create(
        company=company,
        employment=emp,
        title=title,
        description=str(payload.get("description") or "").strip(),
        category=str(payload.get("category") or "asset_return").strip(),
        due_date=due_date,
        assigned_to=assigned_to,
        notes=str(payload.get("notes") or "").strip(),
    )


def update_offboarding_task(*, company, task_id, payload: dict, actor) -> OffboardingTask:
    task = OffboardingTask.objects.filter(company=company, pk=task_id).first()
    if task is None:
        raise not_found("That OffboardingTask was not found.")
    status = payload.get("status")
    if status and status in {choice.value for choice in OffboardingTaskStatus}:
        task.status = status
        if status == OffboardingTaskStatus.COMPLETED and not task.completed_at:
            task.completed_at = timezone.now()
            task.completed_by = actor
    if "notes" in payload:
        task.notes = str(payload.get("notes") or "").strip()
    task.save()
    return task


def serialize_offboarding_task(row: OffboardingTask) -> dict:
    return {
        "id": str(row.id),
        "employment_id": str(row.employment_id),
        "employee_name": f"{row.employment.person.first_name} {row.employment.person.last_name}".strip(),
        "title": row.title,
        "description": row.description,
        "category": row.category,
        "status": row.status,
        "assigned_to_id": str(row.assigned_to_id) if row.assigned_to_id else None,
        "due_date": row.due_date.isoformat() if row.due_date else None,
        "completed_at": row.completed_at.isoformat() if row.completed_at else None,
        "notes": row.notes,
        "created_at": row.created_at.isoformat(),
    }


# --- Employee Documents ---

def list_employee_documents(*, company, employment_id=None, include_sensitive=False):
    qs = EmployeeDocument.objects.filter(company=company).select_related("employment__person")
    if employment_id:
        qs = qs.filter(employment_id=employment_id)
    if not include_sensitive:
        qs = qs.filter(is_sensitive=False)
    return qs.order_by("-created_at")


def create_employee_document(*, company, employment_id, payload: dict) -> EmployeeDocument:
    emp = Employment.objects.filter(company=company, pk=employment_id).first()
    if emp is None:
        raise not_found("That Employment was not found.")
    title = str(payload.get("title") or "").strip()
    file_name = str(payload.get("file_name") or "").strip()
    if not title or not file_name:
        raise validation_error([{"field": "title", "code": "required", "message": "Title and file name are required."}])
    return EmployeeDocument.objects.create(
        company=company,
        employment=emp,
        title=title,
        category=str(payload.get("category") or "other").strip(),
        file_name=file_name,
        file_path=str(payload.get("file_path") or f"documents/{emp.id}/{file_name}"),
        file_size=int(payload.get("file_size") or 0),
        mime_type=str(payload.get("mime_type") or "application/octet-stream"),
        is_sensitive=bool(payload.get("is_sensitive", False)),
        notes=str(payload.get("notes") or "").strip(),
    )


def verify_employee_document(*, company, document_id, status: str, notes: str, actor) -> EmployeeDocument:
    doc = EmployeeDocument.objects.filter(company=company, pk=document_id).first()
    if doc is None:
        raise not_found("That EmployeeDocument was not found.")
    if status not in {choice.value for choice in DocumentVerificationStatus}:
        raise validation_error([{"field": "status", "code": "invalid", "message": "Choose verified or rejected."}])
    doc.status = status
    doc.verified_by = actor
    doc.verified_at = timezone.now()
    doc.notes = str(notes or "").strip()
    doc.save(update_fields=["status", "verified_by", "verified_at", "notes", "updated_at"])
    return doc


def serialize_employee_document(row: EmployeeDocument) -> dict:
    return {
        "id": str(row.id),
        "employment_id": str(row.employment_id),
        "employee_name": f"{row.employment.person.first_name} {row.employment.person.last_name}".strip(),
        "title": row.title,
        "category": row.category,
        "file_name": row.file_name,
        "file_size": row.file_size,
        "mime_type": row.mime_type,
        "is_sensitive": row.is_sensitive,
        "status": row.status,
        "verified_at": row.verified_at.isoformat() if row.verified_at else None,
        "notes": row.notes,
        "created_at": row.created_at.isoformat(),
    }


# --- HR Requests ---

def list_hr_requests(*, company, employment_id=None):
    qs = HRRequest.objects.filter(company=company).select_related("employment__person", "assigned_to")
    if employment_id:
        qs = qs.filter(employment_id=employment_id)
    return qs.order_by("-created_at")


def create_hr_request(*, company, employment_id, payload: dict, actor) -> HRRequest:
    emp = Employment.objects.filter(company=company, pk=employment_id).first()
    if emp is None:
        raise not_found("That Employment was not found.")
    subject = str(payload.get("subject") or "").strip()
    description = str(payload.get("description") or "").strip()
    if not subject or not description:
        raise validation_error([{"field": "subject", "code": "required", "message": "Subject and description are required."}])
    return HRRequest.objects.create(
        company=company,
        employment=emp,
        subject=subject,
        description=description,
        category=str(payload.get("category") or HRRequestCategory.GENERAL),
        priority=str(payload.get("priority") or HRRequestPriority.MEDIUM),
        created_by=actor,
    )


def update_hr_request(*, company, request_id, payload: dict, actor) -> HRRequest:
    req = HRRequest.objects.filter(company=company, pk=request_id).first()
    if req is None:
        raise not_found("That HRRequest was not found.")
    if "status" in payload:
        req.status = payload["status"]
        if req.status in {HRRequestStatus.RESOLVED, HRRequestStatus.CLOSED} and not req.resolved_at:
            req.resolved_at = timezone.now()
    if "resolution_notes" in payload:
        req.resolution_notes = str(payload["resolution_notes"]).strip()
    req.save()
    return req


def serialize_hr_request(row: HRRequest) -> dict:
    return {
        "id": str(row.id),
        "employment_id": str(row.employment_id),
        "employee_name": f"{row.employment.person.first_name} {row.employment.person.last_name}".strip(),
        "subject": row.subject,
        "description": row.description,
        "category": row.category,
        "priority": row.priority,
        "status": row.status,
        "resolution_notes": row.resolution_notes,
        "resolved_at": row.resolved_at.isoformat() if row.resolved_at else None,
        "created_at": row.created_at.isoformat(),
    }


# --- Approval Delegations & Reassignment ---

def list_approval_delegations(*, company, delegator_id=None, delegate_id=None):
    qs = ApprovalDelegation.objects.filter(company=company).select_related("delegator__person", "delegate__person")
    if delegator_id:
        qs = qs.filter(delegator_id=delegator_id)
    if delegate_id:
        qs = qs.filter(delegate_id=delegate_id)
    return qs.order_by("-created_at")


def create_approval_delegation(*, company, payload: dict, actor) -> ApprovalDelegation:
    delegator = Employment.objects.filter(company=company, pk=payload.get("delegator_id")).first()
    delegate = Employment.objects.filter(company=company, pk=payload.get("delegate_id")).first()
    if delegator is None or delegate is None:
        raise not_found("Delegator or delegate Employment was not found.")
    if delegator.id == delegate.id:
        raise conflict("You cannot delegate approval authority to yourself.")
    starts_on = _parse_date(payload.get("starts_on"), "starts_on")
    ends_on = _parse_date(payload.get("ends_on"), "ends_on")
    if ends_on < starts_on:
        raise validation_error([{"field": "ends_on", "code": "invalid", "message": "End date must be on or after start date."}])
    reason = str(payload.get("reason") or "").strip()
    if not reason:
        raise validation_error([{"field": "reason", "code": "required", "message": "Reason is required."}])
    family = str(payload.get("permission_family") or "leave").strip()
    return ApprovalDelegation.objects.create(
        company=company,
        delegator=delegator,
        delegate=delegate,
        permission_family=family,
        starts_on=starts_on,
        ends_on=ends_on,
        reason=reason,
        approved_by=actor,
    )


def revoke_approval_delegation(*, company, delegation_id, actor) -> ApprovalDelegation:
    row = ApprovalDelegation.objects.filter(company=company, pk=delegation_id).first()
    if row is None:
        raise not_found("That ApprovalDelegation was not found.")
    row.revoked_at = timezone.now()
    row.save(update_fields=["revoked_at"])
    return row


def serialize_approval_delegation(row: ApprovalDelegation) -> dict:
    return {
        "id": str(row.id),
        "delegator_id": str(row.delegator_id),
        "delegator_name": f"{row.delegator.person.first_name} {row.delegator.person.last_name}".strip(),
        "delegate_id": str(row.delegate_id),
        "delegate_name": f"{row.delegate.person.first_name} {row.delegate.person.last_name}".strip(),
        "permission_family": row.permission_family,
        "starts_on": row.starts_on.isoformat(),
        "ends_on": row.ends_on.isoformat(),
        "reason": row.reason,
        "revoked": row.revoked_at is not None,
        "created_at": row.created_at.isoformat(),
    }


def reassign_pending_approvals(*, company, old_manager_employment_id, new_manager_employment_id, reason: str, actor) -> dict:
    old_mgr = Employment.objects.filter(company=company, pk=old_manager_employment_id).first()
    new_mgr = Employment.objects.filter(company=company, pk=new_manager_employment_id, status=EmploymentStatus.ACTIVE).first()
    if old_mgr is None or new_mgr is None:
        raise not_found("The manager Employment was not found.")
    today = timezone.localdate()
    with transaction.atomic():
        lines = list(EmploymentReportingLine.objects.filter(company=company, manager=old_mgr).filter(
            models.Q(ends_on__isnull=True) | models.Q(ends_on__gte=today)
        ))
        reassigned_count = len(lines)
        for line in lines:
            if line.starts_on >= today:
                line.ends_on = line.starts_on
                new_start = line.starts_on + timedelta(days=1)
            else:
                line.ends_on = today - timedelta(days=1)
                new_start = today
            line.save(update_fields=["ends_on"])
            EmploymentReportingLine.objects.create(
                company=company,
                manager=new_mgr,
                report=line.report,
                starts_on=new_start,
                created_by=actor,
            )
        EmploymentHistory.objects.create(
            company=company,
            employment=old_mgr,
            action="employment.approvals_reassigned",
            before={"manager_id": str(old_mgr.id)},
            after={"new_manager_id": str(new_mgr.id), "reason": reason, "reports_count": reassigned_count},
            actor=actor,
        )
    return {"reassigned_reports_count": reassigned_count, "new_manager_id": str(new_mgr.id)}


# --- Attendance Corrections & Exceptions ---

def request_attendance_correction(*, company, employment_id, payload: dict, actor) -> AttendanceCorrectionRequest:
    emp = Employment.objects.filter(company=company, pk=employment_id).first()
    if emp is None:
        raise not_found("That Employment was not found.")
    reason = str(payload.get("reason") or "").strip()
    if not reason:
        raise validation_error([{"field": "reason", "code": "required", "message": "Reason is required."}])
    session_id = payload.get("session_id")
    session = AttendanceSession.objects.filter(company=company, pk=session_id).first() if session_id else None
    check_in = _attendance_timestamp(payload.get("requested_check_in")) if payload.get("requested_check_in") else None
    check_out = _attendance_timestamp(payload.get("requested_check_out")) if payload.get("requested_check_out") else None
    if not check_in and not check_out:
        raise validation_error([{"field": "requested_check_in", "code": "required", "message": "Specify check-in or check-out time."}])
    return AttendanceCorrectionRequest.objects.create(
        company=company,
        employment=emp,
        session=session,
        requested_check_in=check_in,
        requested_check_out=check_out,
        reason=reason,
        requested_by=actor,
    )


def decide_attendance_correction(*, company, correction_id, status: str, decision_note: str, actor) -> AttendanceCorrectionRequest:
    corr = AttendanceCorrectionRequest.objects.filter(company=company, pk=correction_id, status=AttendanceCorrectionStatus.PENDING).first()
    if corr is None:
        raise not_found("That pending AttendanceCorrectionRequest was not found.")
    if status not in {AttendanceCorrectionStatus.APPROVED, AttendanceCorrectionStatus.REJECTED}:
        raise validation_error([{"field": "status", "code": "invalid", "message": "Choose approved or rejected."}])
    with transaction.atomic():
        corr.status = status
        corr.decided_by = actor
        corr.decided_at = timezone.now()
        corr.decision_note = str(decision_note or "")[:500]
        corr.save()
        if status == AttendanceCorrectionStatus.APPROVED:
            work_date = (corr.requested_check_in or corr.requested_check_out).date()
            loc_asgn = corr.employment.work_location_assignments.filter(starts_on__lte=work_date).filter(models.Q(ends_on__isnull=True) | models.Q(ends_on__gte=work_date)).select_related("work_location").order_by("-starts_on").first()
            tz = (loc_asgn.work_location.timezone if loc_asgn and loc_asgn.work_location else "") or getattr(company, "timezone", "UTC")
            _rebuild_attendance_summary(company=company, employment=corr.employment, work_date=work_date, timezone_name=tz)
    return corr


def list_attendance_corrections(*, company, employment_id=None, status=None):
    qs = AttendanceCorrectionRequest.objects.filter(company=company).select_related("employment__person", "requested_by")
    if employment_id:
        qs = qs.filter(employment_id=employment_id)
    if status:
        qs = qs.filter(status=status)
    return qs.order_by("-created_at")


def serialize_attendance_correction(row: AttendanceCorrectionRequest) -> dict:
    return {
        "id": str(row.id),
        "employment_id": str(row.employment_id),
        "employee_name": f"{row.employment.person.first_name} {row.employment.person.last_name}".strip(),
        "requested_check_in": row.requested_check_in.isoformat() if row.requested_check_in else None,
        "requested_check_out": row.requested_check_out.isoformat() if row.requested_check_out else None,
        "reason": row.reason,
        "status": row.status,
        "decision_note": row.decision_note,
        "decided_at": row.decided_at.isoformat() if row.decided_at else None,
        "created_at": row.created_at.isoformat(),
    }


def list_attendance_exceptions(*, company, employment_id=None, status=None):
    qs = AttendanceException.objects.filter(company=company).select_related("employment__person")
    if employment_id:
        qs = qs.filter(employment_id=employment_id)
    if status:
        qs = qs.filter(status=status)
    return qs.order_by("-created_at")


def resolve_attendance_exception(*, company, exception_id, resolution: str, actor) -> AttendanceException:
    exc = AttendanceException.objects.filter(company=company, pk=exception_id).first()
    if exc is None:
        raise not_found("That AttendanceException was not found.")
    exc.status = AttendanceExceptionStatus.RESOLVED
    exc.resolution = str(resolution or "").strip()[:500]
    exc.resolved_by = actor
    exc.resolved_at = timezone.now()
    exc.save()
    return exc


def serialize_attendance_exception(row: AttendanceException) -> dict:
    return {
        "id": str(row.id),
        "employment_id": str(row.employment_id),
        "employee_name": f"{row.employment.person.first_name} {row.employment.person.last_name}".strip(),
        "code": row.code,
        "status": row.status,
        "details": row.details,
        "resolution": row.resolution,
        "resolved_at": row.resolved_at.isoformat() if row.resolved_at else None,
        "created_at": row.created_at.isoformat(),
    }


# --- Team Hierarchy, Attendance & Directory ---

def list_team_attendance(*, company, manager_employment_id, work_date=None):
    effective_date = _parse_date(work_date, "work_date") if work_date else timezone.localdate()
    mgr = Employment.objects.filter(company=company, pk=manager_employment_id).first()
    if mgr is None:
        raise not_found("That manager Employment was not found.")
    team_ids = _managed_employment_ids(mgr, on_date=effective_date)
    summaries = AttendanceDailySummary.objects.filter(
        company=company,
        employment_id__in=team_ids,
        work_date=effective_date,
    ).select_related("employment__person")
    return [
        {
            "employment_id": str(row.employment_id),
            "employee_name": f"{row.employment.person.first_name} {row.employment.person.last_name}".strip(),
            "work_date": row.work_date.isoformat(),
            "status": row.status,
            "minutes_worked": row.minutes_worked,
            "first_check_in": row.first_check_in.isoformat() if row.first_check_in else None,
            "last_check_out": row.last_check_out.isoformat() if row.last_check_out else None,
        }
        for row in summaries
    ]


def list_team_directory(*, company, manager_employment_id):
    today = timezone.localdate()
    mgr = Employment.objects.filter(company=company, pk=manager_employment_id).first()
    if mgr is None:
        raise not_found("That manager Employment was not found.")
    team_ids = _managed_employment_ids(mgr, on_date=today)
    rows = Employment.objects.filter(company=company, pk__in=team_ids).select_related(
        "person", "legal_entity", "person__department"
    ).order_by("person__last_name", "person__first_name")
    return [_employment_payload(row) for row in rows]


def list_team_leave_calendar(*, company, manager_employment_id, start_date=None, end_date=None):
    today = timezone.localdate()
    starts = _parse_date(start_date, "start_date") if start_date else (today - timedelta(days=15))
    ends = _parse_date(end_date, "end_date") if end_date else (today + timedelta(days=45))
    mgr = Employment.objects.filter(company=company, pk=manager_employment_id).first()
    if mgr is None:
        raise not_found("That manager Employment was not found.")
    team_ids = _managed_employment_ids(mgr, on_date=today)
    person_ids = Employment.objects.filter(company=company, pk__in=team_ids).values_list("person_id", flat=True)
    leaves = LeaveRequest.objects.filter(
        company=company,
        person_id__in=person_ids,
        status=LeaveRequestStatus.APPROVED,
        starts_on__lte=ends,
        ends_on__gte=starts,
    ).select_related("person", "policy")
    return [
        {
            "id": str(req.id),
            "person_id": str(req.person_id),
            "employee_name": f"{req.person.first_name} {req.person.last_name}".strip(),
            "policy_name": req.policy.name,
            "starts_on": req.starts_on.isoformat(),
            "ends_on": req.ends_on.isoformat(),
            "days": leave_days(req.starts_on, req.ends_on),
        }
        for req in leaves
    ]


# --- HR Dashboard & Summary Overview ---

def get_hrms_dashboard_overview(*, company, membership):
    today = timezone.localdate()
    active_employments = Employment.objects.filter(company=company, status=EmploymentStatus.ACTIVE).count()
    pending_employments = Employment.objects.filter(company=company, status__in=[EmploymentStatus.PENDING, EmploymentStatus.DRAFT]).count()
    on_leave_employments = Employment.objects.filter(company=company, status=EmploymentStatus.ON_LEAVE).count()
    today_summaries = AttendanceDailySummary.objects.filter(company=company, work_date=today)
    present_today = today_summaries.filter(status="present").count()
    pending_leaves = LeaveRequest.objects.filter(company=company, status=LeaveRequestStatus.PENDING).count()
    pending_corrections = AttendanceCorrectionRequest.objects.filter(company=company, status=AttendanceCorrectionStatus.PENDING).count()
    open_exceptions = AttendanceException.objects.filter(company=company, status="open").count()
    open_onboarding = OnboardingTask.objects.filter(company=company, status__in=["pending", "in_progress"]).count()
    open_offboarding = OffboardingTask.objects.filter(company=company, status__in=["pending", "in_progress"]).count()
    open_requests = HRRequest.objects.filter(company=company, status__in=["submitted", "in_progress"]).count()
    pending_docs = EmployeeDocument.objects.filter(company=company, status="pending").count()
    open_periods = PayrollPeriod.objects.filter(company=company, status=PayrollPeriodStatus.OPEN).count()
    pending_runs = PayrollRun.objects.filter(company=company, status=PayrollRunStatus.SUBMITTED).count()

    own_leaves = []
    own_employments = []
    if membership.person_id:
        own_employments = list(Employment.objects.filter(company=company, person_id=membership.person_id).values_list("id", flat=True))
        own_leaves = list(LeaveRequest.objects.filter(company=company, person_id=membership.person_id).order_by("-created_at")[:5])

    return {
        "headcount": {
            "active": active_employments,
            "pending": pending_employments,
            "on_leave": on_leave_employments,
            "total": active_employments + pending_employments + on_leave_employments,
        },
        "tasks": {
            "open_onboarding": open_onboarding,
            "open_offboarding": open_offboarding,
        },
        "attendance": {
            "open_exceptions": open_exceptions,
            "pending_corrections": pending_corrections,
        },
        "requests": {
            "open_hr_requests": open_requests,
        },
        "documents": {
            "pending_verification": pending_docs,
        },
        "attendance_today": {
            "date": today.isoformat(),
            "present": present_today,
            "total_logged": today_summaries.count(),
        },
        "pending_actions": {
            "leave_requests": pending_leaves,
            "attendance_corrections": pending_corrections,
            "payroll_runs": pending_runs,
        },
        "payroll": {
            "open_periods": open_periods,
            "pending_runs": pending_runs,
        },
        "my_summary": {
            "employment_count": len(own_employments),
            "recent_leaves_count": len(own_leaves),
        },
    }


# --- HR Reports ---

def get_hrms_reports(*, company, report_type: str, query_params: dict) -> dict:
    today = timezone.localdate()
    if report_type == "attendance":
        starts = parse_date(query_params.get("starts_on") or str(today - timedelta(days=30))) or (today - timedelta(days=30))
        ends = parse_date(query_params.get("ends_on") or str(today)) or today
        summaries = AttendanceDailySummary.objects.filter(company=company, work_date__gte=starts, work_date__lte=ends).select_related("employment__person")
        total_present = summaries.filter(status="present").count()
        total_absent = summaries.filter(status="absent").count()
        total_late = summaries.filter(status="late").count()
        return {
            "report_type": "attendance",
            "date_range": {"starts_on": starts.isoformat(), "ends_on": ends.isoformat()},
            "summary": {"present": total_present, "absent": total_absent, "late": total_late, "total_records": summaries.count()},
            "records": [
                {
                    "employee_name": f"{s.employment.person.first_name} {s.employment.person.last_name}".strip(),
                    "work_date": s.work_date.isoformat(),
                    "status": s.status,
                    "minutes_worked": s.minutes_worked,
                }
                for s in summaries[:200]
            ],
        }
    elif report_type == "leaves":
        balances = LeaveBalance.objects.filter(company=company).select_related("person", "policy")
        return {
            "report_type": "leaves",
            "year": today.year,
            "records": [
                {
                    "employee_name": f"{b.person.first_name} {b.person.last_name}".strip(),
                    "policy_name": b.policy.name,
                    "allocated_days": b.allocated_days,
                    "used_days": b.used_days,
                    "remaining_days": b.allocated_days - b.used_days,
                }
                for b in balances
            ],
        }
    elif report_type == "headcount":
        by_status = {}
        for choice in EmploymentStatus:
            by_status[choice.value] = Employment.objects.filter(company=company, status=choice.value).count()
        return {
            "report_type": "headcount",
            "by_status": by_status,
            "total": sum(by_status.values()),
        }
    else:
        raise validation_error([{"field": "report_type", "code": "invalid", "message": "Choose attendance, leaves, or headcount."}])
