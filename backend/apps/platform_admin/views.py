from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.authorization.permissions import HasPlatformPermission
from apps.platform_admin.services import empty_record_page, list_audit_logs, list_companies, list_users, platform_overview


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


class PlatformOverviewView(APIView):
    required_platform_permission = "platform.companies.view"
    permission_classes = [IsAuthenticated, HasPlatformPermission]

    def get(self, request):
        return Response(platform_overview())


class PlatformUserListView(APIView):
    required_platform_permission = "platform.users.view"
    permission_classes = [IsAuthenticated, HasPlatformPermission]

    def get(self, request):
        return Response(list_users(query_params=request.query_params))


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
