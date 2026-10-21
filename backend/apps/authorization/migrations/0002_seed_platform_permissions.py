from django.db import migrations

from apps.authorization.catalog import PLATFORM_PERMISSIONS


def seed_platform_permissions(apps, schema_editor):
    Permission = apps.get_model("authorization", "Permission")
    for code, description in PLATFORM_PERMISSIONS:
        Permission.objects.update_or_create(
            code=code,
            defaults={"description": description, "scope": "platform", "module_slug": None},
        )


def remove_platform_permissions(apps, schema_editor):
    Permission = apps.get_model("authorization", "Permission")
    Permission.objects.filter(code__in=[code for code, _description in PLATFORM_PERMISSIONS]).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("authorization", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(seed_platform_permissions, remove_platform_permissions),
    ]
