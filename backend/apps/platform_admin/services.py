from datetime import datetime, time, timezone as datetime_timezone

from django.core.exceptions import ObjectDoesNotExist
from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone
from django.utils.crypto import get_random_string
from django.utils.dateparse import parse_date

from apps.audit.models import AuditLog, AuditScope
from apps.authorization.models import (
    CompanyRole,
    MembershipRoleAssignment,
    OperatorStatus,
    PlatformOperatorProfile,
    PlatformPermissionGrant,
    PlatformRole,
    PlatformSuperAdmin,
)
from apps.authorization.services import (
    MANAGE_CODE,
    count_active_managers,
    ensure_not_super_admin_target,
    ensure_super_admin_actor,
    get_operator_profile,
    is_super_admin,
    list_platform_permission_catalog,
    normalize_permission_codes,
    platform_permission_codes,
    sync_platform_grants,
)
from apps.billing.models import Subscription, SubscriptionStatus
from apps.billing.services import subscription_summary
from apps.identity.models import User
from apps.identity.password_reset import _issue_reset
from apps.identity.serializers import normalize_email
from apps.modules_registry.models import CompanyModuleInstallation, InstallationStatus, ModuleDefinition
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
from common.api.pagination import page_errors, paginate

# Re-exports from sub-services for cohesive API
from apps.platform_admin.billing_services import (  # noqa: F401
    billing_overview,
    change_company_subscription_plan,
    list_platform_plans,
    list_platform_subscriptions,
)
from apps.platform_admin.company_services import (  # noqa: F401
    activate_company,
    close_company,
    create_platform_company,
    get_company_detail as get_company,
    list_companies,
    list_company_audit_logs,
    reactivate_company,
    suspend_company,
    update_company_metadata,
)
from apps.platform_admin.module_services import (  # noqa: F401
    get_platform_module_detail,
    install_company_module,
    list_platform_modules,
    uninstall_company_module,
    update_platform_module_availability,
)
from apps.platform_admin.settings_services import (  # noqa: F401
    get_platform_settings,
    onboarding_monitoring,
    platform_health_overview,
    update_platform_settings,
)
from apps.platform_admin.operator_services import (  # noqa: F401
    accept_platform_invitation,
    create_platform_invitation,
    create_platform_role,
    deactivate_platform_operator,
    delete_platform_role,
    get_operator_activity_history,
    get_platform_operator_detail,
    get_platform_role_detail,
    list_platform_operators,
    list_platform_roles,
    reactivate_platform_operator,
    resend_platform_invitation,
    revoke_operator_sessions,
    revoke_platform_invitation,
    suspend_platform_operator,
    transfer_super_admin_ownership,
    update_platform_operator,
    update_platform_role,
    verify_platform_invitation,
)


def _iso(value):
    if value is None:
        return None
    return value.astimezone(datetime_timezone.utc).isoformat().replace("+00:00", "Z")


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


def _monthly_growth_trend():
    now = timezone.now()
    buckets = []
    for i in range(5, -1, -1):
        year = now.year
        month = now.month - i
        while month <= 0:
            month += 12
            year -= 1
        start_date = datetime(year, month, 1, tzinfo=datetime_timezone.utc)
        if month == 12:
            end_date = datetime(year + 1, 1, 1, tzinfo=datetime_timezone.utc)
        else:
            end_date = datetime(year, month + 1, 1, tzinfo=datetime_timezone.utc)
        count = Company.objects.filter(created_at__gte=start_date, created_at__lt=end_date).count()
        buckets.append({
            "key": start_date.strftime("%Y-%m"),
            "label": start_date.strftime("%b %Y"),
            "count": count,
        })
    return buckets


