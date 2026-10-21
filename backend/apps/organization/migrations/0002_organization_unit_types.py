import re
import uuid

import django.db.models.deletion
from django.db import migrations, models


def _key_from_name(name):
    text = re.sub(r"[^a-z0-9]+", "-", (name or "").strip().lower()).strip("-")[:64]
    return text or "unit"


def backfill_department_keys(apps, schema_editor):
    Department = apps.get_model("organization", "Department")
    used = {}
    for row in Department.objects.all().order_by("created_at", "id"):
        taken = used.setdefault(row.company_id, set())
        base = _key_from_name(row.name)
        key = base
        number = 2
        while key in taken:
            suffix = f"-{number}"
            key = f"{base[: 64 - len(suffix)]}{suffix}"
            number += 1
        taken.add(key)
        row.key = key
        row.save(update_fields=["key"])


def clear_department_keys(apps, schema_editor):
    Department = apps.get_model("organization", "Department")
    Department.objects.update(key=None)


class Migration(migrations.Migration):

    dependencies = [
        ("organization", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="OrganizationUnitType",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("key", models.SlugField(max_length=64)),
                ("singular_label", models.CharField(max_length=150)),
                ("plural_label", models.CharField(max_length=150)),
                ("icon", models.CharField(blank=True, default="", max_length=64)),
                ("description", models.TextField(blank=True, default="")),
                ("is_active", models.BooleanField(default=True)),
                ("position", models.PositiveIntegerField(default=0)),
                ("allowed_parent_keys", models.JSONField(blank=True, default=list)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("company", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="unit_types", to="tenants.company")),
            ],
            options={
                "db_table": "organization_unit_types",
                "ordering": ["position", "singular_label"],
            },
        ),
        migrations.AddConstraint(
            model_name="organizationunittype",
            constraint=models.UniqueConstraint(fields=("company", "key"), name="org_unit_types_company_key_unique"),
        ),
        migrations.AddField(
            model_name="department",
            name="description",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="department",
            name="key",
            field=models.SlugField(blank=True, max_length=64, null=True),
        ),
        migrations.AddField(
            model_name="department",
            name="status",
            field=models.CharField(choices=[("active", "Active"), ("inactive", "Inactive")], default="active", max_length=32),
        ),
        migrations.AddField(
            model_name="department",
            name="manager",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="managed_units", to="organization.person"),
        ),
        migrations.AddField(
            model_name="department",
            name="unit_type",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="units", to="organization.organizationunittype"),
        ),
        migrations.RunPython(backfill_department_keys, clear_department_keys),
        migrations.AddConstraint(
            model_name="department",
            constraint=models.UniqueConstraint(condition=models.Q(("key__isnull", False)), fields=("company", "key"), name="departments_company_key_unique"),
        ),
        migrations.AddConstraint(
            model_name="department",
            constraint=models.CheckConstraint(condition=models.Q(("status__in", ["active", "inactive"])), name="departments_status_valid"),
        ),
    ]
