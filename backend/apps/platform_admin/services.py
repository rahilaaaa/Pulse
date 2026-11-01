from datetime import datetime, time, timezone as datetime_timezone

from django.core.exceptions import ObjectDoesNotExist
from django.db.models import Count, Q
from django.utils import timezone
from django.utils.dateparse import parse_date

from django.db import transaction
from django.utils.crypto import get_random_string

from apps.audit.models import AuditLog
from apps.authorization.models import CompanyRole, MembershipRoleAssignment, PlatformPermissionGrant
from apps.authorization.services import (
    MANAGE_CODE,
    count_active_managers,
    list_platform_permission_catalog,
    normalize_permission_codes,
    platform_permission_codes,
    sync_platform_grants,
)
from apps.billing.services import subscription_summary
from apps.identity.models import User
from apps.identity.password_reset import _issue_reset
from apps.identity.serializers import normalize_email
from apps.modules_registry.models import CompanyModuleInstallation, InstallationStatus
from apps.organization.models import Department, Person, PersonStatus, UnitStatus
from apps.tenants.models import (
    Company,
    CompanyMembership,
    CompanyStatus,
    InvitationStatus,
    MembershipInvitation,
    MembershipStatus,
)
from common.api.errors import conflict, not_found, validation_error
from common.api.pagination import paginate, page_errors


def _iso(value):
    if value is None:
        return None
    return value.astimezone(datetime_timezone.utc).isoformat().replace("+00:00", "Z")

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
    active_memberships = CompanyMembership.objects.filter(status=MembershipStatus.ACTIVE)
    return {
        "companies": {"total": sum(by_status.values()), "by_status": by_status},
        "users": {
            "total": User.objects.count(),
            "active": User.objects.filter(is_active=True).count(),
            "email_verified": User.objects.exclude(email_verified_at=None).count(),
            "in_companies": active_memberships.values("user_id").distinct().count(),
        },
        "active_memberships": active_memberships.count(),
        "platform_grants": PlatformPermissionGrant.objects.values("user_id").distinct().count(),
    }


def get_company(*, company_id) -> dict:
    company = (
        Company.objects.annotate(
            membership_count=Count(
                "memberships",
                filter=Q(memberships__status=MembershipStatus.ACTIVE),
            )
        )
        .filter(pk=company_id)
        .first()
    )
    if company is None:
        raise not_found("That company was not found.")

    memberships = (
        CompanyMembership.objects.select_related("user")
        .filter(company=company)
        .exclude(status=MembershipStatus.REMOVED)
        .order_by("created_at", "id")
    )
    members = []
    for membership in memberships:
        role_names = list(
            MembershipRoleAssignment.objects.filter(membership=membership)
            .order_by("role__name")
            .values_list("role__name", flat=True)
        )
        user = membership.user
        members.append(
            {
                "membership_id": str(membership.id),
                "user_id": str(user.id),
                "email": user.email,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "is_active": user.is_active,
                "email_verified": user.email_verified_at is not None,
                "membership_status": membership.status,
                "roles": role_names,
                "joined_at": _iso(membership.joined_at),
                "created_at": _iso(membership.created_at),
            }
        )
    return {**_serialize(company), "legal_name": company.legal_name, "timezone": company.timezone, "members": members}


