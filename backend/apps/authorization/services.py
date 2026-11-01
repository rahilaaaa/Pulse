from apps.authorization.catalog import PLATFORM_PERMISSIONS
from apps.authorization.models import Permission, PermissionScope, PlatformPermissionGrant
from common.api.errors import conflict, validation_error

MANAGE_CODE = "platform.users.manage"
_PLATFORM_CODES = {code for code, _description in PLATFORM_PERMISSIONS}


def ensure_platform_catalog() -> None:
    for code, description in PLATFORM_PERMISSIONS:
        Permission.objects.update_or_create(
            code=code,
            defaults={"description": description, "scope": PermissionScope.PLATFORM, "module_slug": None},
        )


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


def user_has_platform_permission(user, code: str) -> bool:
    if not getattr(user, "is_authenticated", False) or not user.is_active:
        return False
    return PlatformPermissionGrant.objects.filter(
        user=user,
        permission_id=code,
        permission__scope=PermissionScope.PLATFORM,
    ).exists()


def platform_permission_codes(user) -> list[str]:
    return sorted(
        PlatformPermissionGrant.objects.filter(user=user, permission__scope=PermissionScope.PLATFORM).values_list(
            "permission_id", flat=True
        )
    )


def list_platform_permission_catalog() -> list[dict]:
    ensure_platform_catalog()
    return [{"code": code, "description": description} for code, description in PLATFORM_PERMISSIONS]


def count_active_managers(*, exclude_user_id=None) -> int:
    qs = PlatformPermissionGrant.objects.filter(
        permission_id=MANAGE_CODE,
        user__is_active=True,
    )
    if exclude_user_id is not None:
        qs = qs.exclude(user_id=exclude_user_id)
    return qs.values("user_id").distinct().count()


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
