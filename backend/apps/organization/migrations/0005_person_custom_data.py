from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("organization", "0004_person_work_email_unique"),
    ]

    operations = [
        migrations.AddField(
            model_name="person",
            name="custom_data",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
