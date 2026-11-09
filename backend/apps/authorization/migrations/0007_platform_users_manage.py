from django.db import migrations


def seed_platform_users_manage(apps, schema_editor):
    from apps.authorization.models import PlatformPermissionGrant
    from apps.authorization.services import ensure_platform_catalog
    from apps.identity.models import User

    ensure_platform_catalog()
    # Anyone who already has platform.users.view also gets manage so the console stays usable.
    user_ids = (
        PlatformPermissionGrant.objects.filter(permission_id="platform.users.view")
        .values_list("user_id", flat=True)
        .distinct()
    )
    for user in User.objects.filter(id__in=user_ids):
        PlatformPermissionGrant.objects.get_or_create(
            user=user,
            permission_id="platform.users.manage",
            defaults={"granted_by": None},
        )


def unseed(apps, schema_editor):
    Permission = apps.get_model("authorization", "Permission")
    Permission.objects.filter(code="platform.users.manage").delete()


class Migration(migrations.Migration):
    dependencies = [
        ("authorization", "0006_custom_entity_permissions"),
    ]

    operations = [
        migrations.RunPython(seed_platform_users_manage, unseed),
    ]
