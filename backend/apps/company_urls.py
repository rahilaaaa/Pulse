from django.urls import path

from apps.authorization.role_views import (
    RoleDetailView,
    RoleDuplicateView,
    RoleListView,
    RoleMemberDetailView,
    RoleMembersView,
    RoleNavigationView,
    StudioView,
)
from apps.commerce.views import OrderListView, ProductListView
from apps.crm.views import AccountListView, LeadConvertView, LeadListView
from apps.hrms.views import LeaveBalanceListView, LeaveDecisionView, LeaveRequestListView
from apps.organization.views import (
    PersonDetailView,
    PersonListView,
    PersonStatusView,
    UnitDetailView,
    UnitListView,
    UnitMembersView,
    UnitTypeDetailView,
    UnitTypeListView,
)
from apps.parties.views import PartyDetailView, PartyListView
from apps.projects.views import ProjectDetailView, ProjectListView, ProjectTaskListView
from apps.identity.urls import session_view
from apps.modules_registry.views import ModuleCatalogView, ModuleInstallView, ModuleUninstallView
from apps.tenants.custom_entities import (
    CustomEntityDetailView,
    CustomEntityFieldDetailView,
    CustomEntityFieldListView,
    CustomEntityListView,
    CustomEntityRecordDetailView,
    CustomEntityRecordListView,
)
from apps.tenants.custom_fields import CustomFieldDetailView, CustomFieldListView, ReferenceTargetListView
from apps.tenants.notifications import AnnouncementListView, NotificationListView, NotificationPreferenceView
from apps.tenants.company_views import (
    AuditListView,
    CompanySettingsView,
    InvitationAcceptView,
    InvitationActionView,
    InvitationJoinView,
    InvitationListView,
    InvitationPreviewView,
    MembershipDetailView,
    MembershipListView,
    MembershipRolesView,
    MembershipStatusView,
    OverviewView,
    WorkspaceEnterView,
    WorkspaceSwitchView,
    WorkspaceView,
)

