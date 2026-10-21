from django.db import migrations


def seed(apps, schema_editor):
    from apps.authorization.company import ensure_company_catalog

    ensure_company_catalog()


def unseed(apps, schema_editor):
    Permission = apps.get_model("authorization", "Permission")
    RoleTemplate = apps.get_model("authorization", "RoleTemplate")
    Permission.objects.filter(scope="company").delete()
    RoleTemplate.objects.all().delete()


class Migration(migrations.Migration):
    dependencies = [("authorization", "0003_roletemplate_companyrole_companyrolenavigation_and_more")]
    operations = [migrations.RunPython(seed, unseed)]
