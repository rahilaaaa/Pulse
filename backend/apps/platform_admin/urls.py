from django.urls import path

from apps.platform_admin.views import (
    PlatformCompanyDashboardView,
    PlatformCompanyDetailView,
    PlatformCompanyListView,
    PlatformAuditListView,
    PlatformEmptyRecordView,
    PlatformOverviewView,
    PlatformPermissionCatalogView,
    PlatformUserDetailView,
    PlatformUserListView,
    PlatformUserPasswordResetView,
)

urlpatterns = [
    path("platform/overview/", PlatformOverviewView.as_view(), name="platform-overview"),
    path("platform/companies/", PlatformCompanyListView.as_view(), name="platform-companies"),
    path(
        "platform/companies/<uuid:company_id>/dashboard/",
        PlatformCompanyDashboardView.as_view(),
        name="platform-company-dashboard",
    ),
    path("platform/companies/<uuid:company_id>/", PlatformCompanyDetailView.as_view(), name="platform-company"),
    path("platform/users/", PlatformUserListView.as_view(), name="platform-users"),
    path("platform/users/<uuid:user_id>/", PlatformUserDetailView.as_view(), name="platform-user"),
    path(
        "platform/users/<uuid:user_id>/send-password-reset/",
        PlatformUserPasswordResetView.as_view(),
        name="platform-user-password-reset",
    ),
    path("platform/permissions/", PlatformPermissionCatalogView.as_view(), name="platform-permissions"),
    path(
        "platform/billing/",
        PlatformEmptyRecordView.as_view(required_platform_permission="platform.billing.view"),
        name="platform-billing",
    ),
    path(
        "platform/modules/",
        PlatformEmptyRecordView.as_view(required_platform_permission="platform.modules.manage"),
        name="platform-modules",
    ),
    path("platform/audit-logs/", PlatformAuditListView.as_view(), name="platform-audit"),
    path(
        "platform/settings/",
        PlatformEmptyRecordView.as_view(required_platform_permission="platform.operations.view"),
        name="platform-settings",
    ),
]
