from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("identity", "0004_passwordresettoken"),
    ]

    operations = [
        migrations.RemoveField(
            model_name="user",
            name="mfa_enabled_at",
        ),
        migrations.RemoveField(
            model_name="user",
            name="mfa_secret",
        ),
    ]
