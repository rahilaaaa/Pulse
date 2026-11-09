from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.authorization.permissions import HasPlatformPermission
from apps.platform_admin.services import (
    accept_platform_invitation,
    activate_company,
    billing_overview,
    change_company_subscription_plan,
    close_company,
    create_platform_company,
    create_platform_invitation,
    create_platform_role,
    create_platform_user,
    deactivate_platform_operator,
    delete_platform_role,
    empty_record_page,
    get_audit_log_detail,
    get_company,
    get_company_dashboard,
    get_operator_activity_history,
    get_platform_module_detail,
    get_platform_operator_detail,
    get_platform_role_detail,
    get_platform_settings,
    get_user,
    install_company_module,
    list_audit_logs,
    list_companies,
    list_company_audit_logs,
    list_platform_modules,
    list_platform_operators,
    list_platform_permissions,
    list_platform_plans,
    list_platform_roles,
    list_platform_subscriptions,
    list_users,
    onboarding_monitoring,
    platform_health_overview,
    platform_overview,
    reactivate_company,
    reactivate_platform_operator,
    resend_platform_invitation,
    revoke_operator_sessions,
    revoke_platform_invitation,
    send_platform_user_password_reset,
    suspend_company,
    suspend_platform_operator,
    transfer_super_admin_ownership,
    uninstall_company_module,
    update_company_metadata,
    update_platform_module_availability,
    update_platform_operator,
    update_platform_role,
    update_platform_settings,
    update_platform_user,
    verify_platform_invitation,
)


class PlatformCompanyListView(APIView):
    required_platform_permissions = {
        "GET": "platform.companies.view",
        "POST": "platform.companies.manage",
    }
    permission_classes = [IsAuthenticated, HasPlatformPermission]

    @extend_schema(
        parameters=[
            OpenApiParameter(name="q", type=str, required=False),
            OpenApiParameter(name="status", type=str, required=False),
            OpenApiParameter(name="plan", type=str, required=False),
            OpenApiParameter(name="subscription_status", type=str, required=False),
            OpenApiParameter(name="module", type=str, required=False),
            OpenApiParameter(name="created_from", type=str, required=False),
            OpenApiParameter(name="created_to", type=str, required=False),
            OpenApiParameter(name="sort", type=str, required=False),
            OpenApiParameter(name="page", type=int, required=False),
            OpenApiParameter(name="page_size", type=int, required=False),
        ]
    )
    def get(self, request):
        return Response(list_companies(query_params=request.query_params))

    def post(self, request):
        payload = create_platform_company(actor=request.user, payload=request.data, request=request)
        return Response(payload, status=201)


class PlatformCompanyDetailView(APIView):
    required_platform_permissions = {
        "GET": "platform.companies.view",
        "PATCH": "platform.companies.manage",
    }
    permission_classes = [IsAuthenticated, HasPlatformPermission]

    def get(self, request, company_id):
        return Response(get_company(company_id=company_id))

    def patch(self, request, company_id):
        return Response(update_company_metadata(actor=request.user, company_id=company_id, payload=request.data, request=request))


class PlatformCompanyActivateView(APIView):
    required_platform_permission = "platform.companies.manage"
    permission_classes = [IsAuthenticated, HasPlatformPermission]

    def post(self, request, company_id):
        return Response(activate_company(actor=request.user, company_id=company_id, request=request))


class PlatformCompanySuspendView(APIView):
    required_platform_permission = "platform.companies.manage"
    permission_classes = [IsAuthenticated, HasPlatformPermission]

    def post(self, request, company_id):
        return Response(suspend_company(actor=request.user, company_id=company_id, payload=request.data, request=request))


class PlatformCompanyReactivateView(APIView):
    required_platform_permission = "platform.companies.manage"
    permission_classes = [IsAuthenticated, HasPlatformPermission]

    def post(self, request, company_id):
        return Response(reactivate_company(actor=request.user, company_id=company_id, request=request))


class PlatformCompanyCloseView(APIView):
    required_platform_permission = "platform.companies.manage"
    permission_classes = [IsAuthenticated, HasPlatformPermission]

    def post(self, request, company_id):
        return Response(close_company(actor=request.user, company_id=company_id, payload=request.data, request=request))


