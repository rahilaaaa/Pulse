from django.core.exceptions import ObjectDoesNotExist
from apps.authorization.catalog import PLATFORM_PERMISSIONS
from apps.authorization.models import (
    OperatorStatus,
    Permission,
    PermissionScope,
    PlatformOperatorProfile,
    PlatformPermissionGrant,
    PlatformSuperAdmin,
)
from common.api.errors import conflict, permission_denied, validation_error

MANAGE_CODE = "platform.users.manage"
_PLATFORM_CODES = {code for code, _description in PLATFORM_PERMISSIONS}

# Compatibility mapping: broad permissions imply granular, granular imply broad read/manage
_GRANULAR_BILLING_VIEW = {
    "platform.billing.invoices.view",
    "platform.billing.payments.view",
    "platform.billing.refunds.view",
    "platform.billing.reports.view",
}
_GRANULAR_BILLING_MANAGE = {
    "platform.billing.refunds.process",
    "platform.billing.subscriptions.manage",
    "platform.billing.plans.manage",
}


def ensure_platform_catalog() -> None:
    for code, description in PLATFORM_PERMISSIONS:
        Permission.objects.update_or_create(
            code=code,
            defaults={"description": description, "scope": PermissionScope.PLATFORM, "module_slug": None},
        )


def is_super_admin(user) -> bool:
    if not getattr(user, "is_authenticated", False) or not getattr(user, "is_active", False):
        return False
    return PlatformSuperAdmin.objects.filter(user=user).exists()


def get_super_admin():
    sa = PlatformSuperAdmin.objects.select_related("user").first()
    return sa.user if sa else None


def ensure_not_super_admin_target(target_user, action_desc: str = "modify") -> None:
    """Enforce backend protection that Super Admin cannot be deleted, deactivated, suspended, or demoted."""
    if is_super_admin(target_user):
        raise conflict(
            f"The Super Admin account is protected and cannot be {action_desc}.",
            [{"field": "user", "code": "super_admin_protected", "message": f"Cannot {action_desc} Super Admin."}],
        )


def ensure_super_admin_actor(actor, action_desc: str = "perform this action") -> None:
    """Enforce that only the single Super Admin can perform certain sensitive actions."""
    if not is_super_admin(actor):
        raise permission_denied(f"Only the Super Admin can {action_desc}.")


def grant_all_platform_permissions(user, granted_by=None) -> int:
    ensure_platform_catalog()
    created = 0
    for code, _description in PLATFORM_PERMISSIONS:
        _grant, was_created = PlatformPermissionGrant.objects.get_or_create(
            user=user,
            permission_id=code,
            defaults={"granted_by": granted_by},
        )
        if was_created:
            created += 1
    return created


def get_operator_profile(user):
    if not getattr(user, "is_authenticated", False):
        return None
    try:
        return user.platform_profile
    except (ObjectDoesNotExist, AttributeError):
        return None


def user_has_platform_permission(user, code: str) -> bool:
    if not getattr(user, "is_authenticated", False) or not user.is_active:
        return False

    profile = get_operator_profile(user)
    if profile is not None and profile.status != OperatorStatus.ACTIVE:
        return False

    # Super Admin has all platform permissions unconditionally
    if is_super_admin(user):
        return True

    # Check effective permissions from profile role + custom overrides
    if profile is not None:
        effective = set(profile.custom_permissions or [])
        if profile.role_id:
            role_perms = set(profile.role.role_permissions.values_list("permission_id", flat=True))
            effective.update(role_perms)

        if code in effective:
            return True

        # Check granular <-> broad permission compatibility
        if code == "platform.billing.view" and (effective & _GRANULAR_BILLING_VIEW):
            return True
        if code == "platform.billing.manage" and (effective & _GRANULAR_BILLING_MANAGE):
            return True
        if code in _GRANULAR_BILLING_VIEW and "platform.billing.view" in effective:
            return True
        if code in _GRANULAR_BILLING_MANAGE and "platform.billing.manage" in effective:
            return True

    # Fallback to direct PlatformPermissionGrant
    has_grant = PlatformPermissionGrant.objects.filter(
        user=user,
        permission_id=code,
        permission__scope=PermissionScope.PLATFORM,
    ).exists()
    if has_grant:
        return True

    # Also check broad vs granular on direct grants
    if code == "platform.billing.view":
        if PlatformPermissionGrant.objects.filter(
            user=user,
            permission_id__in=_GRANULAR_BILLING_VIEW,
            permission__scope=PermissionScope.PLATFORM,
        ).exists():
            return True
    elif code == "platform.billing.manage":
        if PlatformPermissionGrant.objects.filter(
            user=user,
            permission_id__in=_GRANULAR_BILLING_MANAGE,
            permission__scope=PermissionScope.PLATFORM,
        ).exists():
            return True
    elif code in _GRANULAR_BILLING_VIEW:
        if PlatformPermissionGrant.objects.filter(
            user=user,
            permission_id="platform.billing.view",
            permission__scope=PermissionScope.PLATFORM,
        ).exists():
            return True
    elif code in _GRANULAR_BILLING_MANAGE:
        if PlatformPermissionGrant.objects.filter(
            user=user,
            permission_id="platform.billing.manage",
            permission__scope=PermissionScope.PLATFORM,
        ).exists():
            return True

    return False


