from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.authorization.permissions import HasPlatformPermission
from apps.platform_admin.services import (
    create_platform_user,
    empty_record_page,
    get_company,
    get_company_dashboard,
    get_user,
    list_audit_logs,
    list_companies,
    list_platform_permissions,
    list_users,
    platform_overview,
    send_platform_user_password_reset,
    update_platform_user,
)


class PlatformCompanyListView(APIView):
    required_platform_permission = "platform.companies.view"
    permission_classes = [IsAuthenticated, HasPlatformPermission]

    @extend_schema(
        parameters=[
            OpenApiParameter(name="q", type=str, required=False),
            OpenApiParameter(name="status", type=str, required=False),
            OpenApiParameter(name="created_from", type=str, required=False),
            OpenApiParameter(name="created_to", type=str, required=False),
            OpenApiParameter(name="sort", type=str, required=False),
            OpenApiParameter(name="page", type=int, required=False),
            OpenApiParameter(name="page_size", type=int, required=False),
        ]
    )
    def get(self, request):
        return Response(list_companies(query_params=request.query_params))


class PlatformCompanyDetailView(APIView):
    required_platform_permission = "platform.companies.view"
    permission_classes = [IsAuthenticated, HasPlatformPermission]

    def get(self, request, company_id):
        return Response(get_company(company_id=company_id))


class PlatformCompanyDashboardView(APIView):
    required_platform_permission = "platform.companies.view"
    permission_classes = [IsAuthenticated, HasPlatformPermission]

    def get(self, request, company_id):
        return Response(get_company_dashboard(company_id=company_id))


class PlatformOverviewView(APIView):
    required_platform_permission = "platform.companies.view"
    permission_classes = [IsAuthenticated, HasPlatformPermission]

    def get(self, request):
        return Response(platform_overview())


class PlatformUserListView(APIView):
    required_platform_permissions = {
        "GET": "platform.users.view",
        "POST": "platform.users.manage",
    }
    permission_classes = [IsAuthenticated, HasPlatformPermission]

    def get(self, request):
        return Response(list_users(query_params=request.query_params))

    def post(self, request):
        payload = create_platform_user(actor=request.user, payload=request.data, request=request)
        return Response(payload, status=201)


class PlatformUserDetailView(APIView):
    required_platform_permissions = {
        "GET": "platform.users.view",
        "PATCH": "platform.users.manage",
    }
    permission_classes = [IsAuthenticated, HasPlatformPermission]

    def get(self, request, user_id):
        return Response(get_user(user_id=user_id))

    def patch(self, request, user_id):
        return Response(update_platform_user(actor=request.user, user_id=user_id, payload=request.data, request=request))


class PlatformUserPasswordResetView(APIView):
    required_platform_permission = "platform.users.manage"
    permission_classes = [IsAuthenticated, HasPlatformPermission]

    def post(self, request, user_id):
        send_platform_user_password_reset(actor=request.user, user_id=user_id, request=request)
        return Response(status=202)


class PlatformPermissionCatalogView(APIView):
    required_platform_permission = "platform.users.view"
    permission_classes = [IsAuthenticated, HasPlatformPermission]

    def get(self, request):
        return Response({"results": list_platform_permissions()})


class PlatformAuditListView(APIView):
    required_platform_permission = "platform.audit.view"
    permission_classes = [IsAuthenticated, HasPlatformPermission]

    def get(self, request):
        return Response(list_audit_logs(query_params=request.query_params))


class PlatformEmptyRecordView(APIView):
    required_platform_permission = ""
    permission_classes = [IsAuthenticated, HasPlatformPermission]

    def get(self, request):
        return Response(empty_record_page(query_params=request.query_params))
