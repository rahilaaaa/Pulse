"""Composite tenant FKs for lifecycle, documents, tasks, and requests."""

from django.db import migrations

PAIRS = [
    (
        "ALTER TABLE hrms_onboarding_tasks ADD CONSTRAINT hrms_onboard_task_employment_company_fk "
        "FOREIGN KEY (company_id, employment_id) REFERENCES hrms_employments (company_id, id) "
        "DEFERRABLE INITIALLY DEFERRED",
        "ALTER TABLE hrms_onboarding_tasks DROP CONSTRAINT IF EXISTS hrms_onboard_task_employment_company_fk",
    ),
    (
        "ALTER TABLE hrms_offboarding_tasks ADD CONSTRAINT hrms_offboard_task_employment_company_fk "
        "FOREIGN KEY (company_id, employment_id) REFERENCES hrms_employments (company_id, id) "
        "DEFERRABLE INITIALLY DEFERRED",
        "ALTER TABLE hrms_offboarding_tasks DROP CONSTRAINT IF EXISTS hrms_offboard_task_employment_company_fk",
    ),
    (
        "ALTER TABLE hrms_employee_documents ADD CONSTRAINT hrms_doc_employment_company_fk "
        "FOREIGN KEY (company_id, employment_id) REFERENCES hrms_employments (company_id, id) "
        "DEFERRABLE INITIALLY DEFERRED",
        "ALTER TABLE hrms_employee_documents DROP CONSTRAINT IF EXISTS hrms_doc_employment_company_fk",
    ),
    (
        "ALTER TABLE hrms_hr_requests ADD CONSTRAINT hrms_request_employment_company_fk "
        "FOREIGN KEY (company_id, employment_id) REFERENCES hrms_employments (company_id, id) "
        "DEFERRABLE INITIALLY DEFERRED",
        "ALTER TABLE hrms_hr_requests DROP CONSTRAINT IF EXISTS hrms_request_employment_company_fk",
    ),
]


def apply_constraints(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    for forward, _reverse in PAIRS:
        schema_editor.execute(forward)


def revert_constraints(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    for _forward, reverse in reversed(PAIRS):
        schema_editor.execute(reverse)


class Migration(migrations.Migration):
    dependencies = [
        ("hrms", "0013_designation_employeedocument_hrrequest_and_more"),
    ]

    operations = [
        migrations.RunPython(apply_constraints, revert_constraints),
    ]

