from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("organization", "0005_person_custom_data"),
    ]

    operations = [
        migrations.AddField(
            model_name="person",
            name="deactivated_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
