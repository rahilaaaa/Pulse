"""Composite tenant FKs for payroll and compensation records."""

from django.db import migrations

PAIRS = [
    (
        "ALTER TABLE hrms_payroll_periods ADD CONSTRAINT hrms_period_entity_company_fk "
        "FOREIGN KEY (company_id, legal_entity_id) REFERENCES legal_entities (company_id, id) "
        "DEFERRABLE INITIALLY DEFERRED",
        "ALTER TABLE hrms_payroll_periods DROP CONSTRAINT IF EXISTS hrms_period_entity_company_fk",
    ),
    (
        "ALTER TABLE hrms_payroll_runs ADD CONSTRAINT hrms_run_period_company_fk "
        "FOREIGN KEY (company_id, period_id) REFERENCES hrms_payroll_periods (company_id, id) "
        "DEFERRABLE INITIALLY DEFERRED",
        "ALTER TABLE hrms_payroll_runs DROP CONSTRAINT IF EXISTS hrms_run_period_company_fk",
    ),
    (
        "ALTER TABLE hrms_payroll_runs ADD CONSTRAINT hrms_run_reversal_company_fk "
        "FOREIGN KEY (company_id, reverses_id) REFERENCES hrms_payroll_runs (company_id, id) "
        "DEFERRABLE INITIALLY DEFERRED",
        "ALTER TABLE hrms_payroll_runs DROP CONSTRAINT IF EXISTS hrms_run_reversal_company_fk",
    ),
    (
        "ALTER TABLE hrms_compensation_assignments ADD CONSTRAINT hrms_comp_employment_company_fk "
        "FOREIGN KEY (company_id, employment_id) REFERENCES hrms_employments (company_id, id) "
        "DEFERRABLE INITIALLY DEFERRED",
        "ALTER TABLE hrms_compensation_assignments DROP CONSTRAINT IF EXISTS hrms_comp_employment_company_fk",
    ),
    (
        "ALTER TABLE hrms_compensation_assignments ADD CONSTRAINT hrms_comp_structure_company_fk "
        "FOREIGN KEY (company_id, structure_id) REFERENCES hrms_salary_structures (company_id, id) "
        "DEFERRABLE INITIALLY DEFERRED",
        "ALTER TABLE hrms_compensation_assignments DROP CONSTRAINT IF EXISTS hrms_comp_structure_company_fk",
    ),
    (
        "ALTER TABLE hrms_salary_structure_components ADD CONSTRAINT hrms_struct_component_structure_company_fk "
        "FOREIGN KEY (company_id, structure_id) REFERENCES hrms_salary_structures (company_id, id) "
        "DEFERRABLE INITIALLY DEFERRED",
        "ALTER TABLE hrms_salary_structure_components DROP CONSTRAINT IF EXISTS hrms_struct_component_structure_company_fk",
    ),
    (
        "ALTER TABLE hrms_salary_structure_components ADD CONSTRAINT hrms_struct_component_component_company_fk "
        "FOREIGN KEY (company_id, component_id) REFERENCES hrms_salary_components (company_id, id) "
        "DEFERRABLE INITIALLY DEFERRED",
        "ALTER TABLE hrms_salary_structure_components DROP CONSTRAINT IF EXISTS hrms_struct_component_component_company_fk",
    ),
    (
        "ALTER TABLE hrms_payroll_lines ADD CONSTRAINT hrms_line_run_company_fk "
        "FOREIGN KEY (company_id, run_id) REFERENCES hrms_payroll_runs (company_id, id) "
        "DEFERRABLE INITIALLY DEFERRED",
        "ALTER TABLE hrms_payroll_lines DROP CONSTRAINT IF EXISTS hrms_line_run_company_fk",
    ),
    (
        "ALTER TABLE hrms_payroll_lines ADD CONSTRAINT hrms_line_employment_company_fk "
        "FOREIGN KEY (company_id, employment_id) REFERENCES hrms_employments (company_id, id) "
        "DEFERRABLE INITIALLY DEFERRED",
        "ALTER TABLE hrms_payroll_lines DROP CONSTRAINT IF EXISTS hrms_line_employment_company_fk",
    ),
    (
        "ALTER TABLE hrms_payroll_approvals ADD CONSTRAINT hrms_approval_run_company_fk "
        "FOREIGN KEY (company_id, run_id) REFERENCES hrms_payroll_runs (company_id, id) "
        "DEFERRABLE INITIALLY DEFERRED",
        "ALTER TABLE hrms_payroll_approvals DROP CONSTRAINT IF EXISTS hrms_approval_run_company_fk",
    ),
    (
        "ALTER TABLE hrms_payroll_payment_records ADD CONSTRAINT hrms_payment_run_company_fk "
        "FOREIGN KEY (company_id, run_id) REFERENCES hrms_payroll_runs (company_id, id) "
        "DEFERRABLE INITIALLY DEFERRED",
        "ALTER TABLE hrms_payroll_payment_records DROP CONSTRAINT IF EXISTS hrms_payment_run_company_fk",
    ),
    (
        "ALTER TABLE hrms_payslips ADD CONSTRAINT hrms_payslip_run_company_fk "
        "FOREIGN KEY (company_id, run_id) REFERENCES hrms_payroll_runs (company_id, id) "
        "DEFERRABLE INITIALLY DEFERRED",
        "ALTER TABLE hrms_payslips DROP CONSTRAINT IF EXISTS hrms_payslip_run_company_fk",
    ),
    (
        "ALTER TABLE hrms_payslips ADD CONSTRAINT hrms_payslip_line_company_fk "
        "FOREIGN KEY (company_id, line_id) REFERENCES hrms_payroll_lines (company_id, id) "
        "DEFERRABLE INITIALLY DEFERRED",
        "ALTER TABLE hrms_payslips DROP CONSTRAINT IF EXISTS hrms_payslip_line_company_fk",
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
        ("hrms", "0010_payrollline_hrms_payroll_line_company_id_id_unique"),
    ]

    operations = [migrations.RunPython(forwards, backwards)]
