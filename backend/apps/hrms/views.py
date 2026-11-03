from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.models import AuditLog
from apps.authorization.company import require_membership, require_permission
from apps.hrms import services as leave_services
from apps.hrms.models import (
    AttendancePolicy,
    AttendanceSession,
    CompensationAssignment,
    CompanyHoliday,
    Employment,
    EmploymentReportingLine,
    EmploymentStatus,
    PayrollPeriod,
    PayrollRun,
    Payslip,
    SalaryComponent,
    SalaryStructure,
    StatutoryRuleVersion,
    Shift,
    WorkSchedule,
)
from django.db import models
from apps.modules_registry.models import CompanyModuleInstallation, InstallationStatus
from apps.tenants.services import _ip, _request_id
from common.api.errors import not_found


def _audit_hrms(request, company, *, action, object_type, object_id, before=None, after=None):
    AuditLog.objects.create(
        company=company,
        actor=request.user,
        action=action,
        object_type=object_type,
        object_id=object_id,
        before=before,
        after=after,
        ip_address=_ip(request),
        request_id=_request_id(request),
    )


def _installed(company):
    if not CompanyModuleInstallation.objects.filter(company=company, module_id="hrms", status=InstallationStatus.INSTALLED).exists():
        raise not_found("HRMS is not installed.")


class LeaveRequestListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = require_permission(request.user, company_id, "hrms.leave.view")
        _installed(membership.company)
        rows = leave_services.list_leave_requests(membership)
        return Response({"results": [leave_services.serialize_leave_request(row) for row in rows]})

    def post(self, request, company_id):
        membership = require_permission(request.user, company_id, "hrms.leave.request")
        _installed(membership.company)
        row = leave_services.create_leave_request(
            membership=membership,
            starts_on=request.data.get("starts_on"),
            ends_on=request.data.get("ends_on"),
            reason=request.data.get("reason") or "",
        )
        return Response({"id": str(row.id), "status": row.status}, status=201)


class LeaveBalanceListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = require_permission(request.user, company_id, "hrms.leave.view")
        _installed(membership.company)
        rows = leave_services.list_balances(membership)
        return Response({"results": [leave_services.serialize_balance(row) for row in rows]})


class LeaveDecisionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, company_id, request_id):
        membership = require_permission(request.user, company_id, "hrms.leave.decide")
        _installed(membership.company)
        row, previous = leave_services.decide_leave_request(
            membership=membership,
            request_id=request_id,
            decision=request.data.get("status"),
            actor=request.user,
        )
        if previous != row.status:
            AuditLog.objects.create(
                company=membership.company,
                actor=request.user,
                action="hrms.leave.decided",
                object_type="hrms_leave_request",
                object_id=row.id,
                before={"status": previous},
                after={"status": row.status},
                ip_address=_ip(request),
                request_id=_request_id(request),
            )
        return Response({"id": str(row.id), "status": row.status})


class HrmsActivationView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = require_permission(request.user, company_id, "hrms.activation.view")
        _installed(membership.company)
        return Response(leave_services.activation_payload(membership.company))

    def post(self, request, company_id):
        membership = require_permission(request.user, company_id, "hrms.activation.manage")
        _installed(membership.company)
        feature = request.data.get("feature")
        if feature == "employee_leave":
            activation = leave_services.activate_employee_leave(company=membership.company, actor=request.user)
        elif feature == "attendance":
            activation = leave_services.activate_attendance(company=membership.company, actor=request.user)
        elif feature == "payroll":
            activation = leave_services.activate_payroll(company=membership.company, actor=request.user)
        else:
            from common.api.errors import conflict

            raise conflict("That HRMS feature is not available for activation.")
        _audit_hrms(
            request,
            membership.company,
            action="hrms.feature_activated",
            object_type="hrms_activation",
            object_id=activation.id,
            after={"feature": feature, "status": activation.status},
        )
        return Response(leave_services.activation_payload(membership.company))


class EmploymentListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = require_permission(request.user, company_id, "hrms.employee.view")
        _installed(membership.company)
        leave_services.sync_company_memberships_to_employments(company=membership.company, actor=request.user)
        rows = leave_services.list_employments(
            membership,
            manager_employment_id=request.query_params.get("manager_employment_id"),
        )
        return Response({"results": [leave_services.serialize_employment(row) for row in rows]})

    def post(self, request, company_id):
        membership = require_permission(request.user, company_id, "hrms.employee.manage")
        _installed(membership.company)
        row = leave_services.create_employment(
            company=membership.company,
            actor=request.user,
            payload=request.data,
        )
        payload = leave_services.serialize_employment(row)
        _audit_hrms(
            request,
            membership.company,
            action="hrms.employment.created",
            object_type="hrms_employment",
            object_id=row.id,
            after=payload,
        )
        return Response(payload, status=201)


class EmploymentSyncView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, company_id):
        membership = require_permission(request.user, company_id, "hrms.employee.manage")
        _installed(membership.company)
        created = leave_services.sync_company_memberships_to_employments(company=membership.company, actor=request.user)
        return Response({
            "message": f"Successfully synchronized {len(created)} platform members to HRMS.",
            "synced_count": len(created),
        })


