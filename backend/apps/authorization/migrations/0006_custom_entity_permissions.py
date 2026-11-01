from django.db import migrations


CODES = [
    "custom_entities.manage",
    "custom_entities.view",
    "custom_entities.create",
    "custom_entities.update",
    "custom_entities.delete",
]


def seed_custom_entity_permissions(apps, schema_editor):
    Permission = apps.get_model("authorization", "Permission")
    CompanyRole = apps.get_model("authorization", "CompanyRole")
    CompanyRolePermission = apps.get_model("authorization", "CompanyRolePermission")

    descriptions = {
        "custom_entities.manage": "Create and archive custom entities and their fields.",
        "custom_entities.view": "List and view custom entity records.",
        "custom_entities.create": "Create custom entity records.",
        "custom_entities.update": "Update custom entity records.",
        "custom_entities.delete": "Archive custom entity records.",
    }
    for code in CODES:
        Permission.objects.update_or_create(
            code=code,
            defaults={
                "description": descriptions[code],
                "scope": "company",
                "module_slug": None,
            },
        )
    for role in CompanyRole.objects.filter(is_system=True):
        for code in CODES:
            if not Permission.objects.filter(code=code, scope="company").exists():
                continue
            CompanyRolePermission.objects.get_or_create(role=role, permission_id=code)


def unseed(apps, schema_editor):
    Permission = apps.get_model("authorization", "Permission")
    Permission.objects.filter(code__in=CODES).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("authorization", "0005_companyrole_archive"),
    ]

    operations = [
        migrations.RunPython(seed_custom_entity_permissions, unseed),
    ]
