from datetime import datetime, time, timezone as datetime_timezone

from django.db.models import Count, Q
from django.utils import timezone
from django.utils.dateparse import parse_date

from apps.audit.models import AuditLog
from apps.authorization.models import PlatformPermissionGrant
from apps.identity.models import User
from apps.tenants.models import Company, CompanyMembership, CompanyStatus, MembershipStatus
from common.api.errors import validation_error
from common.api.pagination import paginate, page_errors

SORTS = {
    "created_at": ("created_at", "id"),
    "-created_at": ("-created_at", "id"),
    "display_name": ("display_name", "id"),
    "-display_name": ("-display_name", "id"),
    "slug": ("slug", "id"),
    "-slug": ("-slug", "id"),
}


def list_companies(*, query_params) -> dict:
    details = []
    queryset = Company.objects.annotate(
        membership_count=Count(
            "memberships",
            filter=Q(memberships__status=MembershipStatus.ACTIVE),
        )
    )

    search = (query_params.get("q") or "").strip()
    if len(search) > 100:
        details.append({"field": "q", "code": "max_length", "message": "Enter at most 100 characters."})
    elif search:
        queryset = queryset.filter(
            Q(display_name__icontains=search) | Q(legal_name__icontains=search) | Q(slug__icontains=search)
        )

    status = (query_params.get("status") or "").strip()
    if status:
        allowed = {choice.value for choice in CompanyStatus}
        if status not in allowed:
            details.append(
                {
                    "field": "status",
                    "code": "invalid",
                    "message": "Choose a valid company status.",
                }
            )
        else:
            queryset = queryset.filter(status=status)

    created_from = _parse_bound(query_params.get("created_from"), field="created_from", details=details, end=False)
    created_to = _parse_bound(query_params.get("created_to"), field="created_to", details=details, end=True)
    if created_from and created_to and created_from > created_to:
        details.append(
            {"field": "created_to", "code": "invalid", "message": "The end date must be on or after the start date."}
        )
    if created_from:
        queryset = queryset.filter(created_at__gte=created_from)
    if created_to:
        queryset = queryset.filter(created_at__lte=created_to)

    sort = query_params.get("sort") or "-created_at"
    if sort not in SORTS:
        details.append({"field": "sort", "code": "invalid", "message": "Choose a valid sort field."})
    details.extend(page_errors(query_params.get("page"), query_params.get("page_size")))

    if details:
        raise validation_error(details)

    queryset = queryset.order_by(*SORTS[sort])
    page = paginate(queryset, page_raw=query_params.get("page"), page_size_raw=query_params.get("page_size"))
    page["results"] = [_serialize(company) for company in page["results"]]
    return page


def _parse_bound(raw, *, field: str, details: list, end: bool):
    if raw is None or str(raw).strip() == "":
        return None
    parsed = parse_date(str(raw).strip())
    if parsed is None:
        details.append({"field": field, "code": "invalid", "message": "Enter a date in YYYY-MM-DD format."})
        return None
    clock = time.max if end else time.min
    value = datetime.combine(parsed, clock)
    if timezone.is_naive(value):
        value = timezone.make_aware(value, timezone.get_current_timezone())
    return value


USER_SORTS = {
    "created_at": ("created_at", "id"),
    "-created_at": ("-created_at", "id"),
    "email": ("email", "id"),
    "-email": ("-email", "id"),
}


def platform_overview() -> dict:
    by_status = {choice.value: 0 for choice in CompanyStatus}
    for row in Company.objects.values("status").annotate(total=Count("id")):
        by_status[row["status"]] = row["total"]
    return {
        "companies": {"total": sum(by_status.values()), "by_status": by_status},
        "users": {
            "total": User.objects.count(),
            "active": User.objects.filter(is_active=True).count(),
            "mfa_enabled": User.objects.exclude(mfa_enabled_at=None).count(),
        },
        "active_memberships": CompanyMembership.objects.filter(status=MembershipStatus.ACTIVE).count(),
        "platform_grants": PlatformPermissionGrant.objects.count(),
    }


