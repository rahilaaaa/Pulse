from apps.authorization.catalog import PLATFORM_PERMISSIONS
from apps.authorization.models import Permission, PermissionScope, PlatformPermissionGrant


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
