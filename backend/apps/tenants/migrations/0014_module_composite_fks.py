"""Composite tenant FKs for Party, Projects, CRM, and Commerce (ADR-021). PostgreSQL only."""

from django.db import migrations

PAIRS = [
    (
        """
        ALTER TABLE projects
          ADD CONSTRAINT projects_owner_person_company_fk
          FOREIGN KEY (company_id, owner_person_id)
          REFERENCES people (company_id, id)
          DEFERRABLE INITIALLY DEFERRED
        """,
        "ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_owner_person_company_fk",
    ),
    (
        """
        ALTER TABLE project_tasks
          ADD CONSTRAINT project_tasks_project_company_fk
          FOREIGN KEY (company_id, project_id)
          REFERENCES projects (company_id, id)
          DEFERRABLE INITIALLY DEFERRED
        """,
        "ALTER TABLE project_tasks DROP CONSTRAINT IF EXISTS project_tasks_project_company_fk",
    ),
    (
        """
        ALTER TABLE project_tasks
          ADD CONSTRAINT project_tasks_assignee_company_fk
          FOREIGN KEY (company_id, assignee_id)
          REFERENCES people (company_id, id)
          DEFERRABLE INITIALLY DEFERRED
        """,
        "ALTER TABLE project_tasks DROP CONSTRAINT IF EXISTS project_tasks_assignee_company_fk",
    ),
    (
        """
        ALTER TABLE crm_accounts
          ADD CONSTRAINT crm_accounts_party_company_fk
          FOREIGN KEY (company_id, party_id)
          REFERENCES parties (company_id, id)
          DEFERRABLE INITIALLY DEFERRED
        """,
        "ALTER TABLE crm_accounts DROP CONSTRAINT IF EXISTS crm_accounts_party_company_fk",
    ),
    (
        """
        ALTER TABLE crm_contacts
          ADD CONSTRAINT crm_contacts_party_company_fk
          FOREIGN KEY (company_id, party_id)
          REFERENCES parties (company_id, id)
          DEFERRABLE INITIALLY DEFERRED
        """,
        "ALTER TABLE crm_contacts DROP CONSTRAINT IF EXISTS crm_contacts_party_company_fk",
    ),
    (
        """
        ALTER TABLE crm_contacts
          ADD CONSTRAINT crm_contacts_account_company_fk
          FOREIGN KEY (company_id, account_id)
          REFERENCES crm_accounts (company_id, id)
          DEFERRABLE INITIALLY DEFERRED
        """,
        "ALTER TABLE crm_contacts DROP CONSTRAINT IF EXISTS crm_contacts_account_company_fk",
    ),
    (
        """
        ALTER TABLE crm_leads
          ADD CONSTRAINT crm_leads_party_company_fk
          FOREIGN KEY (company_id, party_id)
          REFERENCES parties (company_id, id)
          DEFERRABLE INITIALLY DEFERRED
        """,
        "ALTER TABLE crm_leads DROP CONSTRAINT IF EXISTS crm_leads_party_company_fk",
    ),
    (
        """
        ALTER TABLE crm_opportunities
          ADD CONSTRAINT crm_opportunities_account_company_fk
          FOREIGN KEY (company_id, account_id)
          REFERENCES crm_accounts (company_id, id)
          DEFERRABLE INITIALLY DEFERRED
        """,
        "ALTER TABLE crm_opportunities DROP CONSTRAINT IF EXISTS crm_opportunities_account_company_fk",
    ),
    (
        """
        ALTER TABLE commerce_orders
          ADD CONSTRAINT commerce_orders_party_company_fk
          FOREIGN KEY (company_id, party_id)
          REFERENCES parties (company_id, id)
          DEFERRABLE INITIALLY DEFERRED
        """,
        "ALTER TABLE commerce_orders DROP CONSTRAINT IF EXISTS commerce_orders_party_company_fk",
    ),
    (
        """
        ALTER TABLE commerce_order_lines
          ADD CONSTRAINT commerce_order_lines_order_company_fk
          FOREIGN KEY (company_id, order_id)
          REFERENCES commerce_orders (company_id, id)
          DEFERRABLE INITIALLY DEFERRED
        """,
        "ALTER TABLE commerce_order_lines DROP CONSTRAINT IF EXISTS commerce_order_lines_order_company_fk",
    ),
    (
        """
        ALTER TABLE commerce_order_lines
          ADD CONSTRAINT commerce_order_lines_product_company_fk
          FOREIGN KEY (company_id, product_id)
          REFERENCES commerce_products (company_id, id)
          DEFERRABLE INITIALLY DEFERRED
        """,
        "ALTER TABLE commerce_order_lines DROP CONSTRAINT IF EXISTS commerce_order_lines_product_company_fk",
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
        ("tenants", "0013_composite_tenant_fks"),
        ("parties", "0001_initial"),
        ("projects", "0001_initial"),
        ("crm", "0002_initial"),
        ("commerce", "0002_initial"),
        ("organization", "0007_tenant_integrity_and_scopes"),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
