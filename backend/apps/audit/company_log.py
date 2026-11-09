from datetime import timedelta

from django.utils import timezone

from apps.audit.models import AuditLog, AuditScope, PLATFORM_ACTIONS

ACTION_LABELS = {
    "company.created": "Workspace created",
    "company.updated": "Workspace updated",
    "company.profile_completed": "Company profile completed",
    "company.billing_profile_completed": "Billing profile completed",
    "person.created": "Person added",
    "person.deactivated": "Person deactivated",
    "person.activated": "Person activated",
    "membership.invited": "Invitation sent",
    "membership.invitation_revoked": "Invitation revoked",
    "membership.invitation_accepted": "Invitation accepted",
    "membership.status_changed": "Membership updated",
    "membership.roles_changed": "Roles updated",
    "organization_unit.created": "Organization unit added",
    "organization_unit.updated": "Organization unit updated",
    "organization_unit.deactivated": "Organization unit deactivated",
    "organization_unit.deleted": "Organization unit deleted",
    "organization_unit.members_changed": "Unit members updated",
    "organization_unit_type.saved": "Unit type saved",
    "module.installed": "Module installed",
    "subscription.plan_selected": "Plan selected",
    "role.created": "Role created",
    "role.permissions_changed": "Role permissions updated",
    "role.members_changed": "Role members updated",
    "role.duplicated": "Role duplicated",
    "dashboard.published": "Dashboard published",
    "custom_field.created": "Field added",
    "custom_field.updated": "Field updated",
    "custom_field.deleted": "Field deleted",
    "custom_field.archived": "Field archived",
    "role.archived": "Role archived",
    "announcement.published": "Announcement published",
    "hrms.leave.decided": "Leave decided",
}

TYPE_LABELS = {
    "company": "Company",
    "company_role": "Role",
    "person": "Person",
    "membership": "Membership",
    "membership_invitation": "Invitation",
    "organization_unit": "Organization unit",
    "organization_unit_type": "Unit type",
    "custom_field": "Field",
    "announcement": "Announcement",
    "module_installation": "Module",
    "company_module_installation": "Module",
    "company_billing_profile": "Billing profile",
    "subscription": "Subscription",
    "dashboard": "Dashboard",
    "leave_request": "Leave",
}

_WINDOWS = {7, 30, 90, 365}
_LIMIT = 500


def action_label(action: str) -> str:
    if action in ACTION_LABELS:
        return ACTION_LABELS[action]
    text = action.replace(".", " ").replace("_", " ")
    return text[:1].upper() + text[1:] if text else "Recorded action"


def _actor_name(user) -> str:
    if user is None:
        return "System"
    name = f"{user.first_name} {user.last_name}".strip()
    return name or user.email


def _token(key: str, value: str) -> str:
    text = value.strip()
    if key == "slug" and text.isalpha() and len(text) <= 8:
        return text.upper()
    if key == "plan_code" and text.isalpha():
        return text[:1].upper() + text[1:]
    return text


def _detail(payload) -> str:
    if not isinstance(payload, dict):
        return ""
    for key in ("name", "display_name", "title", "email", "singular_label", "billing_name", "plan_code", "slug"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return _token(key, value)
    return ""


def _names_for(rows):
    from apps.authorization.models import CompanyRole
    from apps.organization.models import Department, Person

    role_ids = [row.object_id for row in rows if row.object_type == "company_role" and row.object_id]
    person_ids = [row.object_id for row in rows if row.object_type == "person" and row.object_id]
    unit_ids = [row.object_id for row in rows if row.object_type == "organization_unit" and row.object_id]
    names = {}
    if role_ids:
        names.update({("company_role", item_id): name for item_id, name in CompanyRole.objects.filter(pk__in=role_ids).values_list("id", "name")})
    if person_ids:
        for person in Person.objects.filter(pk__in=person_ids):
            label = f"{person.first_name} {person.last_name}".strip() or person.work_email
            if label:
                names[("person", person.id)] = label
    if unit_ids:
        names.update({("organization_unit", item_id): name for item_id, name in Department.objects.filter(pk__in=unit_ids).values_list("id", "name")})
    return names


def _target(row, names) -> str:
    if row.action == "company.created":
        return "Company workspace"
    detail = names.get((row.object_type, row.object_id)) or _detail(row.after) or _detail(row.before)
    label = TYPE_LABELS.get(row.object_type)
    if label is None:
        text = (row.object_type or "record").replace("_", " ")
        label = text[:1].upper() + text[1:]
    if row.object_type == "company" and not detail:
        return "Company workspace"
    return f"{label} · {detail}" if detail else label


def _row(row, names, company_member_ids: set) -> dict:
    is_company_member = bool(row.actor_id and row.actor_id in company_member_ids)
    if is_company_member:
        actor_id = str(row.actor_id)
        actor_name = _actor_name(row.actor)
        mechanism = "Web app"
    else:
        actor_id = "system"
        actor_name = "System"
        mechanism = "System"
    return {
        "id": str(row.id),
        "created_at": row.created_at.isoformat(),
        "actor_id": actor_id,
        "actor_name": actor_name,
        "action": row.action,
        "action_label": action_label(row.action),
        "mechanism": mechanism,
        "target": _target(row, names),
        "result": "success",
    }


def company_audit(company_id, params) -> dict:
    from apps.tenants.models import CompanyMembership

    days = (params.get("days") or "90").strip()
    queryset = (
        AuditLog.objects.filter(company_id=company_id, scope=AuditScope.COMPANY)
        .exclude(action__startswith="platform.")
        .exclude(action__in=PLATFORM_ACTIONS)
        .select_related("actor")
    )
    if days != "all":
        try:
            window = int(days)
        except ValueError:
            window = 90
        if window not in _WINDOWS:
            window = 90
        queryset = queryset.filter(created_at__gte=timezone.now() - timedelta(days=window))
    rows = list(queryset.order_by("-created_at")[:_LIMIT])
    company_member_ids = set(
        CompanyMembership.objects.filter(company_id=company_id).values_list("user_id", flat=True)
    )
    names = _names_for(rows)
    presented = [_row(row, names, company_member_ids) for row in rows]
    actors = []
    seen = set()
    for item in presented:
        if item["actor_id"] in seen:
            continue
        seen.add(item["actor_id"])
        actors.append({"id": item["actor_id"], "name": item["actor_name"]})
    actors.sort(key=lambda item: (item["id"] == "system", item["name"].lower()))

    actor = (params.get("actor") or "").strip()
    mechanism = (params.get("mechanism") or "").strip().lower()
    query = (params.get("q") or "").strip().lower()
    if actor:
        presented = [item for item in presented if item["actor_id"] == actor]
    if mechanism == "web":
        presented = [item for item in presented if item["mechanism"] == "Web app"]
    elif mechanism == "system":
        presented = [item for item in presented if item["mechanism"] == "System"]
    if query:
        presented = [item for item in presented if query in item["action_label"].lower() or query in item["action"].lower() or query in item["target"].lower() or query in item["actor_name"].lower()]
    return {"count": len(presented), "results": presented, "actors": actors}