def get_company_dashboard(*, company_id) -> dict:
    company = Company.objects.filter(pk=company_id).first()
    if company is None:
        raise not_found("That company was not found.")

    memberships = CompanyMembership.objects.filter(company=company)
    people = Person.objects.filter(company=company)
    installations = CompanyModuleInstallation.objects.filter(company=company).select_related("module").order_by("module__display_name")
    try:
        billing_profile = company.billing_profile
    except ObjectDoesNotExist:
        billing_profile = None

    modules = [
        {
            "slug": row.module_id,
            "name": row.module.display_name,
            "status": row.status,
            "version": row.installed_version or row.module.version,
            "installed_at": _iso(row.installed_at),
        }
        for row in installations
    ]
    installed_count = sum(1 for row in modules if row["status"] == InstallationStatus.INSTALLED)

    return {
        "company": {
            "id": str(company.id),
            "display_name": company.display_name,
            "legal_name": company.legal_name,
            "slug": company.slug,
            "status": company.status,
            "timezone": company.timezone,
            "country_code": company.country_code,
            "created_at": _iso(company.created_at),
            "suspended_at": _iso(company.suspended_at),
            "closed_at": _iso(company.closed_at),
        },
        "people": {
            "people_total": people.count(),
            "people_active": people.filter(status=PersonStatus.ACTIVE).count(),
            "memberships_active": memberships.filter(status=MembershipStatus.ACTIVE).count(),
            "memberships_suspended": memberships.filter(status=MembershipStatus.SUSPENDED).count(),
            "memberships_invited": memberships.filter(status=MembershipStatus.INVITED).count(),
            "pending_invitations": MembershipInvitation.objects.filter(
                company=company, status=InvitationStatus.PENDING
            ).count(),
        },
        "organization": {
            "units_count": Department.objects.filter(company=company).exclude(status=UnitStatus.INACTIVE).count(),
            "roles_count": CompanyRole.objects.filter(company=company, is_active=True).count(),
        },
        "modules": modules,
        "installed_modules_count": installed_count,
        "billing": None
        if billing_profile is None
        else {
            "billing_name": billing_profile.billing_name,
            "billing_email": billing_profile.billing_email,
            "gstin": billing_profile.gstin or "",
            "country_code": billing_profile.country_code,
        },
        "subscription": subscription_summary(company),
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

    email_verified = (query_params.get("email_verified") or "").strip()
    if email_verified == "yes":
        queryset = queryset.exclude(email_verified_at=None)
    elif email_verified == "no":
        queryset = queryset.filter(email_verified_at=None)
    elif email_verified:
        details.append({"field": "email_verified", "code": "invalid", "message": "Choose yes or no."})

    has_platform_grants = (query_params.get("has_platform_grants") or "").strip()
    if has_platform_grants == "yes":
        queryset = queryset.filter(platform_grant_count__gt=0)
    elif has_platform_grants == "no":
        queryset = queryset.filter(platform_grant_count=0)
    elif has_platform_grants:
        details.append({"field": "has_platform_grants", "code": "invalid", "message": "Choose yes or no."})

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
    # Platform console only: exclude company/workspace audit rows.
    queryset = AuditLog.objects.filter(company__isnull=True).order_by("-created_at", "id")
    page = paginate(queryset, page_raw=query_params.get("page"), page_size_raw=query_params.get("page_size"))
    page["results"] = [
        {
            "id": str(row.id),
            "company_id": None,
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


def _serialize_user(user: User, *, include_permissions: bool = False) -> dict:
    membership_count = getattr(user, "membership_count", None)
    if membership_count is None:
        membership_count = CompanyMembership.objects.filter(
            user=user, status=MembershipStatus.ACTIVE
        ).count()
    platform_grant_count = getattr(user, "platform_grant_count", None)
    if platform_grant_count is None:
        platform_grant_count = PlatformPermissionGrant.objects.filter(user=user).count()
    payload = {
        "id": str(user.id),
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "is_active": user.is_active,
        "email_verified": user.email_verified_at is not None,
        "created_at": user.created_at.astimezone(datetime_timezone.utc).isoformat().replace("+00:00", "Z"),
        "membership_count": membership_count,
        "platform_grant_count": platform_grant_count,
    }
    if include_permissions:
        payload["permission_codes"] = platform_permission_codes(user)
    return payload


def get_user(*, user_id) -> dict:
    user = (
        User.objects.annotate(
            membership_count=Count("memberships", filter=Q(memberships__status=MembershipStatus.ACTIVE)),
            platform_grant_count=Count("platform_grants"),
        )
        .filter(pk=user_id)
        .first()
    )
    if user is None:
        raise not_found("That user was not found.")
    payload = _serialize_user(user, include_permissions=True)
    memberships = (
        CompanyMembership.objects.filter(user=user)
        .exclude(status=MembershipStatus.REMOVED)
        .select_related("company")
        .order_by("company__display_name")
    )
    payload["memberships"] = [
        {
            "company_id": str(row.company_id),
            "company_display_name": row.company.display_name,
            "company_slug": row.company.slug,
            "status": row.status,
        }
        for row in memberships
    ]
    return payload


def create_platform_user(*, actor: User, payload: dict, request) -> dict:
    if not isinstance(payload, dict):
        raise validation_error([{"field": "", "code": "invalid", "message": "Send a JSON object."}])
    email_raw = payload.get("email")
    if not isinstance(email_raw, str) or "@" not in email_raw:
        raise validation_error([{"field": "email", "code": "invalid", "message": "Enter an email address."}])
    email = normalize_email(email_raw)
    first_name = payload.get("first_name", "")
    last_name = payload.get("last_name", "")
    if first_name is None:
        first_name = ""
    if last_name is None:
        last_name = ""
    if not isinstance(first_name, str) or not isinstance(last_name, str):
        raise validation_error([{"field": "first_name", "code": "invalid", "message": "Enter a name."}])
    first_name = first_name.strip()[:150]
    last_name = last_name.strip()[:150]
    codes = normalize_permission_codes(payload.get("permission_codes"))
    if not codes:
        raise validation_error(
            [{"field": "permission_codes", "code": "required", "message": "Choose at least one platform permission."}]
        )
    send_invite = payload.get("send_invite", True)
    if not isinstance(send_invite, bool):
        raise validation_error([{"field": "send_invite", "code": "invalid", "message": "Choose on or off."}])

    with transaction.atomic():
        user = User.objects.filter(email=email).first()
        created = False
        if user is None:
            # Unusable random password until they complete the invite email.
            user = User.objects.create_user(
                email=email,
                password=get_random_string(40),
                first_name=first_name,
                last_name=last_name,
            )
            user.set_unusable_password()
            user.save(update_fields=["password", "updated_at"])
            created = True
        else:
            if not user.is_active:
                raise conflict(
                    "That account is deactivated. Reactivate it before granting platform access.",
                    [{"field": "email", "code": "inactive", "message": "That account is deactivated."}],
                )
            if first_name:
                user.first_name = first_name
            if last_name:
                user.last_name = last_name
            user.save(update_fields=["first_name", "last_name", "updated_at"])

        before, after = sync_platform_grants(user=user, codes=codes, granted_by=actor)
        AuditLog.objects.create(
            company=None,
            actor=actor,
            action="platform.user.created" if created else "platform.user.updated",
            object_type="user",
            object_id=user.id,
            after={
                "email": user.email,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "permission_codes": after,
                "created": created,
            },
            ip_address=_request_ip(request),
            request_id=_request_id(request),
        )
        if before != after:
            AuditLog.objects.create(
                company=None,
                actor=actor,
                action="platform.grant.changed",
                object_type="user",
                object_id=user.id,
                before={"permission_codes": before},
                after={"permission_codes": after},
                ip_address=_request_ip(request),
                request_id=_request_id(request),
            )

    invite_sent = False
    if send_invite:
        _issue_reset(
            user,
            subject="Set up your Pulse platform operator account",
            message=(
                "You were invited as a Pulse platform operator.\n\n"
                "Use this link to choose a password and sign in. "
                "It expires in {hours} hour and can be used once.\n\n{link}\n\n"
                "If you did not expect this invitation, you can ignore the message."
            ),
        )
        invite_sent = True

    result = get_user(user_id=user.id)
    result["created"] = created
    result["invite_sent"] = invite_sent
    return result


def update_platform_user(*, actor: User, user_id, payload: dict, request) -> dict:
    if not isinstance(payload, dict):
        raise validation_error([{"field": "", "code": "invalid", "message": "Send a JSON object."}])
    user = User.objects.filter(pk=user_id).first()
    if user is None:
        raise not_found("That user was not found.")

    before_profile = {
        "first_name": user.first_name,
        "last_name": user.last_name,
        "is_active": user.is_active,
    }
    updates = []

    if "first_name" in payload:
        first_name = payload.get("first_name")
        if first_name is None:
            first_name = ""
        if not isinstance(first_name, str):
            raise validation_error([{"field": "first_name", "code": "invalid", "message": "Enter a first name."}])
        user.first_name = first_name.strip()[:150]
        updates.append("first_name")
    if "last_name" in payload:
        last_name = payload.get("last_name")
        if last_name is None:
            last_name = ""
        if not isinstance(last_name, str):
            raise validation_error([{"field": "last_name", "code": "invalid", "message": "Enter a last name."}])
        user.last_name = last_name.strip()[:150]
        updates.append("last_name")
    if "is_active" in payload:
        is_active = payload.get("is_active")
        if not isinstance(is_active, bool):
            raise validation_error([{"field": "is_active", "code": "invalid", "message": "Choose on or off."}])
        if actor.id == user.id and is_active is False:
            raise conflict(
                "You cannot deactivate your own account.",
                [{"field": "is_active", "code": "self", "message": "You cannot deactivate your own account."}],
            )
        if (
            user.is_active
            and is_active is False
            and MANAGE_CODE in platform_permission_codes(user)
            and count_active_managers(exclude_user_id=user.id) == 0
        ):
            raise conflict(
                "At least one active platform operator must keep platform.users.manage.",
                [
                    {
                        "field": "is_active",
                        "code": "last_manager",
                        "message": "At least one active platform operator must keep platform.users.manage.",
                    }
                ],
            )
        user.is_active = is_active
        updates.append("is_active")

    grant_before = grant_after = None
    with transaction.atomic():
        if updates:
            updates.append("updated_at")
            user.save(update_fields=updates)
        if "permission_codes" in payload:
            codes = normalize_permission_codes(payload.get("permission_codes"))
            grant_before, grant_after = sync_platform_grants(user=user, codes=codes, granted_by=actor)

        after_profile = {
            "first_name": user.first_name,
            "last_name": user.last_name,
            "is_active": user.is_active,
        }
        if before_profile != after_profile:
            AuditLog.objects.create(
                company=None,
                actor=actor,
                action="platform.user.updated",
                object_type="user",
                object_id=user.id,
                before=before_profile,
                after=after_profile,
                ip_address=_request_ip(request),
                request_id=_request_id(request),
            )
        if grant_before is not None and grant_before != grant_after:
            AuditLog.objects.create(
                company=None,
                actor=actor,
                action="platform.grant.changed",
                object_type="user",
                object_id=user.id,
                before={"permission_codes": grant_before},
                after={"permission_codes": grant_after},
                ip_address=_request_ip(request),
                request_id=_request_id(request),
            )

    return get_user(user_id=user.id)


def list_platform_permissions() -> list[dict]:
    return list_platform_permission_catalog()


def send_platform_user_password_reset(*, actor: User, user_id, request) -> dict:
    user = User.objects.filter(pk=user_id).first()
    if user is None:
        raise not_found("That user was not found.")
    if not user.is_active:
        raise conflict(
            "That account is deactivated.",
            [{"field": "user", "code": "inactive", "message": "That account is deactivated."}],
        )
    _issue_reset(user)
    AuditLog.objects.create(
        company=None,
        actor=actor,
        action="platform.user.password_reset_sent",
        object_type="user",
        object_id=user.id,
        after={"email": user.email},
        ip_address=_request_ip(request),
        request_id=_request_id(request),
    )
    return {"sent": True}


def _request_ip(request):
    if request is None:
        return None
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip()[:64]
    return (request.META.get("REMOTE_ADDR") or "")[:64] or None


def _request_id(request):
    if request is None:
        return None
    raw = request.META.get("HTTP_X_REQUEST_ID") or request.headers.get("X-Request-Id")
    if not raw:
        return None
    try:
        import uuid

        return uuid.UUID(str(raw))
    except (TypeError, ValueError, AttributeError):
        return None


def _serialize(company: Company) -> dict:
    return {
        "id": str(company.id),
        "display_name": company.display_name,
        "slug": company.slug,
        "status": company.status,
        "created_at": company.created_at.astimezone(datetime_timezone.utc).isoformat().replace("+00:00", "Z"),
        "membership_count": company.membership_count,
    }