urlpatterns = [
    path("workspace/", WorkspaceView.as_view(), name="workspace"),
    path("workspace/switch/", session_view(WorkspaceSwitchView), name="workspace-switch"),
    path("workspace/enter/", session_view(WorkspaceEnterView), name="workspace-enter"),
    path("workspace/overview/", OverviewView.as_view(), name="workspace-overview"),
    path("invitations/preview/", InvitationPreviewView.as_view(), name="invitation-preview"),
    path("invitations/join/", session_view(InvitationJoinView), name="invitation-join"),
    path("invitations/accept/", session_view(InvitationAcceptView), name="invitation-accept"),
    path("companies/<uuid:company_id>/memberships/", MembershipListView.as_view(), name="company-memberships"),
    path("companies/<uuid:company_id>/memberships/<uuid:membership_id>/", session_view(MembershipDetailView), name="company-membership"),
    path("companies/<uuid:company_id>/memberships/<uuid:membership_id>/status/", session_view(MembershipStatusView), name="company-membership-status"),
    path("companies/<uuid:company_id>/memberships/<uuid:membership_id>/roles/", session_view(MembershipRolesView), name="company-membership-roles"),
    path("companies/<uuid:company_id>/invitations/", session_view(InvitationListView), name="company-invitations"),
    path("companies/<uuid:company_id>/invitations/<uuid:invitation_id>/<slug:action>/", session_view(InvitationActionView), name="company-invitation-action"),
    path("companies/<uuid:company_id>/custom-entities/", session_view(CustomEntityListView), name="company-custom-entities"),
    path(
        "companies/<uuid:company_id>/custom-entities/<uuid:entity_id>/",
        session_view(CustomEntityDetailView),
        name="company-custom-entity",
    ),
    path(
        "companies/<uuid:company_id>/custom-entities/<uuid:entity_id>/fields/",
        session_view(CustomEntityFieldListView),
        name="company-custom-entity-fields",
    ),
    path(
        "companies/<uuid:company_id>/custom-entities/<uuid:entity_id>/fields/<uuid:field_id>/",
        session_view(CustomEntityFieldDetailView),
        name="company-custom-entity-field",
    ),
    path(
        "companies/<uuid:company_id>/custom-entities/<uuid:entity_id>/records/",
        session_view(CustomEntityRecordListView),
        name="company-custom-entity-records",
    ),
    path(
        "companies/<uuid:company_id>/custom-entities/<uuid:entity_id>/records/<uuid:record_id>/",
        session_view(CustomEntityRecordDetailView),
        name="company-custom-entity-record",
    ),
    path("companies/<uuid:company_id>/roles/", session_view(RoleListView), name="company-roles"),
    path("companies/<uuid:company_id>/roles/<uuid:role_id>/", session_view(RoleDetailView), name="company-role"),
    path("companies/<uuid:company_id>/roles/<uuid:role_id>/duplicate/", session_view(RoleDuplicateView), name="company-role-duplicate"),
    path("companies/<uuid:company_id>/roles/<uuid:role_id>/members/", session_view(RoleMembersView), name="company-role-members"),
    path(
        "companies/<uuid:company_id>/roles/<uuid:role_id>/members/<uuid:membership_id>/",
        session_view(RoleMemberDetailView),
        name="company-role-member",
    ),
    path("companies/<uuid:company_id>/roles/<uuid:role_id>/navigation/", session_view(RoleNavigationView), name="company-role-navigation"),
    path("companies/<uuid:company_id>/roles/<uuid:role_id>/dashboard/", session_view(StudioView), name="company-role-dashboard"),
    path("companies/<uuid:company_id>/modules/", ModuleCatalogView.as_view(), name="company-modules"),
    path("companies/<uuid:company_id>/modules/<slug:slug>/install/", session_view(ModuleInstallView), name="company-module-install"),
    path(
        "companies/<uuid:company_id>/modules/<slug:slug>/uninstall/",
        session_view(ModuleUninstallView),
        name="company-module-uninstall",
    ),
    path("companies/<uuid:company_id>/settings/", session_view(CompanySettingsView), name="company-settings"),
    path("companies/<uuid:company_id>/custom-fields/", session_view(CustomFieldListView), name="company-custom-fields"),
    path(
        "companies/<uuid:company_id>/custom-fields/reference-targets/",
        session_view(ReferenceTargetListView),
        name="company-custom-field-reference-targets",
    ),
    path("companies/<uuid:company_id>/notifications/", session_view(NotificationListView), name="company-notifications"),
    path("companies/<uuid:company_id>/announcements/", session_view(AnnouncementListView), name="company-announcements"),
    path("companies/<uuid:company_id>/notification-preferences/", session_view(NotificationPreferenceView), name="company-notification-preferences"),
    path("companies/<uuid:company_id>/custom-fields/<uuid:field_id>/", session_view(CustomFieldDetailView), name="company-custom-field"),
    path("companies/<uuid:company_id>/audit/", AuditListView.as_view(), name="company-audit"),
    path("companies/<uuid:company_id>/people/", session_view(PersonListView), name="company-people"),
    path(
        "companies/<uuid:company_id>/people/<uuid:person_id>/",
        session_view(PersonDetailView),
        name="company-person",
    ),
    path(
        "companies/<uuid:company_id>/people/<uuid:person_id>/status/",
        session_view(PersonStatusView),
        name="company-person-status",
    ),
    path("companies/<uuid:company_id>/organization/unit-types/", session_view(UnitTypeListView), name="organization-unit-types"),
    path("companies/<uuid:company_id>/organization/unit-types/<uuid:type_id>/", session_view(UnitTypeDetailView), name="organization-unit-type"),
    path("companies/<uuid:company_id>/organization/units/", session_view(UnitListView), name="organization-units"),
    path("companies/<uuid:company_id>/organization/units/<uuid:unit_id>/", session_view(UnitDetailView), name="organization-unit"),
    path("companies/<uuid:company_id>/organization/units/<uuid:unit_id>/members/", session_view(UnitMembersView), name="organization-unit-members"),
    path("companies/<uuid:company_id>/hrms/leave-requests/", session_view(LeaveRequestListView), name="hrms-leave"),
    path("companies/<uuid:company_id>/hrms/leave-balances/", session_view(LeaveBalanceListView), name="hrms-leave-balances"),
    path("companies/<uuid:company_id>/hrms/leave-requests/<uuid:request_id>/decision/", session_view(LeaveDecisionView), name="hrms-leave-decision"),
    path("companies/<uuid:company_id>/parties/", session_view(PartyListView), name="company-parties"),
    path("companies/<uuid:company_id>/parties/<uuid:party_id>/", session_view(PartyDetailView), name="company-party"),
    path("companies/<uuid:company_id>/projects/", session_view(ProjectListView), name="company-projects"),
    path("companies/<uuid:company_id>/projects/<uuid:project_id>/", session_view(ProjectDetailView), name="company-project"),
    path(
        "companies/<uuid:company_id>/projects/<uuid:project_id>/tasks/",
        session_view(ProjectTaskListView),
        name="company-project-tasks",
    ),
    path("companies/<uuid:company_id>/crm/leads/", session_view(LeadListView), name="crm-leads"),
    path("companies/<uuid:company_id>/crm/leads/<uuid:lead_id>/convert/", session_view(LeadConvertView), name="crm-lead-convert"),
    path("companies/<uuid:company_id>/crm/accounts/", session_view(AccountListView), name="crm-accounts"),
    path("companies/<uuid:company_id>/commerce/products/", session_view(ProductListView), name="commerce-products"),
    path("companies/<uuid:company_id>/commerce/orders/", session_view(OrderListView), name="commerce-orders"),
]
