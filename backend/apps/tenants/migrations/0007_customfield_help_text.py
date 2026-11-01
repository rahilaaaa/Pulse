from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("tenants", "0006_notifications"),
    ]

    operations = [
        migrations.AddField(
            model_name="customfield",
            name="help_text",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
    ]
