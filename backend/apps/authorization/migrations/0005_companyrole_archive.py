from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("authorization", "0004_seed_company_catalog"),
    ]

    operations = [
        migrations.AddField(
            model_name="companyrole",
            name="is_active",
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name="companyrole",
            name="archived_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
