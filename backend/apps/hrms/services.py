"""HRMS leave domain services (Person-based Slice B)."""

from datetime import date

from django.db import transaction
from django.db.models import F

from apps.authorization.scopes import can_access_leave_request, filter_leave_queryset
from apps.hrms.models import LeaveBalance, LeavePolicy, LeaveRequest, LeaveRequestStatus
from common.api.errors import conflict, not_found, validation_error


def leave_days(starts_on: date, ends_on: date) -> int:
    return (ends_on - starts_on).days + 1


def ensure_balance(*, company, person, policy: LeavePolicy, year: int) -> LeaveBalance:
    balance, _created = LeaveBalance.objects.get_or_create(
        company=company,
        person=person,
        policy=policy,
        year=year,
        defaults={"allocated_days": policy.days_per_year, "used_days": 0},
    )
    return balance


def list_leave_requests(membership):
    return (
        filter_leave_queryset(LeaveRequest.objects.all(), membership)
        .select_related("person", "policy")
        .order_by("-created_at")
    )


def list_balances(membership):
    qs = LeaveBalance.objects.filter(company=membership.company).select_related("person", "policy")
    from apps.authorization.scopes import RecordScope, managed_person_ids, scope_for_membership, LEAVE_FAMILY

    scope = scope_for_membership(membership, LEAVE_FAMILY)
    if scope is RecordScope.COMPANY:
        return qs.order_by("person__last_name", "policy__name")
    if scope is RecordScope.MANAGE:
        return qs.filter(person_id__in=managed_person_ids(membership)).order_by("person__last_name", "policy__name")
    if membership.person_id is None:
        return qs.none()
    return qs.filter(person_id=membership.person_id).order_by("policy__name")


def create_leave_request(*, membership, starts_on, ends_on, reason: str) -> LeaveRequest:
    if membership.person_id is None:
        raise conflict("Link a person before requesting leave.")
    policy = LeavePolicy.objects.filter(company=membership.company).order_by("name").first()
    if policy is None:
        raise conflict("Leave is not configured.")
    if not starts_on or not ends_on:
        raise validation_error([{"field": "starts_on", "code": "required", "message": "Enter the leave dates."}])
    starts = date.fromisoformat(str(starts_on))
    ends = date.fromisoformat(str(ends_on))
    if ends < starts:
        raise validation_error([{"field": "ends_on", "code": "invalid", "message": "End date must be on or after the start date."}])
    days = leave_days(starts, ends)
    with transaction.atomic():
        balance = ensure_balance(company=membership.company, person=membership.person, policy=policy, year=starts.year)
        remaining = int(balance.allocated_days) - int(balance.used_days)
        if days > remaining:
            raise conflict(
                "Not enough leave balance.",
                [{"field": "starts_on", "code": "balance", "message": f"{remaining} day(s) remaining for {starts.year}."}],
            )
        return LeaveRequest.objects.create(
            company=membership.company,
            person=membership.person,
            policy=policy,
            starts_on=starts,
            ends_on=ends,
            reason=(reason or "")[:500],
        )


def decide_leave_request(*, membership, request_id, decision: str, actor) -> tuple[LeaveRequest, str]:
    row = LeaveRequest.objects.filter(company=membership.company, pk=request_id).select_related("policy", "person").first()
    if row is None or not can_access_leave_request(membership, row):
        raise not_found()
    if decision not in {LeaveRequestStatus.APPROVED, LeaveRequestStatus.REJECTED}:
        raise validation_error([{"field": "status", "code": "invalid", "message": "Choose approved or rejected."}])
    previous = row.status
    with transaction.atomic():
        row = LeaveRequest.objects.select_for_update().select_related("policy", "person").get(pk=row.pk)
        previous = row.status
        if previous == decision:
            return row, previous
        if previous == LeaveRequestStatus.APPROVED and decision == LeaveRequestStatus.REJECTED:
            days = leave_days(row.starts_on, row.ends_on)
            LeaveBalance.objects.filter(
                company=row.company,
                person=row.person,
                policy=row.policy,
                year=row.starts_on.year,
                used_days__gte=days,
            ).update(used_days=F("used_days") - days)
        if decision == LeaveRequestStatus.APPROVED and previous != LeaveRequestStatus.APPROVED:
            days = leave_days(row.starts_on, row.ends_on)
            balance = ensure_balance(company=row.company, person=row.person, policy=row.policy, year=row.starts_on.year)
            remaining = int(balance.allocated_days) - int(balance.used_days)
            if days > remaining:
                raise conflict("Not enough leave balance to approve.")
            LeaveBalance.objects.filter(pk=balance.pk).update(used_days=F("used_days") + days)
        row.status = decision
        row.decided_by = actor
        row.save(update_fields=["status", "decided_by", "updated_at"])
    return row, previous


def serialize_leave_request(row: LeaveRequest) -> dict:
    return {
        "id": str(row.id),
        "person": f"{row.person.first_name} {row.person.last_name}".strip(),
        "person_id": str(row.person_id),
        "policy": row.policy.name,
        "policy_id": str(row.policy_id),
        "status": row.status,
        "starts_on": row.starts_on.isoformat(),
        "ends_on": row.ends_on.isoformat(),
        "reason": row.reason,
        "days": leave_days(row.starts_on, row.ends_on),
    }


def serialize_balance(row: LeaveBalance) -> dict:
    return {
        "id": str(row.id),
        "person": f"{row.person.first_name} {row.person.last_name}".strip(),
        "person_id": str(row.person_id),
        "policy": row.policy.name,
        "policy_id": str(row.policy_id),
        "year": row.year,
        "allocated_days": row.allocated_days,
        "used_days": row.used_days,
        "remaining_days": max(0, int(row.allocated_days) - int(row.used_days)),
    }