class PlatformCompanyAuditListView(APIView):
    required_platform_permission = "platform.companies.view"
    permission_classes = [IsAuthenticated, HasPlatformPermission]

    def get(self, request, company_id):
        return Response(list_company_audit_logs(company_id=company_id, query_params=request.query_params))


class PlatformCompanyDashboardView(APIView):
    required_platform_permission = "platform.companies.view"
    permission_classes = [IsAuthenticated, HasPlatformPermission]

    def get(self, request, company_id):
        return Response(get_company_dashboard(company_id=company_id))


class PlatformCompanyModuleInstallView(APIView):
    required_platform_permission = "platform.modules.manage"
    permission_classes = [IsAuthenticated, HasPlatformPermission]

    def post(self, request, company_id, slug):
        return Response(install_company_module(actor=request.user, company_id=company_id, slug=slug, request=request), status=200)


class PlatformCompanyModuleUninstallView(APIView):
    required_platform_permission = "platform.modules.manage"
    permission_classes = [IsAuthenticated, HasPlatformPermission]

    def post(self, request, company_id, slug):
        return Response(uninstall_company_module(actor=request.user, company_id=company_id, slug=slug, request=request), status=200)


class PlatformCompanySubscriptionChangeView(APIView):
    required_platform_permission = "platform.billing.manage"
    permission_classes = [IsAuthenticated, HasPlatformPermission]

    def post(self, request, company_id):
        return Response(
            change_company_subscription_plan(actor=request.user, company_id=company_id, payload=request.data, request=request),
            status=200,
        )


class PlatformModuleListView(APIView):
    required_platform_permission = "platform.modules.manage"
    permission_classes = [IsAuthenticated, HasPlatformPermission]

    def get(self, request):
        return Response(list_platform_modules())


class PlatformModuleDetailView(APIView):
    required_platform_permissions = {
        "GET": "platform.modules.manage",
        "PATCH": "platform.modules.manage",
    }
    permission_classes = [IsAuthenticated, HasPlatformPermission]

    def get(self, request, slug):
        return Response(get_platform_module_detail(slug=slug))

    def patch(self, request, slug):
        return Response(update_platform_module_availability(actor=request.user, slug=slug, payload=request.data, request=request))


class PlatformBillingOverviewView(APIView):
    required_platform_permission = "platform.billing.view"
    permission_classes = [IsAuthenticated, HasPlatformPermission]

    def get(self, request):
        return Response(billing_overview())


class PlatformSubscriptionListView(APIView):
    required_platform_permission = "platform.billing.view"
    permission_classes = [IsAuthenticated, HasPlatformPermission]

    def get(self, request):
        return Response(list_platform_subscriptions(query_params=request.query_params))


class PlatformBillingPlanListView(APIView):
    required_platform_permission = "platform.billing.view"
    permission_classes = [IsAuthenticated, HasPlatformPermission]

    def get(self, request):
        return Response(list_platform_plans())


class PlatformSettingsView(APIView):
    required_platform_permissions = {
        "GET": "platform.operations.view",
        "PATCH": "platform.operations.view",
    }
    permission_classes = [IsAuthenticated, HasPlatformPermission]

    def get(self, request):
        return Response(get_platform_settings())

    def patch(self, request):
        return Response(update_platform_settings(actor=request.user, payload=request.data, request=request))


class PlatformHealthView(APIView):
    required_platform_permission = "platform.operations.view"
    permission_classes = [IsAuthenticated, HasPlatformPermission]

    def get(self, request):
        return Response(platform_health_overview())


class PlatformOnboardingMonitorView(APIView):
    required_platform_permission = "platform.companies.view"
    permission_classes = [IsAuthenticated, HasPlatformPermission]

    def get(self, request):
        return Response(onboarding_monitoring())


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


class PlatformAuditDetailView(APIView):
    required_platform_permission = "platform.audit.view"
    permission_classes = [IsAuthenticated, HasPlatformPermission]

    def get(self, request, log_id):
        return Response(get_audit_log_detail(log_id=log_id))


