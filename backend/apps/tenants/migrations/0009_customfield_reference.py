from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("tenants", "0008_company_custom_data"),
    ]

    operations = [
        migrations.AddField(
            model_name="customfield",
            name="config",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.RemoveConstraint(
            model_name="customfield",
            name="custom_fields_type_valid",
        ),
        migrations.AddConstraint(
            model_name="customfield",
            constraint=models.CheckConstraint(
                condition=models.Q(
                    (
                        "field_type__in",
                        [
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
                        ],
                    )
                ),
                name="custom_fields_type_valid",
            ),
        ),
    ]