class EligiblePeopleView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = require_permission(request.user, company_id, "hrms.employee.view")
        _installed(membership.company)
        company = membership.company
        from apps.organization.models import Person, PersonStatus
        from apps.tenants.models import CompanyMembership, MembershipStatus, MembershipInvitation, InvitationStatus

        employed_person_ids = set(
            Employment.objects.filter(company=company, status=EmploymentStatus.ACTIVE)
            .values_list("person_id", flat=True)
        )

        people = (
            Person.objects.filter(company=company, status=PersonStatus.ACTIVE)
            .exclude(id__in=employed_person_ids)
            .select_related("department", "department__parent")
            .order_by("first_name", "last_name")
        )

        memberships_by_person = {
            m.person_id: m
            for m in CompanyMembership.objects.filter(company=company, person__isnull=False)
            .exclude(status=MembershipStatus.REMOVED)
            .select_related("user")
        }
        pending_invitations_by_person = {
            inv.person_id: inv
            for inv in MembershipInvitation.objects.filter(company=company, status=InvitationStatus.PENDING, person__isnull=False)
        }
        pending_invitations_by_email = {
            inv.email.casefold(): inv
            for inv in MembershipInvitation.objects.filter(company=company, status=InvitationStatus.PENDING)
        }

        results = []
        for p in people:
            mem = memberships_by_person.get(p.id)
            inv = pending_invitations_by_person.get(p.id) or (
                pending_invitations_by_email.get(p.work_email.casefold()) if p.work_email else None
            )

            branch_name = ""
            branch_id = None
            if p.department and p.department.parent:
                branch_name = p.department.parent.name
                branch_id = str(p.department.parent.id)

            login_status = (
                "active" if mem and mem.status == "active"
                else "invited" if inv
                else "suspended" if mem and mem.status == "suspended"
                else "no_account"
            )

            results.append({
                "id": str(p.id),
                "person_id": str(p.id),
                "first_name": p.first_name,
                "last_name": p.last_name,
                "name": f"{p.first_name} {p.last_name}".strip() or p.work_email,
                "email": p.work_email or "",
                "designation": p.job_title or "",
                "department_id": str(p.department_id) if p.department_id else None,
                "department_name": p.department.name if p.department else "",
                "branch_id": branch_id,
                "branch_name": branch_name,
                "login_status": login_status,
                "has_login": bool(mem and mem.user_id),
                "invitation_status": inv.status if inv else "none",
            })
        return Response({"results": results})


class MyEmploymentListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = require_membership(request.user, company_id)
        _installed(membership.company)
        leave_services.sync_company_memberships_to_employments(company=membership.company, actor=request.user)
        membership.refresh_from_db()
        if membership.person_id is None:
            return Response({"results": []})
        rows = Employment.objects.filter(
            company=membership.company,
            person_id=membership.person_id,
        ).select_related("person", "legal_entity").order_by("-starts_on")
        return Response({"results": [leave_services.serialize_employment(row) for row in rows]})


class EmploymentDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id, employment_id):
        membership = require_permission(request.user, company_id, "hrms.employee.view")
        _installed(membership.company)
        row = leave_services.get_employment(
            membership,
            employment_id,
            manager_employment_id=request.query_params.get("manager_employment_id"),
        )
        return Response(leave_services.serialize_employment(row))


class EmploymentStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, company_id, employment_id):
        membership = require_permission(request.user, company_id, "hrms.employee.manage")
        _installed(membership.company)
        row = leave_services.transition_employment(
            company=membership.company,
            employment_id=employment_id,
            status=request.data.get("status"),
            actor=request.user,
        )
        payload = leave_services.serialize_employment(row)
        _audit_hrms(
            request,
            membership.company,
            action="hrms.employment.status_changed",
            object_type="hrms_employment",
            object_id=row.id,
            after=payload,
        )
        return Response(payload)


class EmploymentLegalEntityAssignmentView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, company_id, employment_id):
        membership = require_permission(request.user, company_id, "hrms.employee.manage")
        _installed(membership.company)
        row = leave_services.assign_employment_legal_entity(
            company=membership.company,
            employment_id=employment_id,
            legal_entity_id=request.data.get("legal_entity_id"),
            actor=request.user,
        )
        payload = leave_services.serialize_employment(row)
        _audit_hrms(
            request,
            membership.company,
            action="hrms.employment.legal_entity_assigned",
            object_type="hrms_employment",
            object_id=row.id,
            after=payload,
        )
        return Response(payload)


class EmploymentDepartmentAssignmentView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, company_id, employment_id):
        membership = require_permission(request.user, company_id, "hrms.employee.manage")
        _installed(membership.company)
        assignment = leave_services.assign_employment_department(
            company=membership.company,
            employment_id=employment_id,
            department_id=request.data.get("department_id"),
            starts_on=request.data.get("starts_on"),
            actor=request.user,
        )
        _audit_hrms(
            request,
            membership.company,
            action="hrms.employment.department_assigned",
            object_type="hrms_employment",
            object_id=assignment.employment_id,
            after={"department_id": str(assignment.department_id), "starts_on": assignment.starts_on.isoformat()},
        )
        return Response(
            {"id": str(assignment.id), "department_id": str(assignment.department_id), "starts_on": assignment.starts_on.isoformat()},
            status=201,
        )


class EmploymentLocationAssignmentView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, company_id, employment_id):
        membership = require_permission(request.user, company_id, "hrms.employee.manage")
        _installed(membership.company)
        assignment = leave_services.assign_employment_location(
            company=membership.company,
            employment_id=employment_id,
            location_id=request.data.get("work_location_id"),
            starts_on=request.data.get("starts_on"),
            actor=request.user,
        )
        _audit_hrms(
            request,
            membership.company,
            action="hrms.employment.location_assigned",
            object_type="hrms_employment",
            object_id=assignment.employment_id,
            after={"work_location_id": str(assignment.work_location_id), "starts_on": assignment.starts_on.isoformat()},
        )
        return Response(
            {"id": str(assignment.id), "work_location_id": str(assignment.work_location_id), "starts_on": assignment.starts_on.isoformat()},
            status=201,
        )


class EmploymentReportingLineView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = require_permission(request.user, company_id, "hrms.employee.view")
        _installed(membership.company)
        visible = leave_services.list_employments(
            membership,
            manager_employment_id=request.query_params.get("manager_employment_id"),
        ).values_list("id", flat=True)
        rows = EmploymentReportingLine.objects.filter(company=membership.company, report_id__in=visible).select_related(
            "manager__person", "report__person"
        ).order_by("-starts_on")
        return Response(
            {
                "results": [
                    {
                        "id": str(row.id),
                        "manager_employment_id": str(row.manager_id),
                        "manager_name": f"{row.manager.person.first_name} {row.manager.person.last_name}".strip(),
                        "report_employment_id": str(row.report_id),
                        "report_name": f"{row.report.person.first_name} {row.report.person.last_name}".strip(),
                        "starts_on": row.starts_on.isoformat(),
                        "ends_on": row.ends_on.isoformat() if row.ends_on else None,
                    }
                    for row in rows
                ]
            }
        )

    def post(self, request, company_id):
        membership = require_permission(request.user, company_id, "hrms.reporting.manage")
        _installed(membership.company)
        row = leave_services.assign_reporting_line(
            company=membership.company,
            manager_id=request.data.get("manager_employment_id"),
            report_id=request.data.get("report_employment_id"),
            starts_on=request.data.get("starts_on"),
            actor=request.user,
        )
        _audit_hrms(
            request,
            membership.company,
            action="hrms.reporting_line.assigned",
            object_type="hrms_reporting_line",
            object_id=row.id,
            after={"manager_employment_id": str(row.manager_id), "report_employment_id": str(row.report_id)},
        )
        return Response({"id": str(row.id), "manager_employment_id": str(row.manager_id), "report_employment_id": str(row.report_id)}, status=201)


class LegalEntityListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = require_permission(request.user, company_id, "hrms.activation.view")
        _installed(membership.company)
        return Response(
            {
                "results": [
                    {"id": str(row.id), "name": row.name, "code": row.code, "status": row.status, "country_code": row.country_code}
                    for row in leave_services.list_legal_entities(membership.company)
                ]
            }
        )

    def post(self, request, company_id):
        membership = require_permission(request.user, company_id, "hrms.activation.manage")
        _installed(membership.company)
        row = leave_services.create_legal_entity(company=membership.company, actor=request.user, payload=request.data)
        _audit_hrms(
            request,
            membership.company,
            action="hrms.legal_entity.created",
            object_type="legal_entity",
            object_id=row.id,
            after={"name": row.name, "code": row.code, "status": row.status},
        )
        return Response({"id": str(row.id), "name": row.name, "code": row.code, "status": row.status}, status=201)


class WorkLocationListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = require_permission(request.user, company_id, "hrms.employee.view")
        _installed(membership.company)
        return Response(
            {
                "results": [
                    {"id": str(row.id), "name": row.name, "code": row.code, "timezone": row.timezone, "status": row.status}
                    for row in leave_services.list_work_locations(membership.company)
                ]
            }
        )

    def post(self, request, company_id):
        membership = require_permission(request.user, company_id, "hrms.location.manage")
        _installed(membership.company)
        row = leave_services.create_work_location(company=membership.company, payload=request.data)
        _audit_hrms(
            request,
            membership.company,
            action="hrms.work_location.created",
            object_type="hrms_work_location",
            object_id=row.id,
            after={"name": row.name, "code": row.code, "timezone": row.timezone},
        )
        return Response({"id": str(row.id), "name": row.name, "code": row.code, "timezone": row.timezone}, status=201)


class ShiftListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = require_permission(request.user, company_id, "hrms.employee.view")
        _installed(membership.company)
        rows = Shift.objects.filter(company=membership.company).order_by("name")
        return Response({"results": [{"id": str(row.id), "name": row.name, "code": row.code, "starts_at": row.starts_at.isoformat(), "ends_at": row.ends_at.isoformat(), "grace_minutes": row.grace_minutes, "status": row.status} for row in rows]})

    def post(self, request, company_id):
        membership = require_permission(request.user, company_id, "hrms.attendance.manage")
        _installed(membership.company)
        row = leave_services.create_shift(company=membership.company, payload=request.data)
        _audit_hrms(request, membership.company, action="hrms.shift.created", object_type="hrms_shift", object_id=row.id, after={"name": row.name, "code": row.code})
        return Response({"id": str(row.id), "name": row.name, "code": row.code, "starts_at": row.starts_at.isoformat(), "ends_at": row.ends_at.isoformat()}, status=201)


class WorkScheduleListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = require_permission(request.user, company_id, "hrms.employee.view")
        _installed(membership.company)
        rows = WorkSchedule.objects.filter(company=membership.company).order_by("name")
        return Response({"results": [{"id": str(row.id), "name": row.name, "weekdays": row.weekdays, "status": row.status} for row in rows]})

    def post(self, request, company_id):
        membership = require_permission(request.user, company_id, "hrms.attendance.manage")
        _installed(membership.company)
        row = leave_services.create_work_schedule(company=membership.company, payload=request.data)
        _audit_hrms(request, membership.company, action="hrms.work_schedule.created", object_type="hrms_work_schedule", object_id=row.id, after={"name": row.name, "weekdays": row.weekdays})
        return Response({"id": str(row.id), "name": row.name, "weekdays": row.weekdays}, status=201)


class AttendancePolicyListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = require_permission(request.user, company_id, "hrms.employee.view")
        _installed(membership.company)
        rows = AttendancePolicy.objects.filter(company=membership.company).order_by("name")
        return Response({"results": [{"id": str(row.id), "name": row.name, "allowed_methods": row.allowed_methods, "fallback_methods": row.fallback_methods, "status": row.status} for row in rows]})

    def post(self, request, company_id):
        membership = require_permission(request.user, company_id, "hrms.attendance.manage")
        _installed(membership.company)
        row = leave_services.create_attendance_policy(company=membership.company, payload=request.data)
        _audit_hrms(request, membership.company, action="hrms.attendance_policy.created", object_type="hrms_attendance_policy", object_id=row.id, after={"name": row.name, "allowed_methods": row.allowed_methods})
        return Response({"id": str(row.id), "name": row.name, "allowed_methods": row.allowed_methods, "fallback_methods": row.fallback_methods}, status=201)


class AttendancePolicyAssignmentView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, company_id):
        membership = require_permission(request.user, company_id, "hrms.attendance.manage")
        _installed(membership.company)
        row = leave_services.assign_attendance_policy(
            company=membership.company,
            policy_id=request.data.get("policy_id"),
            starts_on=request.data.get("starts_on"),
            work_location_id=request.data.get("work_location_id"),
            shift_id=request.data.get("shift_id"),
            employment_id=request.data.get("employment_id"),
            employee_group=request.data.get("employee_group", ""),
        )
        _audit_hrms(request, membership.company, action="hrms.attendance_policy.assigned", object_type="hrms_attendance_policy_assignment", object_id=row.id, after={"policy_id": str(row.policy_id), "employment_id": str(row.employment_id) if row.employment_id else None})
        return Response({"id": str(row.id), "policy_id": str(row.policy_id), "starts_on": row.starts_on.isoformat()}, status=201)


