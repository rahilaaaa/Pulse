from django.db import migrations


DEFAULTS = {
    "owner": {"hrms.leave": "company"},
    "administrator": {"hrms.leave": "company"},
    "hr_manager": {"hrms.leave": "company"},
    "department_manager": {"hrms.leave": "manage"},
    "employee": {"hrms.leave": "own"},
}


def forwards(apps, schema_editor):
    CompanyRole = apps.get_model("authorization", "CompanyRole")
    for role in CompanyRole.objects.all():
        if role.record_scopes:
            continue
        scopes = DEFAULTS.get(role.template_code or "", {})
        if role.is_owner_role and not scopes:
            scopes = {"hrms.leave": "company"}
        CompanyRole.objects.filter(pk=role.pk).update(record_scopes=scopes)


def backwards(apps, schema_editor):
    CompanyRole = apps.get_model("authorization", "CompanyRole")
    CompanyRole.objects.all().update(record_scopes={})


class Migration(migrations.Migration):

    dependencies = [
        ("authorization", "0008_tenant_integrity_and_scopes"),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
