from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("tenants", "0009_customfield_reference"),
    ]

    operations = [
        migrations.AddField(
            model_name="customfield",
            name="status",
            field=models.CharField(
                choices=[("active", "Active"), ("archived", "Archived")],
                default="active",
                max_length=32,
            ),
        ),
        migrations.AddField(
            model_name="customfield",
            name="archived_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddConstraint(
            model_name="customfield",
            constraint=models.CheckConstraint(
                condition=models.Q(("status__in", ["active", "archived"])),
                name="custom_fields_status_valid",
            ),
        ),
    ]