class EmploymentScheduleAssignmentView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, company_id, employment_id):
        membership = require_permission(request.user, company_id, "hrms.attendance.manage")
        _installed(membership.company)
        row = leave_services.assign_employment_schedule(
            company=membership.company,
            employment_id=employment_id,
            schedule_id=request.data.get("schedule_id"),
            shift_id=request.data.get("shift_id"),
            starts_on=request.data.get("starts_on"),
        )
        _audit_hrms(request, membership.company, action="hrms.employment.schedule_assigned", object_type="hrms_employment", object_id=row.employment_id, after={"schedule_id": str(row.schedule_id), "shift_id": str(row.shift_id), "starts_on": row.starts_on.isoformat()})
        return Response({"id": str(row.id), "schedule_id": str(row.schedule_id), "shift_id": str(row.shift_id), "starts_on": row.starts_on.isoformat()}, status=201)


class CompanyHolidayListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = require_permission(request.user, company_id, "hrms.employee.view")
        _installed(membership.company)
        rows = CompanyHoliday.objects.filter(company=membership.company).select_related("work_location").order_by("holiday_date")
        return Response({"results": [{"id": str(row.id), "name": row.name, "holiday_date": row.holiday_date.isoformat(), "work_location_id": str(row.work_location_id) if row.work_location_id else None} for row in rows]})

    def post(self, request, company_id):
        membership = require_permission(request.user, company_id, "hrms.attendance.manage")
        _installed(membership.company)
        row = leave_services.create_company_holiday(
            company=membership.company,
            name=request.data.get("name"),
            holiday_date=request.data.get("holiday_date"),
            work_location_id=request.data.get("work_location_id"),
        )
        _audit_hrms(request, membership.company, action="hrms.holiday.created", object_type="hrms_company_holiday", object_id=row.id, after={"name": row.name, "holiday_date": row.holiday_date.isoformat()})
        return Response({"id": str(row.id), "name": row.name, "holiday_date": row.holiday_date.isoformat()}, status=201)


def _self_employment(membership, employment_id):
    if membership.person_id is None:
        raise not_found("Link this membership to a Person before using attendance.")
    active = Employment.objects.filter(
        company=membership.company,
        person_id=membership.person_id,
        status=EmploymentStatus.ACTIVE,
    )
    if employment_id:
        row = active.filter(pk=employment_id).first()
        if row is None:
            raise not_found("That active Employment context was not found.")
        return row
    rows = list(active.order_by("id")[:2])
    if len(rows) == 1:
        return rows[0]
    if len(rows) > 1:
        from common.api.errors import validation_error

        raise validation_error(
            [{"field": "employment_id", "code": "required", "message": "Select an Employment context for attendance."}]
        )
    raise not_found("No active Employment was found for this membership.")


class MyAttendanceView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = require_permission(request.user, company_id, "hrms.attendance.view")
        _installed(membership.company)
        employment = _self_employment(membership, request.query_params.get("employment_id"))
        rows = AttendanceSession.objects.filter(company=membership.company, employment=employment).select_related(
            "check_in_event", "check_out_event", "shift"
        ).order_by("-work_date", "-sequence")[:90]
        return Response(
            {
                "employment_id": str(employment.id),
                "results": [
                    {
                        "id": str(row.id),
                        "work_date": row.work_date.isoformat(),
                        "status": row.status,
                        "timezone": row.timezone_name,
                        "shift": row.shift.name if row.shift_id else "",
                        "check_in": row.check_in_event.occurred_at.isoformat() if row.check_in_event_id else None,
                        "check_out": row.check_out_event.occurred_at.isoformat() if row.check_out_event_id else None,
                        "minutes_worked": row.minutes_worked,
                    }
                    for row in rows
                ],
            }
        )


class AttendanceCheckInView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, company_id, employment_id):
        membership = require_permission(request.user, company_id, "hrms.attendance.check_in")
        _installed(membership.company)
        employment = _self_employment(membership, employment_id)
        readiness = leave_services.activation_payload(membership.company)["readiness"]["attendance"]
        if not readiness.get("activated"):
            from common.api.errors import conflict

            raise conflict("Attendance is not configured and activated for this company.")
        result = leave_services.check_in(
            membership=membership,
            employment_id=employment.id,
            occurred_at=request.data.get("occurred_at"),
            event_key=request.data.get("event_key"),
            verification_method=request.data.get("verification_method"),
            actor=request.user,
        )
        _audit_hrms(
            request,
            membership.company,
            action="hrms.attendance.check_in",
            object_type="hrms_attendance_event",
            object_id=result["event_id"],
            after={"employment_id": str(employment.id), "verification_status": result["verification_status"]},
        )
        return Response(result, status=200 if result["idempotent_replay"] else 201)


class AttendanceCheckOutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, company_id, employment_id):
        membership = require_permission(request.user, company_id, "hrms.attendance.check_out")
        _installed(membership.company)
        employment = _self_employment(membership, employment_id)
        readiness = leave_services.activation_payload(membership.company)["readiness"]["attendance"]
        if not readiness.get("activated"):
            from common.api.errors import conflict

            raise conflict("Attendance is not configured and activated for this company.")
        result = leave_services.check_out(
            membership=membership,
            employment_id=employment.id,
            occurred_at=request.data.get("occurred_at"),
            event_key=request.data.get("event_key"),
            verification_method=request.data.get("verification_method"),
            actor=request.user,
        )
        _audit_hrms(
            request,
            membership.company,
            action="hrms.attendance.check_out",
            object_type="hrms_attendance_event",
            object_id=result["event_id"],
            after={"employment_id": str(employment.id), "verification_status": result["verification_status"]},
        )
        return Response(result, status=200 if result["idempotent_replay"] else 201)