def platform_overview() -> dict:
    by_status = {choice.value: 0 for choice in CompanyStatus}
    for row in Company.objects.values("status").annotate(total=Count("id")):
        by_status[row["status"]] = row["total"]

    active_memberships = CompanyMembership.objects.filter(status=MembershipStatus.ACTIVE)
    total_memberships = CompanyMembership.objects.exclude(status=MembershipStatus.REMOVED).count()
    pending_invites = MembershipInvitation.objects.filter(status=InvitationStatus.PENDING).count()

    plan_counts = {}
    for row in Subscription.objects.exclude(status=SubscriptionStatus.CANCELED).values("plan__name").annotate(total=Count("id")):
        name = row["plan__name"] or "Unknown"
        plan_counts[name] = row["total"]

    module_adoption = [
        {
            "slug": mod.slug,
            "name": mod.display_name,
            "installed_count": CompanyModuleInstallation.objects.filter(module=mod, status=InstallationStatus.INSTALLED).count(),
        }
        for mod in ModuleDefinition.objects.all().order_by("display_name")
    ]

    recent_activities = []
    for row in AuditLog.objects.select_related("actor", "company").order_by("-created_at", "id")[:10]:
        recent_activities.append({
            "id": str(row.id),
            "action": row.action,
            "object_type": row.object_type,
            "actor_email": row.actor.email if row.actor else "System",
            "actor_name": f"{row.actor.first_name} {row.actor.last_name}".strip() if row.actor else "System",
            "company_id": str(row.company_id) if row.company_id else None,
            "company_name": row.company.display_name if row.company else None,
            "created_at": _iso(row.created_at),
        })

    billing_metrics = billing_overview()

    return {
        "companies": {
            "total": sum(by_status.values()),
            "by_status": by_status,
            "active": by_status.get(CompanyStatus.ACTIVE, 0),
            "draft": by_status.get(CompanyStatus.DRAFT, 0),
            "suspended": by_status.get(CompanyStatus.SUSPENDED, 0),
            "closed": by_status.get(CompanyStatus.CLOSED, 0),
        },
        "memberships": {
            "total": total_memberships,
            "active": active_memberships.count(),
            "pending_invitations": pending_invites,
        },
        "modules": {
            "total_catalog": ModuleDefinition.objects.count(),
            "total_installed": CompanyModuleInstallation.objects.filter(status=InstallationStatus.INSTALLED).count(),
            "adoption": module_adoption,
        },
        "billing": billing_metrics,
        "users": {
            "total": User.objects.count(),
            "active": User.objects.filter(is_active=True).count(),
            "email_verified": User.objects.exclude(email_verified_at=None).count(),
            "in_companies": active_memberships.values("user_id").distinct().count(),
        },
        "platform_grants": PlatformPermissionGrant.objects.values("user_id").distinct().count(),
        "trends": {
            "company_growth": _monthly_growth_trend(),
            "lifecycle_distribution": by_status,
            "plan_distribution": plan_counts,
        },
        "recent_activity": recent_activities,
    }


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
    from apps.authorization.models import OperatorStatus, PlatformRole
    from apps.authorization.services import is_super_admin
    details = []
    queryset = User.objects.annotate(
        membership_count=Count("memberships", filter=Q(memberships__status=MembershipStatus.ACTIVE)),
        platform_grant_count=Count("platform_grants"),
    ).select_related("platform_profile__role")

    search = (query_params.get("q") or "").strip()
    if len(search) > 100:
        details.append({"field": "q", "code": "max_length", "message": "Enter at most 100 characters."})
    elif search:
        queryset = queryset.filter(
            Q(email__icontains=search)
            | Q(first_name__icontains=search)
            | Q(last_name__icontains=search)
            | Q(platform_profile__role__name__icontains=search)
        )

    status_filter = (query_params.get("status") or query_params.get("account_status") or "").strip().lower()
    if status_filter == "active":
        queryset = queryset.filter(is_active=True).exclude(platform_profile__status__in=[OperatorStatus.SUSPENDED, OperatorStatus.DEACTIVATED])
    elif status_filter == "suspended":
        queryset = queryset.filter(platform_profile__status=OperatorStatus.SUSPENDED)
    elif status_filter in ("inactive", "deactivated"):
        queryset = queryset.filter(Q(is_active=False) | Q(platform_profile__status=OperatorStatus.DEACTIVATED))
    elif status_filter:
        details.append({"field": "status", "code": "invalid", "message": "Choose active, suspended, or inactive."})

    role_filter = (query_params.get("role") or "").strip()
    if role_filter:
        queryset = queryset.filter(
            Q(platform_profile__role__id=role_filter) | Q(platform_profile__role__slug=role_filter)
        )

    email_verified = (query_params.get("email_verified") or "").strip()
    if email_verified == "yes":
        queryset = queryset.exclude(email_verified_at=None)
    elif email_verified == "no":
        queryset = queryset.filter(email_verified_at=None)
    elif email_verified:
        details.append({"field": "email_verified", "code": "invalid", "message": "Choose yes or no."})

    has_platform_grants = (query_params.get("has_platform_grants") or "").strip()
    if has_platform_grants == "yes":
        queryset = queryset.filter(
            Q(platform_grant_count__gt=0) | Q(platform_profile__isnull=False) | Q(super_admin_record__isnull=False)
        )
    elif has_platform_grants == "no":
        queryset = queryset.filter(
            platform_grant_count=0,
            platform_profile__isnull=True,
            super_admin_record__isnull=True,
        )
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


