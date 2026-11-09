from django.db import migrations, models


def lowercase_and_dedupe_work_emails(apps, schema_editor):
    Person = apps.get_model("organization", "Person")
    for person in Person.objects.exclude(work_email="").iterator():
        normalized = person.work_email.strip().lower()
        if person.work_email != normalized:
            person.work_email = normalized
            person.save(update_fields=["work_email"])
    seen = set()
    for person in Person.objects.exclude(work_email="").order_by("created_at", "id").iterator():
        key = (str(person.company_id), person.work_email)
        if key in seen:
            person.work_email = ""
            person.save(update_fields=["work_email"])
        else:
            seen.add(key)


class Migration(migrations.Migration):
    dependencies = [
        ("organization", "0003_department_custom_data"),
    ]

    operations = [
        migrations.RunPython(lowercase_and_dedupe_work_emails, migrations.RunPython.noop),
        migrations.AddConstraint(
            model_name="person",
            constraint=models.UniqueConstraint(
                condition=models.Q(("work_email", ""), _negated=True),
                fields=("company", "work_email"),
                name="people_company_work_email_unique",
            ),
        ),
    ]