def list_users(*, query_params) -> dict:
    details = []
    queryset = User.objects.annotate(
        membership_count=Count("memberships", filter=Q(memberships__status=MembershipStatus.ACTIVE)),
        platform_grant_count=Count("platform_grants"),
    )
    search = (query_params.get("q") or "").strip()
    if len(search) > 100:
        details.append({"field": "q", "code": "max_length", "message": "Enter at most 100 characters."})
    elif search:
        queryset = queryset.filter(
            Q(email__icontains=search) | Q(first_name__icontains=search) | Q(last_name__icontains=search)
        )

    account_status = (query_params.get("account_status") or "").strip()
    if account_status == "active":
        queryset = queryset.filter(is_active=True)
    elif account_status == "inactive":
        queryset = queryset.filter(is_active=False)
    elif account_status:
        details.append({"field": "account_status", "code": "invalid", "message": "Choose active or inactive."})

    mfa = (query_params.get("mfa") or "").strip()
    if mfa == "enabled":
        queryset = queryset.exclude(mfa_enabled_at=None)
    elif mfa == "disabled":
        queryset = queryset.filter(mfa_enabled_at=None)
    elif mfa:
        details.append({"field": "mfa", "code": "invalid", "message": "Choose enabled or disabled."})

    sort = query_params.get("sort") or "-created_at"
    if sort not in USER_SORTS:
        details.append({"field": "sort", "code": "invalid", "message": "Choose a valid sort field."})
    details.extend(page_errors(query_params.get("page"), query_params.get("page_size")))
    if details:
        raise validation_error(details)

    page = paginate(queryset.order_by(*USER_SORTS[sort]), page_raw=query_params.get("page"), page_size_raw=query_params.get("page_size"))
    page["results"] = [_serialize_user(user) for user in page["results"]]
    return page


def list_audit_logs(*, query_params) -> dict:
    details = page_errors(query_params.get("page"), query_params.get("page_size"))
    if details:
        raise validation_error(details)
    queryset = AuditLog.objects.order_by("-created_at", "id")
    page = paginate(queryset, page_raw=query_params.get("page"), page_size_raw=query_params.get("page_size"))
    page["results"] = [
        {
            "id": str(row.id),
            "company_id": str(row.company_id) if row.company_id else None,
            "actor_user_id": str(row.actor_id) if row.actor_id else None,
            "action": row.action,
            "object_type": row.object_type,
            "object_id": str(row.object_id) if row.object_id else None,
            "request_id": str(row.request_id) if row.request_id else None,
            "created_at": row.created_at.astimezone(datetime_timezone.utc).isoformat().replace("+00:00", "Z"),
        }
        for row in page["results"]
    ]
    return page


def empty_record_page(*, query_params) -> dict:
    details = page_errors(query_params.get("page"), query_params.get("page_size"))
    if details:
        raise validation_error(details)
    page = paginate(Company.objects.none(), page_raw=query_params.get("page"), page_size_raw=query_params.get("page_size"))
    page["results"] = []
    return page


def _serialize_user(user: User) -> dict:
    return {
        "id": str(user.id),
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "is_active": user.is_active,
        "email_verified": user.email_verified_at is not None,
        "mfa_enabled": user.mfa_enabled_at is not None,
        "created_at": user.created_at.astimezone(datetime_timezone.utc).isoformat().replace("+00:00", "Z"),
        "membership_count": user.membership_count,
        "platform_grant_count": user.platform_grant_count,
    }


def _serialize(company: Company) -> dict:
    return {
        "id": str(company.id),
        "display_name": company.display_name,
        "slug": company.slug,
        "status": company.status,
        "created_at": company.created_at.astimezone(datetime_timezone.utc).isoformat().replace("+00:00", "Z"),
        "membership_count": company.membership_count,
    }
