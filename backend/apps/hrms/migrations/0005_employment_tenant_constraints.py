"""Composite tenant FKs for Employment and HRMS assignments."""

from django.db import migrations

PAIRS = [
    (
        "ALTER TABLE hrms_employments ADD CONSTRAINT hrms_employment_person_company_fk "
        "FOREIGN KEY (company_id, person_id) REFERENCES people (company_id, id) "
        "DEFERRABLE INITIALLY DEFERRED",
        "ALTER TABLE hrms_employments DROP CONSTRAINT IF EXISTS hrms_employment_person_company_fk",
    ),
    (
        "ALTER TABLE hrms_employments ADD CONSTRAINT hrms_employment_entity_company_fk "
        "FOREIGN KEY (company_id, legal_entity_id) REFERENCES legal_entities (company_id, id) "
        "DEFERRABLE INITIALLY DEFERRED",
        "ALTER TABLE hrms_employments DROP CONSTRAINT IF EXISTS hrms_employment_entity_company_fk",
    ),
    (
        "ALTER TABLE hrms_employment_department_assignments ADD CONSTRAINT hrms_emp_dept_employment_company_fk "
        "FOREIGN KEY (company_id, employment_id) REFERENCES hrms_employments (company_id, id) "
        "DEFERRABLE INITIALLY DEFERRED",
        "ALTER TABLE hrms_employment_department_assignments DROP CONSTRAINT IF EXISTS hrms_emp_dept_employment_company_fk",
    ),
    (
        "ALTER TABLE hrms_employment_department_assignments ADD CONSTRAINT hrms_emp_dept_department_company_fk "
        "FOREIGN KEY (company_id, department_id) REFERENCES departments (company_id, id) "
        "DEFERRABLE INITIALLY DEFERRED",
        "ALTER TABLE hrms_employment_department_assignments DROP CONSTRAINT IF EXISTS hrms_emp_dept_department_company_fk",
    ),
    (
        "ALTER TABLE hrms_employment_location_assignments ADD CONSTRAINT hrms_emp_location_employment_company_fk "
        "FOREIGN KEY (company_id, employment_id) REFERENCES hrms_employments (company_id, id) "
        "DEFERRABLE INITIALLY DEFERRED",
        "ALTER TABLE hrms_employment_location_assignments DROP CONSTRAINT IF EXISTS hrms_emp_location_employment_company_fk",
    ),
    (
        "ALTER TABLE hrms_employment_location_assignments ADD CONSTRAINT hrms_emp_location_location_company_fk "
        "FOREIGN KEY (company_id, work_location_id) REFERENCES hrms_work_locations (company_id, id) "
        "DEFERRABLE INITIALLY DEFERRED",
        "ALTER TABLE hrms_employment_location_assignments DROP CONSTRAINT IF EXISTS hrms_emp_location_location_company_fk",
    ),
    (
        "ALTER TABLE hrms_employment_reporting_lines ADD CONSTRAINT hrms_reporting_manager_company_fk "
        "FOREIGN KEY (company_id, manager_id) REFERENCES hrms_employments (company_id, id) "
        "DEFERRABLE INITIALLY DEFERRED",
        "ALTER TABLE hrms_employment_reporting_lines DROP CONSTRAINT IF EXISTS hrms_reporting_manager_company_fk",
    ),
    (
        "ALTER TABLE hrms_employment_reporting_lines ADD CONSTRAINT hrms_reporting_report_company_fk "
        "FOREIGN KEY (company_id, report_id) REFERENCES hrms_employments (company_id, id) "
        "DEFERRABLE INITIALLY DEFERRED",
        "ALTER TABLE hrms_employment_reporting_lines DROP CONSTRAINT IF EXISTS hrms_reporting_report_company_fk",
    ),
    (
        "ALTER TABLE hrms_approval_delegations ADD CONSTRAINT hrms_delegator_company_fk "
        "FOREIGN KEY (company_id, delegator_id) REFERENCES hrms_employments (company_id, id) "
        "DEFERRABLE INITIALLY DEFERRED",
        "ALTER TABLE hrms_approval_delegations DROP CONSTRAINT IF EXISTS hrms_delegator_company_fk",
    ),
    (
        "ALTER TABLE hrms_approval_delegations ADD CONSTRAINT hrms_delegate_company_fk "
        "FOREIGN KEY (company_id, delegate_id) REFERENCES hrms_employments (company_id, id) "
        "DEFERRABLE INITIALLY DEFERRED",
        "ALTER TABLE hrms_approval_delegations DROP CONSTRAINT IF EXISTS hrms_delegate_company_fk",
    ),
    (
        "ALTER TABLE hrms_employment_history ADD CONSTRAINT hrms_history_employment_company_fk "
        "FOREIGN KEY (company_id, employment_id) REFERENCES hrms_employments (company_id, id) "
        "DEFERRABLE INITIALLY DEFERRED",
        "ALTER TABLE hrms_employment_history DROP CONSTRAINT IF EXISTS hrms_history_employment_company_fk",
    ),
]


def forwards(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    with schema_editor.connection.cursor() as cursor:
        for statement, _reverse in PAIRS:
            cursor.execute(statement)


def backwards(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    with schema_editor.connection.cursor() as cursor:
        for _statement, reverse in reversed(PAIRS):
            cursor.execute(reverse)


class Migration(migrations.Migration):
    dependencies = [
        ("hrms", "0004_employment_approvaldelegation_and_more"),
    ]

    operations = [migrations.RunPython(forwards, backwards)]
