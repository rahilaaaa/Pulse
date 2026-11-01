from django.db import migrations


CODES = [
    ("parties.view", "View external parties.", None),
    ("parties.manage", "Create and update external parties.", None),
    ("projects.view", "View projects and tasks.", "projects"),
    ("projects.manage", "Create and update projects and tasks.", "projects"),
    ("crm.view", "View CRM leads and accounts.", "crm"),
    ("crm.manage", "Create and convert CRM leads and accounts.", "crm"),
    ("commerce.view", "View commerce products and orders.", "commerce"),
    ("commerce.manage", "Create commerce products and orders.", "commerce"),
]


def seed(apps, schema_editor):
    Permission = apps.get_model("authorization", "Permission")
    CompanyRole = apps.get_model("authorization", "CompanyRole")
    CompanyRolePermission = apps.get_model("authorization", "CompanyRolePermission")

    for code, description, module_slug in CODES:
        Permission.objects.update_or_create(
            code=code,
            defaults={
                "description": description,
                "scope": "company",
                "module_slug": module_slug,
            },
        )
    for role in CompanyRole.objects.filter(is_system=True, is_owner_role=False, template_code="administrator"):
        for code, _description, _module in CODES:
            CompanyRolePermission.objects.get_or_create(role=role, permission_id=code)


def unseed(apps, schema_editor):
    Permission = apps.get_model("authorization", "Permission")
    Permission.objects.filter(code__in=[code for code, _d, _m in CODES]).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("authorization", "0009_backfill_record_scopes"),
    ]

    operations = [
        migrations.RunPython(seed, unseed),
    ]
