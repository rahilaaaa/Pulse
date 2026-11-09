from django.db import migrations

from apps.authorization.catalog import COMPANY_PERMISSIONS, PLATFORM_PERMISSIONS


def seed_permissions_and_super_admin(apps, schema_editor):
    Permission = apps.get_model("authorization", "Permission")
    PlatformPermissionGrant = apps.get_model("authorization", "PlatformPermissionGrant")
    PlatformSuperAdmin = apps.get_model("authorization", "PlatformSuperAdmin")
    PlatformOperatorProfile = apps.get_model("authorization", "PlatformOperatorProfile")
    User = apps.get_model("identity", "User")

    for code, description in PLATFORM_PERMISSIONS:
        Permission.objects.update_or_create(
            code=code,
            defaults={"description": description, "scope": "platform", "module_slug": None},
        )

    for item in COMPANY_PERMISSIONS:
        code, description = item[0], item[1]
        module_slug = item[2] if len(item) > 2 else None
        Permission.objects.update_or_create(
            code=code,
            defaults={"description": description, "scope": "company", "module_slug": module_slug},
        )

    # If there are existing platform operators, ensure exactly one is Super Admin
    if not PlatformSuperAdmin.objects.filter(id=1).exists():
        # Look for existing manager or any user with platform grants
        super_candidate = (
            User.objects.filter(
                platform_grants__permission_id="platform.users.manage",
                is_active=True,
            )
            .order_by("created_at")
            .first()
        )
        if not super_candidate:
            super_candidate = (
                User.objects.filter(
                    platform_grants__permission__scope="platform",
                    is_active=True,
                )
                .order_by("created_at")
                .first()
            )

        if super_candidate:
            PlatformSuperAdmin.objects.create(id=1, user=super_candidate)
            profile, _ = PlatformOperatorProfile.objects.get_or_create(
                user=super_candidate,
                defaults={"is_super_admin": True, "status": "active"},
            )
            profile.is_super_admin = True
            profile.status = "active"
            profile.save()

    # Backfill profiles for any remaining platform grant holders
    user_ids = (
        PlatformPermissionGrant.objects.filter(permission__scope="platform")
        .values_list("user_id", flat=True)
        .distinct()
    )
    for u in User.objects.filter(id__in=user_ids):
        is_sa = PlatformSuperAdmin.objects.filter(user=u).exists()
        PlatformOperatorProfile.objects.get_or_create(
            user=u,
            defaults={"is_super_admin": is_sa, "status": "active"},
        )


def rollback(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("authorization", "0011_platform_roles_and_super_admin"),
    ]

    operations = [
        migrations.RunPython(seed_permissions_and_super_admin, rollback),
    ]

