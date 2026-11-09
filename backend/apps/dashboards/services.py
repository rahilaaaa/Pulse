from django.db import transaction

from apps.authorization.catalog import NAV_CATALOG
from apps.authorization.company import effective_permission_codes
from apps.authorization.models import CompanyRole, CompanyRoleNavigation
from apps.dashboards.models import (
    Dashboard,
    DashboardAssignment,
    DashboardVersion,
    DashboardWidget,
    VersionStatus,
    WidgetDefinition,
)
from apps.modules_registry.models import CompanyModuleInstallation, InstallationStatus
from common.api.errors import conflict, not_found


def installed_slugs(company) -> set[str]:
    return set(
        CompanyModuleInstallation.objects.filter(company=company, status=InstallationStatus.INSTALLED).values_list("module_id", flat=True)
    )


def navigation_for(membership) -> list[dict]:
    codes = effective_permission_codes(membership)
    installed = installed_slugs(membership.company)
    roles = list(CompanyRole.objects.filter(assignments__membership=membership))
    saved_rows = list(CompanyRoleNavigation.objects.filter(role__in=roles).order_by("position", "code"))
    allowed = []
    for code, label, permission, module_slug in NAV_CATALOG:
        if permission not in codes:
            continue
        if module_slug and module_slug not in installed:
            continue
        allowed.append({"code": code, "label": label, "permission": permission, "module_slug": module_slug or None})
    if not saved_rows:
        return allowed
    saved_codes = {item.code for item in saved_rows}
    order = []
    seen = set()
    for item in saved_rows:
        if not item.enabled or item.code in seen:
            continue
        match = next((entry for entry in allowed if entry["code"] == item.code), None)
        if match:
            order.append(match)
            seen.add(item.code)
    for entry in allowed:
        if entry["code"] in saved_codes or entry["code"] in seen:
            continue
        order.append(entry)
        seen.add(entry["code"])
    return order


def widget_catalog(company, role: CompanyRole) -> list[dict]:
    role_codes = set(role.permissions.values_list("permission_id", flat=True))
    installed = installed_slugs(company)
    results = []
    for widget in WidgetDefinition.objects.order_by("title"):
        if widget.module_slug and widget.module_slug not in installed:
            continue
        if widget.required_permission not in role_codes:
            continue
        results.append(
            {
                "code": widget.code,
                "title": widget.title,
                "description": widget.description,
                "module_slug": widget.module_slug or None,
                "required_permission": widget.required_permission,
            }
        )
    return results


def role_layout(role: CompanyRole) -> list[str]:
    assignment = DashboardAssignment.objects.filter(role=role, dashboard__published_version__isnull=False).select_related("dashboard__published_version").first()
    if assignment is None or assignment.dashboard.published_version_id is None:
        return []
    return list(
        DashboardWidget.objects.filter(version_id=assignment.dashboard.published_version_id).order_by("position").values_list("widget_id", flat=True)
    )


def publish_role_layout(*, company, role: CompanyRole, codes: list[str]) -> list[str]:
    allowed = {item["code"] for item in widget_catalog(company, role)}
    cleaned = []
    for code in codes:
        if not isinstance(code, str) or code not in allowed or code in cleaned:
            continue
        cleaned.append(code)
    if len(cleaned) != len([code for code in codes if isinstance(code, str)]):
        raise conflict("One or more widgets are not available for this role.")
    with transaction.atomic():
        dashboard = Dashboard.objects.filter(assignments__role=role).first()
        if dashboard is None:
            dashboard = Dashboard.objects.create(company=company, name=f"{role.name} dashboard")
            DashboardAssignment.objects.create(company=company, dashboard=dashboard, role=role)
        if dashboard.published_version_id:
            DashboardVersion.objects.filter(pk=dashboard.published_version_id).update(status=VersionStatus.SUPERSEDED)
        version = DashboardVersion.objects.create(dashboard=dashboard, status=VersionStatus.PUBLISHED)
        DashboardWidget.objects.bulk_create(
            [DashboardWidget(version=version, widget_id=code, position=index) for index, code in enumerate(cleaned)]
        )
        dashboard.published_version = version
        dashboard.save(update_fields=["published_version", "updated_at"])
    return cleaned


def dashboard_for_membership(membership) -> dict:
    codes = effective_permission_codes(membership)
    installed = installed_slugs(membership.company)
    roles = CompanyRole.objects.filter(assignments__membership=membership)
    assignment = (
        DashboardAssignment.objects.filter(role__in=roles, dashboard__published_version__isnull=False)
        .select_related("dashboard__published_version")
        .order_by("-created_at")
        .first()
    )
    if assignment is None:
        return {"widgets": []}
    widgets = []
    for item in DashboardWidget.objects.filter(version=assignment.dashboard.published_version).select_related("widget").order_by("position"):
        widget = item.widget
        if widget.required_permission not in codes:
            continue
        if widget.module_slug and widget.module_slug not in installed:
            continue
        widgets.append({"code": widget.code, "title": widget.title, "data": widget_data(membership, widget.code)})
    return {"widgets": widgets}


def widget_data(membership, code: str) -> dict:
    company = membership.company
    if code == "company.summary":
        return {"name": company.display_name, "legal_name": company.legal_name, "status": company.status, "slug": company.slug}
    if code == "membership.counts":
        from apps.tenants.models import CompanyMembership

        rows = CompanyMembership.objects.filter(company=company)
        return {
            "active": rows.filter(status="active").count(),
            "invited": rows.filter(status="invited").count(),
            "suspended": rows.filter(status="suspended").count(),
        }
    if code == "invitations.pending":
        from apps.tenants.models import MembershipInvitation

        return {"pending": MembershipInvitation.objects.filter(company=company, status="pending").count()}
    if code == "modules.installed":
        return {"slugs": sorted(installed_slugs(company))}
    if code == "billing.subscription":
        from apps.billing.services import subscription_summary

        return subscription_summary(company) or {}
    if code == "audit.recent":
        from apps.audit.models import AuditLog, AuditScope, PLATFORM_ACTIONS

        return {
            "results": [
                {"action": row.action, "created_at": row.created_at.isoformat()}
                for row in AuditLog.objects.filter(company=company, scope=AuditScope.COMPANY)
                .exclude(action__startswith="platform.")
                .exclude(action__in=PLATFORM_ACTIONS)
                .order_by("-created_at")[:5]
            ]
        }
    if code == "hrms.leave.pending":
        from apps.hrms.models import LeaveRequest

        return {"pending": LeaveRequest.objects.filter(company=company, status="pending").count()}
    return {}


def role_or_404(company, role_id) -> CompanyRole:
    role = CompanyRole.objects.filter(company=company, pk=role_id).first()
    if role is None:
        raise not_found("That role was not found.")
    return role
