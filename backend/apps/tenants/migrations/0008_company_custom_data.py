from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("tenants", "0007_customfield_help_text"),
    ]

    operations = [
        migrations.AddField(
            model_name="company",
            name="custom_data",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