def platform_permission_codes(user) -> list[str]:
    if not getattr(user, "is_authenticated", False) or not user.is_active:
        return []

    profile = get_operator_profile(user)
    if profile is not None and profile.status != OperatorStatus.ACTIVE:
        return []

    if is_super_admin(user):
        ensure_platform_catalog()
        return sorted(code for code, _ in PLATFORM_PERMISSIONS)

    codes = set()
    if profile is not None:
        codes.update(profile.custom_permissions or [])
        if profile.role_id:
            role_perms = profile.role.role_permissions.values_list("permission_id", flat=True)
            codes.update(role_perms)

    direct_grants = PlatformPermissionGrant.objects.filter(
        user=user, permission__scope=PermissionScope.PLATFORM
    ).values_list("permission_id", flat=True)
    codes.update(direct_grants)

    return sorted(codes)


def list_platform_permission_catalog() -> list[dict]:
    ensure_platform_catalog()
    return [{"code": code, "description": description} for code, description in PLATFORM_PERMISSIONS]


def count_active_managers(*, exclude_user_id=None) -> int:
    # Any active super admin or operator with platform.users.manage
    count = 0
    sa = get_super_admin()
    if sa and sa.is_active and (exclude_user_id is None or sa.id != exclude_user_id):
        count += 1

    qs = PlatformOperatorProfile.objects.filter(
        status=OperatorStatus.ACTIVE,
        user__is_active=True,
    )
    if exclude_user_id is not None:
        qs = qs.exclude(user_id=exclude_user_id)
    if sa:
        qs = qs.exclude(user_id=sa.id)

    for prof in qs.select_related("role"):
        if prof.role and prof.role.role_permissions.filter(permission_id=MANAGE_CODE).exists():
            count += 1
        elif MANAGE_CODE in (prof.custom_permissions or []):
            count += 1

    # Also count direct grants
    grant_qs = PlatformPermissionGrant.objects.filter(
        permission_id=MANAGE_CODE,
        user__is_active=True,
    )
    if exclude_user_id is not None:
        grant_qs = grant_qs.exclude(user_id=exclude_user_id)
    if sa:
        grant_qs = grant_qs.exclude(user_id=sa.id)
    count += grant_qs.values("user_id").distinct().count()

    return count


def normalize_permission_codes(raw) -> list[str]:
    if raw is None:
        return []
    if not isinstance(raw, list) or not all(isinstance(item, str) for item in raw):
        raise validation_error(
            [{"field": "permission_codes", "code": "invalid", "message": "Send a list of permission codes."}]
        )
    cleaned = []
    seen = set()
    for code in raw:
        text = code.strip()
        if not text:
            continue
        if text not in _PLATFORM_CODES:
            raise validation_error(
                [
                    {
                        "field": "permission_codes",
                        "code": "invalid",
                        "message": f"Unknown platform permission: {text}.",
                    }
                ]
            )
        if text not in seen:
            seen.add(text)
            cleaned.append(text)
    return cleaned


def sync_platform_grants(*, user, codes: list[str], granted_by=None) -> tuple[list[str], list[str]]:
    """Replace the user's platform grants with exactly `codes`. Returns (before, after)."""
    ensure_platform_catalog()
    before = platform_permission_codes(user)
    wanted = set(codes)

    # Protect Super Admin privileges
    if is_super_admin(user):
        ensure_not_super_admin_target(user, "modified")

    # Last-manager protection: do not remove manage from the sole active manager.
    losing_manage = MANAGE_CODE in before and MANAGE_CODE not in wanted
    if losing_manage and user.is_active and count_active_managers(exclude_user_id=user.id) == 0:
        raise conflict(
            "At least one active platform operator must keep platform.users.manage.",
            [
                {
                    "field": "permission_codes",
                    "code": "last_manager",
                    "message": "At least one active platform operator must keep platform.users.manage.",
                }
            ],
        )

    PlatformPermissionGrant.objects.filter(user=user).exclude(permission_id__in=wanted).delete()
    for code in wanted:
        PlatformPermissionGrant.objects.get_or_create(
            user=user,
            permission_id=code,
            defaults={"granted_by": granted_by},
        )
    after = platform_permission_codes(user)
    return before, after