def _payroll_run_payload(run, *, include_lines=False):
    payload = {
        "id": str(run.id),
        "period_id": str(run.period_id),
        "period_name": run.period.name,
        "run_number": run.run_number,
        "status": run.status,
        "engine_version": run.engine_version,
        "exceptions": run.exceptions,
        "created_by": str(run.created_by_id),
        "submitted_at": run.submitted_at.isoformat() if run.submitted_at else None,
        "approved_at": run.approved_at.isoformat() if run.approved_at else None,
        "approved_by": str(run.approved_by_id) if run.approved_by_id else None,
        "finalized_at": run.finalized_at.isoformat() if run.finalized_at else None,
        "finalized_by": str(run.finalized_by_id) if run.finalized_by_id else None,
    }
    if include_lines:
        payload["input_snapshot"] = run.input_snapshot
        payload["output_snapshot"] = run.output_snapshot
        payload["lines"] = [
            {
                "id": str(line.id),
                "employment_id": str(line.employment_id),
                "currency": line.currency,
                "earnings": str(line.earnings),
                "deductions": str(line.deductions),
                "net_pay": str(line.net_pay),
                "inputs": line.inputs,
                "outputs": line.outputs,
            }
            for line in run.lines.order_by("employment_id")
        ]
    return payload


class SalaryComponentListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = require_permission(request.user, company_id, "hrms.compensation.view")
        _installed(membership.company)
        rows = SalaryComponent.objects.filter(company=membership.company).order_by("code", "starts_on")
        return Response({"results": [{"id": str(row.id), "code": row.code, "name": row.name, "component_type": row.component_type, "calculation_type": row.calculation_type, "fixed_amount": str(row.fixed_amount) if row.fixed_amount is not None else None, "percentage": str(row.percentage) if row.percentage is not None else None, "is_statutory": row.is_statutory, "starts_on": row.starts_on.isoformat(), "ends_on": row.ends_on.isoformat() if row.ends_on else None} for row in rows]})

    def post(self, request, company_id):
        membership = require_permission(request.user, company_id, "hrms.compensation.manage")
        _installed(membership.company)
        row = leave_services.create_salary_component(company=membership.company, payload=request.data)
        _audit_hrms(request, membership.company, action="hrms.salary_component.created", object_type="hrms_salary_component", object_id=row.id, after={"code": row.code, "component_type": row.component_type, "is_statutory": row.is_statutory})
        return Response({"id": str(row.id), "code": row.code, "name": row.name, "starts_on": row.starts_on.isoformat()}, status=201)


class SalaryStructureListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = require_permission(request.user, company_id, "hrms.compensation.view")
        _installed(membership.company)
        rows = SalaryStructure.objects.filter(company=membership.company).prefetch_related("components").order_by("name", "-version")
        return Response({"results": [{"id": str(row.id), "name": row.name, "version": row.version, "starts_on": row.starts_on.isoformat(), "ends_on": row.ends_on.isoformat() if row.ends_on else None, "component_ids": [str(item.id) for item in row.components.all()]} for row in rows]})

    def post(self, request, company_id):
        membership = require_permission(request.user, company_id, "hrms.compensation.manage")
        _installed(membership.company)
        row = leave_services.create_salary_structure(company=membership.company, payload=request.data)
        _audit_hrms(request, membership.company, action="hrms.salary_structure.created", object_type="hrms_salary_structure", object_id=row.id, after={"name": row.name, "version": row.version})
        return Response({"id": str(row.id), "name": row.name, "version": row.version}, status=201)


class CompensationAssignmentListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = require_permission(request.user, company_id, "hrms.compensation.view")
        _installed(membership.company)
        visible_ids = leave_services.list_employments(
            membership,
            manager_employment_id=request.query_params.get("manager_employment_id"),
        ).values_list("id", flat=True)
        rows = CompensationAssignment.objects.filter(company=membership.company, employment_id__in=visible_ids).select_related(
            "employment__person", "structure"
        ).order_by("-starts_on")
        return Response({"results": [{"id": str(row.id), "employment_id": str(row.employment_id), "employee": f"{row.employment.person.first_name} {row.employment.person.last_name}".strip(), "structure_id": str(row.structure_id), "structure_name": row.structure.name, "monthly_base_salary": str(row.monthly_base_salary), "currency": row.currency, "currency_precision": row.currency_precision, "starts_on": row.starts_on.isoformat(), "ends_on": row.ends_on.isoformat() if row.ends_on else None} for row in rows]})

    def post(self, request, company_id):
        membership = require_permission(request.user, company_id, "hrms.compensation.manage")
        _installed(membership.company)
        employment = leave_services.get_employment(
            membership,
            request.data.get("employment_id"),
            manager_employment_id=request.data.get("manager_employment_id"),
        )
        row = leave_services.assign_compensation(
            company=membership.company,
            employment_id=employment.id,
            structure_id=request.data.get("structure_id"),
            monthly_base_salary=request.data.get("monthly_base_salary"),
            currency=request.data.get("currency"),
            currency_precision=request.data.get("currency_precision", 2),
            starts_on=request.data.get("starts_on"),
            ends_on=request.data.get("ends_on"),
            actor=request.user,
        )
        _audit_hrms(request, membership.company, action="hrms.compensation.assigned", object_type="hrms_compensation_assignment", object_id=row.id, after={"employment_id": str(row.employment_id), "structure_id": str(row.structure_id), "starts_on": row.starts_on.isoformat()})
        return Response({"id": str(row.id), "employment_id": str(row.employment_id), "starts_on": row.starts_on.isoformat()}, status=201)


class StatutoryRuleListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = require_permission(request.user, company_id, "hrms.compensation.view")
        _installed(membership.company)
        rows = StatutoryRuleVersion.objects.filter(company=membership.company).order_by("code", "version")
        return Response({"results": [{"id": str(row.id), "code": row.code, "name": row.name, "version": row.version, "configuration": row.configuration, "source_reference": row.source_reference, "starts_on": row.starts_on.isoformat(), "ends_on": row.ends_on.isoformat() if row.ends_on else None, "is_active": row.is_active} for row in rows]})

    def post(self, request, company_id):
        membership = require_permission(request.user, company_id, "hrms.compensation.manage")
        _installed(membership.company)
        row = leave_services.create_statutory_rule(company=membership.company, actor=request.user, payload=request.data)
        _audit_hrms(request, membership.company, action="hrms.statutory_rule.created", object_type="hrms_statutory_rule_version", object_id=row.id, after={"code": row.code, "version": row.version, "source_reference": row.source_reference})
        return Response({"id": str(row.id), "code": row.code, "version": row.version}, status=201)


class PayrollPeriodListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = require_permission(request.user, company_id, "hrms.payroll.view")
        _installed(membership.company)
        rows = PayrollPeriod.objects.filter(company=membership.company).select_related("legal_entity").order_by("-starts_on")
        return Response({"results": [{"id": str(row.id), "legal_entity_id": str(row.legal_entity_id), "legal_entity_name": row.legal_entity.name, "name": row.name, "starts_on": row.starts_on.isoformat(), "ends_on": row.ends_on.isoformat(), "status": row.status} for row in rows]})

    def post(self, request, company_id):
        membership = require_permission(request.user, company_id, "hrms.payroll.calculate")
        _installed(membership.company)
        row = leave_services.create_payroll_period(company=membership.company, actor=request.user, payload=request.data)
        _audit_hrms(request, membership.company, action="hrms.payroll_period.created", object_type="hrms_payroll_period", object_id=row.id, after={"legal_entity_id": str(row.legal_entity_id), "starts_on": row.starts_on.isoformat(), "ends_on": row.ends_on.isoformat()})
        return Response({"id": str(row.id), "name": row.name, "starts_on": row.starts_on.isoformat(), "ends_on": row.ends_on.isoformat()}, status=201)


class PayrollRunListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = require_permission(request.user, company_id, "hrms.payroll.view")
        _installed(membership.company)
        rows = PayrollRun.objects.filter(company=membership.company).select_related("period").order_by("-created_at")
        return Response({"results": [_payroll_run_payload(row) for row in rows]})

    def post(self, request, company_id):
        membership = require_permission(request.user, company_id, "hrms.payroll.calculate")
        _installed(membership.company)
        run = leave_services.create_payroll_run(company=membership.company, actor=request.user, period_id=request.data.get("period_id"))
        _audit_hrms(request, membership.company, action="hrms.payroll_run.created", object_type="hrms_payroll_run", object_id=run.id, after={"period_id": str(run.period_id), "run_number": run.run_number})
        return Response(_payroll_run_payload(run), status=201)


class PayrollRunDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id, run_id):
        membership = require_permission(request.user, company_id, "hrms.payroll.view")
        _installed(membership.company)
        run = PayrollRun.objects.filter(company=membership.company, pk=run_id).select_related("period").first()
        if run is None:
            raise not_found("That PayrollRun was not found.")
        return Response(_payroll_run_payload(run, include_lines=True))


class PayrollRunActionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, company_id, run_id, action):
        permission_by_action = {
            "calculate": "hrms.payroll.calculate",
            "submit": "hrms.payroll.calculate",
            "approve": "hrms.payroll.approve",
            "finalize": "hrms.payroll.finalize",
            "reverse": "hrms.payroll.reverse",
            "payment-status": "hrms.payroll.payment_status",
        }
        permission = permission_by_action.get(action)
        if permission is None:
            raise not_found("That payroll action was not found.")
        membership = require_permission(request.user, company_id, permission)
        _installed(membership.company)
        if action == "calculate":
            run = leave_services.calculate_payroll(company=membership.company, run_id=run_id, actor=request.user)
        elif action == "submit":
            run = leave_services.submit_payroll(company=membership.company, run_id=run_id, actor=request.user)
        elif action == "approve":
            run = leave_services.approve_payroll(company=membership.company, run_id=run_id, actor=request.user)
        elif action == "finalize":
            run = leave_services.finalize_payroll(company=membership.company, run_id=run_id, actor=request.user)
        elif action == "reverse":
            run = leave_services.reverse_payroll(company=membership.company, run_id=run_id, actor=request.user, note=request.data.get("note", ""))
        else:
            payment = leave_services.record_payroll_payment_status(
                company=membership.company,
                run_id=run_id,
                status=request.data.get("status"),
                reference=request.data.get("reference", ""),
                note=request.data.get("note", ""),
                actor=request.user,
            )
            _audit_hrms(request, membership.company, action="hrms.payroll.payment_status_recorded", object_type="hrms_payroll_payment", object_id=payment.id, after={"run_id": str(payment.run_id), "status": payment.status})
            run = payment.run
        _audit_hrms(request, membership.company, action=f"hrms.payroll.{action}", object_type="hrms_payroll_run", object_id=run.id, after={"status": run.status})
        return Response(_payroll_run_payload(run, include_lines=action in {"calculate", "finalize", "reverse"}))


class MyPayslipListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = require_permission(request.user, company_id, "hrms.payroll.payslip.own")
        _installed(membership.company)
        if membership.person_id is None:
            return Response({"results": []})
        rows = Payslip.objects.filter(
            company=membership.company,
            run__status="finalized",
            line__employment__person_id=membership.person_id,
        ).select_related("run__period", "line__employment").order_by("-run__finalized_at")
        return Response({"results": [{"id": str(row.id), "run_id": str(row.run_id), "period": row.run.period.name, "issued_at": row.issued_at.isoformat(), "snapshot": row.snapshot} for row in rows]})


class MyCompensationView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = require_permission(request.user, company_id, "hrms.compensation.own.view")
        _installed(membership.company)
        if membership.person_id is None:
            return Response({"results": []})
        today = timezone.localdate()
        rows = CompensationAssignment.objects.filter(
            company=membership.company,
            employment__person_id=membership.person_id,
            employment__status=EmploymentStatus.ACTIVE,
            starts_on__lte=today,
        ).filter(models.Q(ends_on__isnull=True) | models.Q(ends_on__gte=today)).select_related("employment", "structure")
        return Response(
            {
                "results": [
                    {
                        "employment_id": str(row.employment_id),
                        "structure_name": row.structure.name,
                        "monthly_base_salary": str(row.monthly_base_salary),
                        "currency": row.currency,
                        "currency_precision": row.currency_precision,
                        "effective_from": row.starts_on.isoformat(),
                    }
                    for row in rows.order_by("employment_id", "-starts_on")
                ]
            }
        )


class DesignationListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = require_permission(request.user, company_id, "hrms.employee.view")
        _installed(membership.company)
        rows = leave_services.list_designations(company=membership.company)
        return Response({"results": [leave_services.serialize_designation(r) for r in rows]})

    def post(self, request, company_id):
        membership = require_permission(request.user, company_id, "hrms.employee.manage")
        _installed(membership.company)
        row = leave_services.create_designation(company=membership.company, payload=request.data)
        _audit_hrms(request, membership.company, action="hrms.designation.created", object_type="designation", object_id=row.id, after=leave_services.serialize_designation(row))
        return Response(leave_services.serialize_designation(row), status=201)


class OnboardingTaskListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = require_permission(request.user, company_id, "hrms.employee.view")
        _installed(membership.company)
        rows = leave_services.list_onboarding_tasks(company=membership.company, employment_id=request.query_params.get("employment_id"))
        return Response({"results": [leave_services.serialize_onboarding_task(r) for r in rows]})

    def post(self, request, company_id):
        membership = require_permission(request.user, company_id, "hrms.employee.manage")
        _installed(membership.company)
        row = leave_services.create_onboarding_task(company=membership.company, employment_id=request.data.get("employment_id"), payload=request.data)
        return Response(leave_services.serialize_onboarding_task(row), status=201)


class OnboardingTaskDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, company_id, task_id):
        membership = require_permission(request.user, company_id, "hrms.employee.view")
        _installed(membership.company)
        row = leave_services.update_onboarding_task(company=membership.company, task_id=task_id, payload=request.data, actor=request.user)
        return Response(leave_services.serialize_onboarding_task(row))


class OffboardingTaskListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = require_permission(request.user, company_id, "hrms.employee.view")
        _installed(membership.company)
        rows = leave_services.list_offboarding_tasks(company=membership.company, employment_id=request.query_params.get("employment_id"))
        return Response({"results": [leave_services.serialize_offboarding_task(r) for r in rows]})

    def post(self, request, company_id):
        membership = require_permission(request.user, company_id, "hrms.employee.manage")
        _installed(membership.company)
        row = leave_services.create_offboarding_task(company=membership.company, employment_id=request.data.get("employment_id"), payload=request.data)
        return Response(leave_services.serialize_offboarding_task(row), status=201)


class OffboardingTaskDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, company_id, task_id):
        membership = require_permission(request.user, company_id, "hrms.employee.view")
        _installed(membership.company)
        row = leave_services.update_offboarding_task(company=membership.company, task_id=task_id, payload=request.data, actor=request.user)
        return Response(leave_services.serialize_offboarding_task(row))


class EmployeeDocumentListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = require_permission(request.user, company_id, "hrms.documents.view")
        _installed(membership.company)
        from apps.authorization.company import effective_permission_codes
        include_sensitive = "hrms.documents.sensitive.view" in effective_permission_codes(membership)
        rows = leave_services.list_employee_documents(
            company=membership.company,
            employment_id=request.query_params.get("employment_id"),
            include_sensitive=include_sensitive,
        )
        return Response({"results": [leave_services.serialize_employee_document(r) for r in rows]})

    def post(self, request, company_id):
        membership = require_permission(request.user, company_id, "hrms.documents.manage")
        _installed(membership.company)
        row = leave_services.create_employee_document(
            company=membership.company,
            employment_id=request.data.get("employment_id"),
            payload=request.data,
        )
        return Response(leave_services.serialize_employee_document(row), status=201)


class EmployeeDocumentVerifyView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, company_id, document_id):
        membership = require_permission(request.user, company_id, "hrms.documents.manage")
        _installed(membership.company)
        row = leave_services.verify_employee_document(
            company=membership.company,
            document_id=document_id,
            status=request.data.get("status"),
            notes=request.data.get("notes") or "",
            actor=request.user,
        )
        return Response(leave_services.serialize_employee_document(row))


class MyDocumentListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = require_permission(request.user, company_id, "hrms.employee.view")
        _installed(membership.company)
        if not membership.person_id:
            return Response({"results": []})
        emp_ids = list(Employment.objects.filter(company=membership.company, person_id=membership.person_id).values_list("id", flat=True))
        rows = leave_services.list_employee_documents(company=membership.company, include_sensitive=True).filter(employment_id__in=emp_ids)
        return Response({"results": [leave_services.serialize_employee_document(r) for r in rows]})

    def post(self, request, company_id):
        membership = require_permission(request.user, company_id, "hrms.employee.view")
        _installed(membership.company)
        if not membership.person_id:
            raise not_found("No employee record linked.")
        emp = Employment.objects.filter(company=membership.company, person_id=membership.person_id, status=EmploymentStatus.ACTIVE).first()
        if not emp:
            raise not_found("No active employment found.")
        row = leave_services.create_employee_document(company=membership.company, employment_id=emp.id, payload=request.data)
        return Response(leave_services.serialize_employee_document(row), status=201)


class HRRequestListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = require_permission(request.user, company_id, "hrms.employee.manage")
        _installed(membership.company)
        rows = leave_services.list_hr_requests(company=membership.company, employment_id=request.query_params.get("employment_id"))
        return Response({"results": [leave_services.serialize_hr_request(r) for r in rows]})

    def post(self, request, company_id):
        membership = require_permission(request.user, company_id, "hrms.employee.manage")
        _installed(membership.company)
        row = leave_services.create_hr_request(company=membership.company, employment_id=request.data.get("employment_id"), payload=request.data, actor=request.user)
        return Response(leave_services.serialize_hr_request(row), status=201)


class HRRequestDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, company_id, request_id):
        membership = require_permission(request.user, company_id, "hrms.employee.manage")
        _installed(membership.company)
        row = leave_services.update_hr_request(company=membership.company, request_id=request_id, payload=request.data, actor=request.user)
        return Response(leave_services.serialize_hr_request(row))


class MyHRRequestListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = require_permission(request.user, company_id, "hrms.employee.view")
        _installed(membership.company)
        if not membership.person_id:
            return Response({"results": []})
        emp_ids = list(Employment.objects.filter(company=membership.company, person_id=membership.person_id).values_list("id", flat=True))
        rows = leave_services.list_hr_requests(company=membership.company).filter(employment_id__in=emp_ids)
        return Response({"results": [leave_services.serialize_hr_request(r) for r in rows]})

    def post(self, request, company_id):
        membership = require_permission(request.user, company_id, "hrms.employee.view")
        _installed(membership.company)
        if not membership.person_id:
            raise not_found("No employee record linked.")
        emp = Employment.objects.filter(company=membership.company, person_id=membership.person_id, status=EmploymentStatus.ACTIVE).first()
        if not emp:
            raise not_found("No active employment found.")
        row = leave_services.create_hr_request(company=membership.company, employment_id=emp.id, payload=request.data, actor=request.user)
        return Response(leave_services.serialize_hr_request(row), status=201)


class ApprovalDelegationListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = require_permission(request.user, company_id, "hrms.reporting.manage")
        _installed(membership.company)
        rows = leave_services.list_approval_delegations(
            company=membership.company,
            delegator_id=request.query_params.get("delegator_id"),
            delegate_id=request.query_params.get("delegate_id"),
        )
        return Response({"results": [leave_services.serialize_approval_delegation(r) for r in rows]})

    def post(self, request, company_id):
        membership = require_permission(request.user, company_id, "hrms.reporting.manage")
        _installed(membership.company)
        row = leave_services.create_approval_delegation(company=membership.company, payload=request.data, actor=request.user)
        return Response(leave_services.serialize_approval_delegation(row), status=201)


class ApprovalDelegationRevokeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, company_id, delegation_id):
        membership = require_permission(request.user, company_id, "hrms.reporting.manage")
        _installed(membership.company)
        row = leave_services.revoke_approval_delegation(company=membership.company, delegation_id=delegation_id, actor=request.user)
        return Response(leave_services.serialize_approval_delegation(row))


class PendingApprovalReassignView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, company_id):
        membership = require_permission(request.user, company_id, "hrms.reporting.manage")
        _installed(membership.company)
        result = leave_services.reassign_pending_approvals(
            company=membership.company,
            old_manager_employment_id=request.data.get("old_manager_employment_id"),
            new_manager_employment_id=request.data.get("new_manager_employment_id"),
            reason=request.data.get("reason") or "Manager departure or reassignment",
            actor=request.user,
        )
        return Response(result)


class AttendanceCorrectionListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = require_permission(request.user, company_id, "hrms.attendance.view")
        _installed(membership.company)
        rows = leave_services.list_attendance_corrections(
            company=membership.company,
            employment_id=request.query_params.get("employment_id"),
            status=request.query_params.get("status"),
        )
        return Response({"results": [leave_services.serialize_attendance_correction(r) for r in rows]})

    def post(self, request, company_id):
        membership = require_permission(request.user, company_id, "hrms.attendance.view")
        _installed(membership.company)
        row = leave_services.request_attendance_correction(
            company=membership.company,
            employment_id=request.data.get("employment_id"),
            payload=request.data,
            actor=request.user,
        )
        return Response(leave_services.serialize_attendance_correction(row), status=201)


class AttendanceCorrectionDecisionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, company_id, correction_id):
        membership = require_permission(request.user, company_id, "hrms.attendance.correction.approve")
        _installed(membership.company)
        row = leave_services.decide_attendance_correction(
            company=membership.company,
            correction_id=correction_id,
            status=request.data.get("status"),
            decision_note=request.data.get("decision_note") or "",
            actor=request.user,
        )
        return Response(leave_services.serialize_attendance_correction(row))


class AttendanceExceptionListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = require_permission(request.user, company_id, "hrms.attendance.view")
        _installed(membership.company)
        rows = leave_services.list_attendance_exceptions(
            company=membership.company,
            employment_id=request.query_params.get("employment_id"),
            status=request.query_params.get("status"),
        )
        return Response({"results": [leave_services.serialize_attendance_exception(r) for r in rows]})


class AttendanceExceptionResolveView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, company_id, exception_id):
        membership = require_permission(request.user, company_id, "hrms.attendance.manage")
        _installed(membership.company)
        row = leave_services.resolve_attendance_exception(
            company=membership.company,
            exception_id=exception_id,
            resolution=request.data.get("resolution") or "",
            actor=request.user,
        )
        return Response(leave_services.serialize_attendance_exception(row))


class TeamAttendanceView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = require_permission(request.user, company_id, "hrms.attendance.view")
        _installed(membership.company)
        mgr_id = request.query_params.get("manager_employment_id")
        if not mgr_id and membership.person_id:
            emp = Employment.objects.filter(company=membership.company, person_id=membership.person_id, status=EmploymentStatus.ACTIVE).first()
            if emp:
                mgr_id = emp.id
        if not mgr_id:
            return Response({"results": []})
        rows = leave_services.list_team_attendance(
            company=membership.company,
            manager_employment_id=mgr_id,
            work_date=request.query_params.get("work_date"),
        )
        return Response({"results": rows})


class TeamDirectoryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = require_permission(request.user, company_id, "hrms.employee.view")
        _installed(membership.company)
        mgr_id = request.query_params.get("manager_employment_id")
        if not mgr_id and membership.person_id:
            emp = Employment.objects.filter(company=membership.company, person_id=membership.person_id, status=EmploymentStatus.ACTIVE).first()
            if emp:
                mgr_id = emp.id
        if not mgr_id:
            return Response({"results": []})
        rows = leave_services.list_team_directory(company=membership.company, manager_employment_id=mgr_id)
        return Response({"results": rows})


class TeamCalendarView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = require_permission(request.user, company_id, "hrms.leave.view")
        _installed(membership.company)
        mgr_id = request.query_params.get("manager_employment_id")
        if not mgr_id and membership.person_id:
            emp = Employment.objects.filter(company=membership.company, person_id=membership.person_id, status=EmploymentStatus.ACTIVE).first()
            if emp:
                mgr_id = emp.id
        if not mgr_id:
            return Response({"results": []})
        rows = leave_services.list_team_leave_calendar(
            company=membership.company,
            manager_employment_id=mgr_id,
            start_date=request.query_params.get("starts_on"),
            end_date=request.query_params.get("ends_on"),
        )
        return Response({"results": rows})


class HrmsDashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = require_permission(request.user, company_id, "hrms.leave.view")
        _installed(membership.company)
        leave_services.sync_company_memberships_to_employments(company=membership.company, actor=request.user)
        return Response(leave_services.get_hrms_dashboard_overview(company=membership.company, membership=membership))


class HrmsReportsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = require_permission(request.user, company_id, "hrms.employee.view")
        _installed(membership.company)
        report_type = request.query_params.get("type", "attendance")
        return Response(leave_services.get_hrms_reports(
            company=membership.company,
            report_type=report_type,
            query_params=request.query_params,
        ))
