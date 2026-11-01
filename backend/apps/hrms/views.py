from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.models import AuditLog
from apps.authorization.company import require_permission
from apps.hrms import services as leave_services
from apps.modules_registry.models import CompanyModuleInstallation, InstallationStatus
from apps.tenants.services import _ip, _request_id
from common.api.errors import not_found


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
