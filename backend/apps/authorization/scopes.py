"""Service-layer record scopes (ADR-021 / doc 17).

Action permission codes stay unchanged. After `require_permission`, callers use these
helpers to narrow querysets and object access (own / manage / company).

Leave acceptance criteria (Slice A contract for Slice B):
- Caller must hold `hrms.leave.view` (or decide/request) before scope applies.
- `own`: leave rows where `person_id == membership.person_id` (empty if no person).
- `manage`: own rows plus people whose `department.manager_id == membership.person_id`.
- `company`: all leave rows for the membership company.
- Role `record_scopes["hrms.leave"]` overrides template defaults when set.
- Owners/administrators default to `company`; department_manager to `manage`;
  employee/hr templates as below. Missing metadata falls back to template defaults,
  then to `own` for safety on unknown templates.
"""

from __future__ import annotations

from enum import Enum

from django.db.models import Q, QuerySet

from apps.authorization.models import MembershipRoleAssignment
from apps.organization.models import Department


class RecordScope(str, Enum):
    OWN = "own"
    MANAGE = "manage"
    COMPANY = "company"


# Permission-family key → default scope by role template_code.
DEFAULT_ROLE_SCOPES: dict[str, dict[str, str]] = {
    "owner": {"hrms.leave": RecordScope.COMPANY.value, "hrms.employment": RecordScope.COMPANY.value, "projects": RecordScope.COMPANY.value},
    "administrator": {"hrms.leave": RecordScope.COMPANY.value, "hrms.employment": RecordScope.COMPANY.value, "projects": RecordScope.COMPANY.value},
    "hr_manager": {"hrms.leave": RecordScope.COMPANY.value, "hrms.employment": RecordScope.COMPANY.value, "projects": RecordScope.COMPANY.value},
    "department_manager": {"hrms.leave": RecordScope.MANAGE.value, "hrms.employment": RecordScope.MANAGE.value, "projects": RecordScope.MANAGE.value},
    "employee": {"hrms.leave": RecordScope.OWN.value, "hrms.employment": RecordScope.OWN.value, "projects": RecordScope.OWN.value},
}

LEAVE_FAMILY = "hrms.leave"
EMPLOYMENT_FAMILY = "hrms.employment"


def _normalize_scope(value: str | None) -> RecordScope:
    if value in {RecordScope.OWN.value, RecordScope.MANAGE.value, RecordScope.COMPANY.value}:
        return RecordScope(value)
    return RecordScope.OWN


def scope_for_membership(membership, family: str) -> RecordScope:
    """Resolve the widest scope across the membership's active roles for a family."""
    if MembershipRoleAssignment.objects.filter(membership=membership, role__is_owner_role=True).exists():
        return RecordScope.COMPANY

    widest = RecordScope.OWN
    rank = {RecordScope.OWN: 0, RecordScope.MANAGE: 1, RecordScope.COMPANY: 2}
    assignments = MembershipRoleAssignment.objects.filter(membership=membership).select_related("role")
    found = False
    for assignment in assignments:
        role = assignment.role
        metadata = role.record_scopes if isinstance(role.record_scopes, dict) else {}
        raw = metadata.get(family)
        if raw is None:
            defaults = DEFAULT_ROLE_SCOPES.get(role.template_code or "", {})
            raw = defaults.get(family)
        if raw is None:
            continue
        found = True
        candidate = _normalize_scope(raw)
        if rank[candidate] > rank[widest]:
            widest = candidate
    if not found:
        return RecordScope.OWN
    return widest


def managed_person_ids(membership) -> set:
    """Person ids in units managed by the membership's person (plus self)."""
    ids: set = set()
    if membership.person_id:
        ids.add(membership.person_id)
        managed = Department.objects.filter(
            company_id=membership.company_id,
            manager_id=membership.person_id,
        ).values_list("id", flat=True)
        from apps.organization.models import Person

        ids.update(
            Person.objects.filter(company_id=membership.company_id, department_id__in=managed).values_list("id", flat=True)
        )
    return ids


def leave_view_q(membership) -> Q:
    scope = scope_for_membership(membership, LEAVE_FAMILY)
    if scope is RecordScope.COMPANY:
        return Q(company_id=membership.company_id)
    if scope is RecordScope.MANAGE:
        return Q(company_id=membership.company_id, person_id__in=managed_person_ids(membership))
    if membership.person_id is None:
        return Q(pk__in=[])
    return Q(company_id=membership.company_id, person_id=membership.person_id)


def filter_leave_queryset(queryset: QuerySet, membership) -> QuerySet:
    return queryset.filter(leave_view_q(membership))


def can_access_leave_request(membership, leave_request) -> bool:
    if leave_request.company_id != membership.company_id:
        return False
    scope = scope_for_membership(membership, LEAVE_FAMILY)
    if scope is RecordScope.COMPANY:
        return True
    if scope is RecordScope.MANAGE:
        return leave_request.person_id in managed_person_ids(membership)
    return membership.person_id is not None and leave_request.person_id == membership.person_id


def default_record_scopes_for_template(template_code: str) -> dict:
    return dict(DEFAULT_ROLE_SCOPES.get(template_code or "", {}))
