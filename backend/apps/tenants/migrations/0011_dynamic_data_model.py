import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("tenants", "0010_customfield_status"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="membershipinvitation",
            name="accepted_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="membershipinvitation",
            name="custom_data",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name="companymembership",
            name="custom_data",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.RemoveConstraint(
            model_name="customfield",
            name="custom_fields_entity_valid",
        ),
        migrations.AlterField(
            model_name="customfield",
            name="entity",
            field=models.CharField(
                choices=[
                    ("person", "Person"),
                    ("organization_unit", "Organization Unit"),
                    ("task", "Task"),
                    ("company", "Company"),
                    ("invitation", "Invitation"),
                    ("membership", "Membership"),
                ],
                max_length=32,
            ),
        ),
        migrations.AddConstraint(
            model_name="customfield",
            constraint=models.CheckConstraint(
                condition=models.Q(
                    entity__in=[
                        "person",
                        "organization_unit",
                        "task",
                        "company",
                        "invitation",
                        "membership",
                    ]
                ),
                name="custom_fields_entity_valid",
            ),
        ),
        migrations.CreateModel(
            name="CustomEntity",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("key", models.SlugField(max_length=64)),
                ("name", models.CharField(max_length=150)),
                ("description", models.CharField(blank=True, default="", max_length=500)),
                (
                    "status",
                    models.CharField(
                        choices=[("active", "Active"), ("archived", "Archived")],
                        default="active",
                        max_length=32,
                    ),
                ),
                ("schema_version", models.PositiveIntegerField(default=1)),
                ("archived_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "company",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="custom_entities",
                        to="tenants.company",
                    ),
                ),
            ],
            options={
                "db_table": "custom_entities",
                "ordering": ["name"],
            },
        ),
        migrations.CreateModel(
            name="CustomEntityField",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("name", models.CharField(max_length=150)),
                ("key", models.SlugField(max_length=64)),
                (
                    "field_type",
                    models.CharField(
                        choices=[
                            ("text", "Text"),
                            ("long_text", "Long text"),
                            ("number", "Number"),
                            ("date", "Date"),
                            ("boolean", "Boolean"),
                            ("select", "Select"),
                            ("multi_select", "Multi-select"),
                            ("email", "Email"),
                            ("url", "URL"),
                            ("phone", "Phone"),
                            ("reference", "Link"),
                        ],
                        default="text",
                        max_length=32,
                    ),
                ),
                ("help_text", models.CharField(blank=True, default="", max_length=255)),
                ("required", models.BooleanField(default=False)),
                ("sensitive", models.BooleanField(default=False)),
                ("self_editable", models.BooleanField(default=True)),
                ("filterable", models.BooleanField(default=False)),
                ("is_primary", models.BooleanField(default=False)),
                ("options", models.JSONField(blank=True, default=list)),
                ("config", models.JSONField(blank=True, default=dict)),
                ("position", models.PositiveIntegerField(default=0)),
                (
                    "status",
                    models.CharField(
                        choices=[("active", "Active"), ("archived", "Archived")],
                        default="active",
                        max_length=32,
                    ),
                ),
                ("archived_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "company",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="custom_entity_fields",
                        to="tenants.company",
                    ),
                ),
                (
                    "entity",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="fields",
                        to="tenants.customentity",
                    ),
                ),
            ],
            options={
                "db_table": "custom_entity_fields",
                "ordering": ["position", "name"],
            },
        ),
        migrations.CreateModel(
            name="CustomEntityRecord",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("data", models.JSONField(blank=True, default=dict)),
                ("archived_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "company",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="custom_entity_records",
                        to="tenants.company",
                    ),
                ),
                (
                    "created_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="custom_entity_records_created",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "entity",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="records",
                        to="tenants.customentity",
                    ),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="custom_entity_records_updated",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "db_table": "custom_entity_records",
            },
        ),
        migrations.AddConstraint(
            model_name="customentity",
            constraint=models.UniqueConstraint(fields=("company", "key"), name="custom_entities_company_key_unique"),
        ),
        migrations.AddConstraint(
            model_name="customentity",
            constraint=models.CheckConstraint(
                condition=models.Q(status__in=["active", "archived"]),
                name="custom_entities_status_valid",
            ),
        ),
        migrations.AddConstraint(
            model_name="customentityfield",
            constraint=models.UniqueConstraint(fields=("entity", "key"), name="custom_entity_fields_entity_key_unique"),
        ),
        migrations.AddConstraint(
            model_name="customentityfield",
            constraint=models.CheckConstraint(
                condition=models.Q(
                    field_type__in=[
                        "text",
                        "long_text",
                        "number",
                        "date",
                        "boolean",
                        "select",
                        "multi_select",
                        "email",
                        "url",
                        "phone",
                        "reference",
                    ]
                ),
                name="custom_entity_fields_type_valid",
            ),
        ),
        migrations.AddConstraint(
            model_name="customentityfield",
            constraint=models.CheckConstraint(
                condition=models.Q(status__in=["active", "archived"]),
                name="custom_entity_fields_status_valid",
            ),
        ),
        migrations.AddIndex(
            model_name="customentityrecord",
            index=models.Index(fields=["company", "entity", "created_at"], name="custom_entity_records_list_idx"),
        ),
        migrations.AddIndex(
            model_name="customentityrecord",
            index=models.Index(fields=["company", "entity", "archived_at"], name="custom_entity_records_arch_idx"),
        ),
    ]
