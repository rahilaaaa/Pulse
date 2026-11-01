from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("organization", "0002_organization_unit_types"),
    ]

    operations = [
        migrations.AddField(
            model_name="department",
            name="custom_data",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
