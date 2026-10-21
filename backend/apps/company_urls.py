from django.urls import path

from apps.authorization.role_views import RoleDetailView, RoleDuplicateView, RoleListView, RoleNavigationView, StudioView
from apps.hrms.views import LeaveDecisionView, LeaveRequestListView
from apps.organization.views import PersonListView, UnitDetailView, UnitListView, UnitMembersView, UnitTypeDetailView, UnitTypeListView
from apps.identity.urls import session_view
from apps.modules_registry.views import ModuleCatalogView, ModuleInstallView
from apps.tenants.custom_fields import CustomFieldDetailView, CustomFieldListView
from apps.tenants.notifications import AnnouncementListView, NotificationListView, NotificationPreferenceView
from apps.tenants.company_views import (
    AuditListView,
    CompanySettingsView,
    InvitationAcceptView,
    InvitationActionView,
    InvitationListView,
    MembershipListView,
    MembershipRolesView,
    MembershipStatusView,
    OverviewView,
    WorkspaceEnterView,
    WorkspaceView,
)

urlpatterns = [
    path("workspace/", WorkspaceView.as_view(), name="workspace"),
    path("workspace/enter/", session_view(WorkspaceEnterView), name="workspace-enter"),
    path("workspace/overview/", OverviewView.as_view(), name="workspace-overview"),
    path("invitations/accept/", session_view(InvitationAcceptView), name="invitation-accept"),
    path("companies/<uuid:company_id>/memberships/", MembershipListView.as_view(), name="company-memberships"),
    path("companies/<uuid:company_id>/memberships/<uuid:membership_id>/status/", session_view(MembershipStatusView), name="company-membership-status"),
    path("companies/<uuid:company_id>/memberships/<uuid:membership_id>/roles/", session_view(MembershipRolesView), name="company-membership-roles"),
    path("companies/<uuid:company_id>/invitations/", session_view(InvitationListView), name="company-invitations"),
    path("companies/<uuid:company_id>/invitations/<uuid:invitation_id>/<slug:action>/", session_view(InvitationActionView), name="company-invitation-action"),
    path("companies/<uuid:company_id>/roles/", session_view(RoleListView), name="company-roles"),
    path("companies/<uuid:company_id>/roles/<uuid:role_id>/", session_view(RoleDetailView), name="company-role"),
    path("companies/<uuid:company_id>/roles/<uuid:role_id>/duplicate/", session_view(RoleDuplicateView), name="company-role-duplicate"),
    path("companies/<uuid:company_id>/roles/<uuid:role_id>/navigation/", session_view(RoleNavigationView), name="company-role-navigation"),
    path("companies/<uuid:company_id>/roles/<uuid:role_id>/dashboard/", session_view(StudioView), name="company-role-dashboard"),
    path("companies/<uuid:company_id>/modules/", ModuleCatalogView.as_view(), name="company-modules"),
    path("companies/<uuid:company_id>/modules/<slug:slug>/install/", session_view(ModuleInstallView), name="company-module-install"),
    path("companies/<uuid:company_id>/settings/", session_view(CompanySettingsView), name="company-settings"),
    path("companies/<uuid:company_id>/custom-fields/", session_view(CustomFieldListView), name="company-custom-fields"),
    path("companies/<uuid:company_id>/notifications/", session_view(NotificationListView), name="company-notifications"),
    path("companies/<uuid:company_id>/announcements/", session_view(AnnouncementListView), name="company-announcements"),
    path("companies/<uuid:company_id>/notification-preferences/", session_view(NotificationPreferenceView), name="company-notification-preferences"),
    path("companies/<uuid:company_id>/custom-fields/<uuid:field_id>/", session_view(CustomFieldDetailView), name="company-custom-field"),
    path("companies/<uuid:company_id>/audit/", AuditListView.as_view(), name="company-audit"),
    path("companies/<uuid:company_id>/people/", session_view(PersonListView), name="company-people"),
    path("companies/<uuid:company_id>/organization/unit-types/", session_view(UnitTypeListView), name="organization-unit-types"),
    path("companies/<uuid:company_id>/organization/unit-types/<uuid:type_id>/", session_view(UnitTypeDetailView), name="organization-unit-type"),
    path("companies/<uuid:company_id>/organization/units/", session_view(UnitListView), name="organization-units"),
    path("companies/<uuid:company_id>/organization/units/<uuid:unit_id>/", session_view(UnitDetailView), name="organization-unit"),
    path("companies/<uuid:company_id>/organization/units/<uuid:unit_id>/members/", session_view(UnitMembersView), name="organization-unit-members"),
    path("companies/<uuid:company_id>/hrms/leave-requests/", session_view(LeaveRequestListView), name="hrms-leave"),
    path("companies/<uuid:company_id>/hrms/leave-requests/<uuid:request_id>/decision/", session_view(LeaveDecisionView), name="hrms-leave-decision"),
]
