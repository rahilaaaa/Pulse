"""Enforce same-company Person links on membership invitations."""

from django.db import migrations


FORWARD = """
ALTER TABLE membership_invitations
  ADD CONSTRAINT membership_invitation_person_company_fk
  FOREIGN KEY (company_id, person_id)
  REFERENCES people (company_id, id)
  DEFERRABLE INITIALLY DEFERRED
"""
REVERSE = "ALTER TABLE membership_invitations DROP CONSTRAINT IF EXISTS membership_invitation_person_company_fk"


def forwards(apps, schema_editor):
    if schema_editor.connection.vendor == "postgresql":
        with schema_editor.connection.cursor() as cursor:
            cursor.execute(FORWARD)


def backwards(apps, schema_editor):
    if schema_editor.connection.vendor == "postgresql":
        with schema_editor.connection.cursor() as cursor:
            cursor.execute(REVERSE)


class Migration(migrations.Migration):
    dependencies = [
        ("tenants", "0016_membershipinvitation_person"),
        ("organization", "0007_tenant_integrity_and_scopes"),
    ]

    operations = [migrations.RunPython(forwards, backwards)]