class PlatformEmptyRecordView(APIView):
    required_platform_permission = ""
    permission_classes = [IsAuthenticated, HasPlatformPermission]

    def get(self, request):
        return Response(empty_record_page(query_params=request.query_params))


class PlatformRoleListView(APIView):
    required_platform_permissions = {
        "GET": "platform.users.view",
        "POST": "platform.users.manage",
    }
    permission_classes = [IsAuthenticated, HasPlatformPermission]

    def get(self, request):
        return Response(list_platform_roles(query_params=request.query_params))

    def post(self, request):
        return Response(create_platform_role(actor=request.user, payload=request.data, request=request), status=201)


class PlatformRoleDetailView(APIView):
    required_platform_permissions = {
        "GET": "platform.users.view",
        "PATCH": "platform.users.manage",
        "DELETE": "platform.users.manage",
    }
    permission_classes = [IsAuthenticated, HasPlatformPermission]

    def get(self, request, role_id):
        return Response(get_platform_role_detail(role_id=role_id))

    def patch(self, request, role_id):
        return Response(update_platform_role(actor=request.user, role_id=role_id, payload=request.data, request=request))

    def delete(self, request, role_id):
        return Response(delete_platform_role(actor=request.user, role_id=role_id, request=request))


class PlatformInvitationListView(APIView):
    required_platform_permission = "platform.users.manage"
    permission_classes = [IsAuthenticated, HasPlatformPermission]

    def post(self, request):
        return Response(create_platform_invitation(actor=request.user, payload=request.data, request=request), status=201)


class PlatformInvitationResendView(APIView):
    required_platform_permission = "platform.users.manage"
    permission_classes = [IsAuthenticated, HasPlatformPermission]

    def post(self, request, invitation_id):
        return Response(resend_platform_invitation(actor=request.user, invitation_id=invitation_id, request=request))


class PlatformInvitationRevokeView(APIView):
    required_platform_permission = "platform.users.manage"
    permission_classes = [IsAuthenticated, HasPlatformPermission]

    def post(self, request, invitation_id):
        return Response(revoke_platform_invitation(actor=request.user, invitation_id=invitation_id, request=request))


class PlatformInvitationVerifyView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        token = request.query_params.get("token", "")
        return Response(verify_platform_invitation(token=token))


class PlatformInvitationAcceptView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        return Response(accept_platform_invitation(payload=request.data, request=request))


class PlatformOperatorSuspendView(APIView):
    required_platform_permission = "platform.users.manage"
    permission_classes = [IsAuthenticated, HasPlatformPermission]

    def post(self, request, user_id):
        return Response(suspend_platform_operator(actor=request.user, user_id=user_id, payload=request.data, request=request))


class PlatformOperatorReactivateView(APIView):
    required_platform_permission = "platform.users.manage"
    permission_classes = [IsAuthenticated, HasPlatformPermission]

    def post(self, request, user_id):
        return Response(reactivate_platform_operator(actor=request.user, user_id=user_id, payload=request.data, request=request))


class PlatformOperatorDeactivateView(APIView):
    required_platform_permission = "platform.users.manage"
    permission_classes = [IsAuthenticated, HasPlatformPermission]

    def post(self, request, user_id):
        return Response(deactivate_platform_operator(actor=request.user, user_id=user_id, payload=request.data, request=request))


class PlatformOperatorRevokeSessionsView(APIView):
    required_platform_permission = "platform.users.manage"
    permission_classes = [IsAuthenticated, HasPlatformPermission]

    def post(self, request, user_id):
        return Response(revoke_operator_sessions(actor=request.user, user_id=user_id, request=request))


class PlatformOperatorActivityView(APIView):
    required_platform_permission = "platform.users.view"
    permission_classes = [IsAuthenticated, HasPlatformPermission]

    def get(self, request, user_id):
        return Response(get_operator_activity_history(user_id=user_id, query_params=request.query_params))


class PlatformSuperAdminTransferView(APIView):
    required_platform_permission = "platform.users.manage"
    permission_classes = [IsAuthenticated, HasPlatformPermission]

    def post(self, request):
        return Response(transfer_super_admin_ownership(actor=request.user, payload=request.data, request=request))