def _serialize_user(user: User, *, include_permissions: bool = False) -> dict:
    from apps.authorization.services import get_operator_profile, is_super_admin
    membership_count = getattr(user, "membership_count", None)
    if membership_count is None:
        membership_count = CompanyMembership.objects.filter(
            user=user, status=MembershipStatus.ACTIVE
        ).count()
    platform_grant_count = getattr(user, "platform_grant_count", None)
    if platform_grant_count is None:
        platform_grant_count = PlatformPermissionGrant.objects.filter(user=user).count()

    sa = is_super_admin(user)
    profile = get_operator_profile(user)

    role_data = None
    if profile and profile.role:
        role_data = {
            "id": str(profile.role.id),
            "name": profile.role.name,
            "slug": profile.role.slug,
        }

    status = "active" if user.is_active else "inactive"
    status_reason = ""
    if sa:
        status = "active"
    elif profile is not None:
        status = profile.status
        status_reason = profile.status_reason

    payload = {
        "id": str(user.id),
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "is_active": user.is_active,
        "is_super_admin": sa,
        "role": role_data,
        "account_status": status,
        "status": status,
        "status_reason": status_reason,
        "mfa_status": "Disabled",
        "email_verified": user.email_verified_at is not None,
        "created_at": user.created_at.astimezone(datetime_timezone.utc).isoformat().replace("+00:00", "Z"),
        "last_login": _iso(user.last_login),
        "membership_count": membership_count,
        "platform_grant_count": platform_grant_count,
    }
    if include_permissions:
        payload["permission_codes"] = platform_permission_codes(user)
        payload["effective_permissions"] = payload["permission_codes"]
        if profile and profile.role:
            payload["role_permissions"] = sorted(profile.role.role_permissions.values_list("permission_id", flat=True))
        elif sa:
            payload["role_permissions"] = payload["permission_codes"]
        else:
            payload["role_permissions"] = []
        payload["custom_permissions"] = profile.custom_permissions if profile else []
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
    from apps.authorization.models import OperatorStatus, PlatformOperatorProfile, PlatformRole
    from apps.authorization.services import ensure_super_admin_actor, is_super_admin
    if not isinstance(payload, dict):
        raise validation_error([{"field": "", "code": "invalid", "message": "Send a JSON object."}])

    # If role_id is passed, require Super Admin
    role_id = payload.get("role_id")
    if role_id:
        ensure_super_admin_actor(actor, "invite platform operators with dynamic roles")
        role = PlatformRole.objects.filter(pk=role_id).first()
        if role is None:
            raise not_found("Selected platform role was not found.")
        codes = sorted(role.role_permissions.values_list("permission_id", flat=True))
    else:
        codes = normalize_permission_codes(payload.get("permission_codes"))
        role = None

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

    if not codes and not role:
        raise validation_error(
            [{"field": "role_id", "code": "required", "message": "Select a platform role or at least one platform permission."}]
        )
    send_invite = payload.get("send_invite", True)
    if not isinstance(send_invite, bool):
        raise validation_error([{"field": "send_invite", "code": "invalid", "message": "Choose on or off."}])

    with transaction.atomic():
        user = User.objects.filter(email=email).first()
        created = False
        if user is None:
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

        profile, _ = PlatformOperatorProfile.objects.get_or_create(
            user=user,
            defaults={"role": role, "status": OperatorStatus.ACTIVE},
        )
        if role:
            profile.role = role
            profile.status = OperatorStatus.ACTIVE
            profile.save()

        before, after = sync_platform_grants(user=user, codes=codes, granted_by=actor)
        AuditLog.objects.create(
            company=None,
            actor=actor,
            scope=AuditScope.PLATFORM,
            action="platform.user.created" if created else "platform.user.updated",
            object_type="user",
            object_id=user.id,
            after={
                "email": user.email,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "role_id": str(role.id) if role else None,
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
                scope=AuditScope.PLATFORM,
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
    from apps.authorization.models import PlatformOperatorProfile, PlatformRole
    from apps.authorization.services import (
        ensure_not_super_admin_target,
        ensure_super_admin_actor,
        get_operator_profile,
        is_super_admin,
    )
    if not isinstance(payload, dict):
        raise validation_error([{"field": "", "code": "invalid", "message": "Send a JSON object."}])
    user = User.objects.filter(pk=user_id).first()
    if user is None:
        raise not_found("That user was not found.")

    is_target_sa = is_super_admin(user)
    if is_target_sa and actor.id != user.id:
        AuditLog.objects.create(
            company=None,
            actor=actor,
            scope=AuditScope.PLATFORM,
            action="platform.security.super_admin_modification_blocked",
            object_type="user",
            object_id=user.id,
            after={"attempted_payload": payload},
            ip_address=_request_ip(request),
            request_id=_request_id(request),
        )
        ensure_not_super_admin_target(user, "modified by another operator")

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
        if is_target_sa and is_active is False:
            raise conflict(
                "The Super Admin account cannot be deactivated.",
                [{"field": "is_active", "code": "super_admin_protected", "message": "The Super Admin cannot be deactivated."}],
            )
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

    role_updated = False
    new_role = None
    if "role_id" in payload:
        if is_target_sa:
            raise conflict(
                "The Super Admin cannot be assigned a dynamic role.",
                [{"field": "role_id", "code": "super_admin_protected", "message": "Super Admin role cannot be changed through normal management."}],
            )
        ensure_super_admin_actor(actor, "change platform operator roles")
        role_id = payload.get("role_id")
        if role_id:
            new_role = PlatformRole.objects.filter(pk=role_id).first()
            if new_role is None:
                raise not_found("Selected role was not found.")
        role_updated = True

    grant_before = grant_after = None
    with transaction.atomic():
        if updates:
            updates.append("updated_at")
            user.save(update_fields=updates)

        if role_updated:
            profile = get_operator_profile(user)
            if profile is None:
                profile = PlatformOperatorProfile.objects.create(user=user)
            before_role_id = str(profile.role_id) if profile.role_id else None
            profile.role = new_role
            profile.session_version += 1
            profile.save(update_fields=["role", "session_version", "updated_at"])

            if new_role:
                codes = sorted(new_role.role_permissions.values_list("permission_id", flat=True))
                sync_platform_grants(user=user, codes=codes, granted_by=actor)

            AuditLog.objects.create(
                company=None,
                actor=actor,
                scope=AuditScope.PLATFORM,
                action="platform.operator.role_changed",
                object_type="user",
                object_id=user.id,
                before={"role_id": before_role_id},
                after={"role_id": str(new_role.id) if new_role else None, "role_name": new_role.name if new_role else None},
                ip_address=_request_ip(request),
                request_id=_request_id(request),
            )

        if "custom_permissions" in payload and not is_target_sa:
            ensure_super_admin_actor(actor, "edit custom permissions")
            custom_perms = normalize_permission_codes(payload.get("custom_permissions"))
            profile = get_operator_profile(user)
            if profile is None:
                profile = PlatformOperatorProfile.objects.create(user=user)
            profile.custom_permissions = custom_perms
            profile.session_version += 1
            profile.save(update_fields=["custom_permissions", "session_version", "updated_at"])

        if "permission_codes" in payload and not is_target_sa:
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
                scope=AuditScope.PLATFORM,
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
                scope=AuditScope.PLATFORM,
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
    items = list_platform_permission_catalog()
    counts = dict(
        PlatformPermissionGrant.objects.filter(user__is_active=True)
        .values("permission_id")
        .annotate(total=Count("user_id", distinct=True))
        .values_list("permission_id", "total")
    )
    return [
        {
            "code": item["code"],
            "description": item["description"],
            "active_grants_count": counts.get(item["code"], 0),
        }
        for item in items
    ]


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
        scope=AuditScope.PLATFORM,
        action="platform.user.password_reset_sent",
        object_type="user",
        object_id=user.id,
        after={"email": user.email},
        ip_address=_request_ip(request),
        request_id=_request_id(request),
    )
    return {"sent": True}


SENSITIVE_KEYS = {"password", "token", "secret", "hash", "key", "authorization"}


def _sanitize_payload(payload):
    if not isinstance(payload, dict):
        return payload
    cleaned = {}
    for k, v in payload.items():
        if any(s in k.lower() for s in SENSITIVE_KEYS):
            cleaned[k] = "••••••••"
        elif isinstance(v, dict):
            cleaned[k] = _sanitize_payload(v)
        elif isinstance(v, list):
            cleaned[k] = [_sanitize_payload(item) if isinstance(item, dict) else item for item in v]
        else:
            cleaned[k] = v
    return cleaned


def list_audit_logs(*, query_params) -> dict:
    details = page_errors(query_params.get("page"), query_params.get("page_size"))
    queryset = AuditLog.objects.select_related("actor", "company").order_by("-created_at", "id")

    search = (query_params.get("q") or "").strip()
    if search:
        queryset = queryset.filter(
            Q(action__icontains=search)
            | Q(object_type__icontains=search)
            | Q(actor__email__icontains=search)
            | Q(company__display_name__icontains=search)
        )

    action = (query_params.get("action") or "").strip()
    if action:
        queryset = queryset.filter(action__istartswith=action)

    actor_id = (query_params.get("actor_id") or "").strip()
    if actor_id:
        queryset = queryset.filter(actor_id=actor_id)

    scope = (query_params.get("scope") or "").strip()
    if scope:
        queryset = queryset.filter(scope=scope)

    company_id = (query_params.get("company_id") or "").strip()
    if company_id:
        queryset = queryset.filter(company_id=company_id)

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

    if details:
        raise validation_error(details)

    page = paginate(queryset, page_raw=query_params.get("page"), page_size_raw=query_params.get("page_size"))
    page["results"] = [
        {
            "id": str(row.id),
            "scope": row.scope,
            "company_id": str(row.company_id) if row.company_id else None,
            "company_name": row.company.display_name if row.company else None,
            "actor_user_id": str(row.actor_id) if row.actor_id else None,
            "actor_email": row.actor.email if row.actor else "System",
            "actor_name": f"{row.actor.first_name} {row.actor.last_name}".strip() if row.actor else "System",
            "action": row.action,
            "object_type": row.object_type,
            "object_id": str(row.object_id) if row.object_id else None,
            "request_id": str(row.request_id) if row.request_id else None,
            "ip_address": row.ip_address,
            "before": _sanitize_payload(row.before),
            "after": _sanitize_payload(row.after),
            "created_at": _iso(row.created_at),
        }
        for row in page["results"]
    ]
    return page


def get_audit_log_detail(*, log_id) -> dict:
    row = AuditLog.objects.select_related("actor", "company").filter(pk=log_id).first()
    if row is None:
        raise not_found("Audit log not found.")
    return {
        "id": str(row.id),
        "scope": row.scope,
        "company_id": str(row.company_id) if row.company_id else None,
        "company_name": row.company.display_name if row.company else None,
        "actor_user_id": str(row.actor_id) if row.actor_id else None,
        "actor_email": row.actor.email if row.actor else "System",
        "actor_name": f"{row.actor.first_name} {row.actor.last_name}".strip() if row.actor else "System",
        "action": row.action,
        "object_type": row.object_type,
        "object_id": str(row.object_id) if row.object_id else None,
        "request_id": str(row.request_id) if row.request_id else None,
        "ip_address": row.ip_address,
        "before": _sanitize_payload(row.before),
        "after": _sanitize_payload(row.after),
        "created_at": _iso(row.created_at),
    }


def empty_record_page(*, query_params) -> dict:
    details = page_errors(query_params.get("page"), query_params.get("page_size"))
    if details:
        raise validation_error(details)
    page = paginate(Company.objects.none(), page_raw=query_params.get("page"), page_size_raw=query_params.get("page_size"))
    page["results"] = []
    return page


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
        "membership_count": getattr(company, "membership_count", 0),
    }
