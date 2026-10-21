from django.db import transaction
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.models import AuditLog
from apps.authorization.company import require_permission
from apps.hrms.models import LeavePolicy, LeaveRequest, LeaveRequestStatus
from apps.modules_registry.models import CompanyModuleInstallation, InstallationStatus
from apps.tenants.services import _ip, _request_id
from common.api.errors import conflict, not_found, validation_error


def _installed(company):
    if not CompanyModuleInstallation.objects.filter(company=company, module_id="hrms", status=InstallationStatus.INSTALLED).exists():
        raise not_found("HRMS is not installed.")


class LeaveRequestListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = require_permission(request.user, company_id, "hrms.leave.view")
        _installed(membership.company)
        rows = LeaveRequest.objects.filter(company=membership.company).select_related("person", "policy").order_by("-created_at")
        return Response(
            {
                "results": [
                    {
                        "id": str(row.id),
                        "person": f"{row.person.first_name} {row.person.last_name}".strip(),
                        "policy": row.policy.name,
                        "status": row.status,
                        "starts_on": row.starts_on.isoformat(),
                        "ends_on": row.ends_on.isoformat(),
                        "reason": row.reason,
                    }
                    for row in rows
                ]
            }
        )

    def post(self, request, company_id):
        membership = require_permission(request.user, company_id, "hrms.leave.request")
        _installed(membership.company)
        if membership.person_id is None:
            raise conflict("Link a person before requesting leave.")
        policy = LeavePolicy.objects.filter(company=membership.company).order_by("name").first()
        if policy is None:
            raise conflict("Leave is not configured.")
        starts = request.data.get("starts_on")
        ends = request.data.get("ends_on")
        if not starts or not ends:
            raise validation_error([{"field": "starts_on", "code": "required", "message": "Enter the leave dates."}])
        row = LeaveRequest.objects.create(
            company=membership.company,
            person=membership.person,
            policy=policy,
            starts_on=starts,
            ends_on=ends,
            reason=(request.data.get("reason") or "")[:500],
        )
        return Response({"id": str(row.id), "status": row.status}, status=201)


class LeaveDecisionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, company_id, request_id):
        membership = require_permission(request.user, company_id, "hrms.leave.decide")
        _installed(membership.company)
        row = LeaveRequest.objects.filter(company=membership.company, pk=request_id).first()
        if row is None:
            raise not_found()
        decision = request.data.get("status")
        if decision not in {LeaveRequestStatus.APPROVED, LeaveRequestStatus.REJECTED}:
            raise validation_error([{"field": "status", "code": "invalid", "message": "Choose approved or rejected."}])
        previous = row.status
        with transaction.atomic():
            row.status = decision
            row.decided_by = request.user
            row.save(update_fields=["status", "decided_by", "updated_at"])
            if previous != decision:
                AuditLog.objects.create(
                    company=membership.company,
                    actor=request.user,
                    action="hrms.leave.decided",
                    object_type="hrms_leave_request",
                    object_id=row.id,
                    before={"status": previous},
                    after={"status": decision},
                    ip_address=_ip(request),
                    request_id=_request_id(request),
                )
        return Response({"id": str(row.id), "status": row.status})
