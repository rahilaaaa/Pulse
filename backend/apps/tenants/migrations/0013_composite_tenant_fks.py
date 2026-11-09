"""Add composite (company_id, parent_id) FKs for critical tenant-owned pairs (ADR-021).

Requires matching UniqueConstraint(company, id) on parent tables (prior migrations).
Application filters remain required; these constraints reject cross-company parent pairing.
PostgreSQL only — SQLite test runs skip the DDL.
"""

from django.db import migrations

PAIRS = [
    (
        """
        ALTER TABLE company_memberships
          ADD CONSTRAINT company_memberships_person_company_fk
          FOREIGN KEY (company_id, person_id)
          REFERENCES people (company_id, id)
          DEFERRABLE INITIALLY DEFERRED
        """,
        "ALTER TABLE company_memberships DROP CONSTRAINT IF EXISTS company_memberships_person_company_fk",
    ),
    (
        """
        ALTER TABLE people
          ADD CONSTRAINT people_department_company_fk
          FOREIGN KEY (company_id, department_id)
          REFERENCES departments (company_id, id)
          DEFERRABLE INITIALLY DEFERRED
        """,
        "ALTER TABLE people DROP CONSTRAINT IF EXISTS people_department_company_fk",
    ),
    (
        """
        ALTER TABLE departments
          ADD CONSTRAINT departments_parent_company_fk
          FOREIGN KEY (company_id, parent_id)
          REFERENCES departments (company_id, id)
          DEFERRABLE INITIALLY DEFERRED
        """,
        "ALTER TABLE departments DROP CONSTRAINT IF EXISTS departments_parent_company_fk",
    ),
    (
        """
        ALTER TABLE departments
          ADD CONSTRAINT departments_manager_company_fk
          FOREIGN KEY (company_id, manager_id)
          REFERENCES people (company_id, id)
          DEFERRABLE INITIALLY DEFERRED
        """,
        "ALTER TABLE departments DROP CONSTRAINT IF EXISTS departments_manager_company_fk",
    ),
    (
        """
        ALTER TABLE departments
          ADD CONSTRAINT departments_unit_type_company_fk
          FOREIGN KEY (company_id, unit_type_id)
          REFERENCES organization_unit_types (company_id, id)
          DEFERRABLE INITIALLY DEFERRED
        """,
        "ALTER TABLE departments DROP CONSTRAINT IF EXISTS departments_unit_type_company_fk",
    ),
    (
        """
        ALTER TABLE hrms_leave_requests
          ADD CONSTRAINT hrms_leave_requests_person_company_fk
          FOREIGN KEY (company_id, person_id)
          REFERENCES people (company_id, id)
          DEFERRABLE INITIALLY DEFERRED
        """,
        "ALTER TABLE hrms_leave_requests DROP CONSTRAINT IF EXISTS hrms_leave_requests_person_company_fk",
    ),
    (
        """
        ALTER TABLE hrms_leave_requests
          ADD CONSTRAINT hrms_leave_requests_policy_company_fk
          FOREIGN KEY (company_id, policy_id)
          REFERENCES hrms_leave_policies (company_id, id)
          DEFERRABLE INITIALLY DEFERRED
        """,
        "ALTER TABLE hrms_leave_requests DROP CONSTRAINT IF EXISTS hrms_leave_requests_policy_company_fk",
    ),
    (
        """
        ALTER TABLE hrms_leave_balances
          ADD CONSTRAINT hrms_leave_balances_person_company_fk
          FOREIGN KEY (company_id, person_id)
          REFERENCES people (company_id, id)
          DEFERRABLE INITIALLY DEFERRED
        """,
        "ALTER TABLE hrms_leave_balances DROP CONSTRAINT IF EXISTS hrms_leave_balances_person_company_fk",
    ),
    (
        """
        ALTER TABLE hrms_leave_balances
          ADD CONSTRAINT hrms_leave_balances_policy_company_fk
          FOREIGN KEY (company_id, policy_id)
          REFERENCES hrms_leave_policies (company_id, id)
          DEFERRABLE INITIALLY DEFERRED
        """,
        "ALTER TABLE hrms_leave_balances DROP CONSTRAINT IF EXISTS hrms_leave_balances_policy_company_fk",
    ),
    (
        """
        ALTER TABLE custom_entity_fields
          ADD CONSTRAINT custom_entity_fields_entity_company_fk
          FOREIGN KEY (company_id, entity_id)
          REFERENCES custom_entities (company_id, id)
          DEFERRABLE INITIALLY DEFERRED
        """,
        "ALTER TABLE custom_entity_fields DROP CONSTRAINT IF EXISTS custom_entity_fields_entity_company_fk",
    ),
    (
        """
        ALTER TABLE custom_entity_records
          ADD CONSTRAINT custom_entity_records_entity_company_fk
          FOREIGN KEY (company_id, entity_id)
          REFERENCES custom_entities (company_id, id)
          DEFERRABLE INITIALLY DEFERRED
        """,
        "ALTER TABLE custom_entity_records DROP CONSTRAINT IF EXISTS custom_entity_records_entity_company_fk",
    ),
]


def forwards(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    with schema_editor.connection.cursor() as cursor:
        for forward, _reverse in PAIRS:
            cursor.execute(forward)


def backwards(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    with schema_editor.connection.cursor() as cursor:
        for _forward, reverse in reversed(PAIRS):
            cursor.execute(reverse)


class Migration(migrations.Migration):

    dependencies = [
        ("tenants", "0012_tenant_integrity_and_scopes"),
        ("organization", "0007_tenant_integrity_and_scopes"),
        ("hrms", "0003_tenant_integrity_and_scopes"),
        ("authorization", "0009_backfill_record_scopes"),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
