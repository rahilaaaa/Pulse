from django.urls import path

from apps.platform_admin.views import (
    PlatformCompanyListView,
    PlatformAuditListView,
    PlatformEmptyRecordView,
    PlatformOverviewView,
    PlatformUserListView,
)

urlpatterns = [
    path("platform/overview/", PlatformOverviewView.as_view(), name="platform-overview"),
    path("platform/companies/", PlatformCompanyListView.as_view(), name="platform-companies"),
    path("platform/users/", PlatformUserListView.as_view(), name="platform-users"),
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
