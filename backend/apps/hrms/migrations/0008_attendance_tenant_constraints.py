"""Composite tenant FKs for attendance records and assignments."""

from django.db import migrations

PAIRS = [
    (
        "ALTER TABLE hrms_attendance_events ADD CONSTRAINT hrms_att_event_employment_company_fk "
        "FOREIGN KEY (company_id, employment_id) REFERENCES hrms_employments (company_id, id) "
        "DEFERRABLE INITIALLY DEFERRED",
        "ALTER TABLE hrms_attendance_events DROP CONSTRAINT IF EXISTS hrms_att_event_employment_company_fk",
    ),
    (
        "ALTER TABLE hrms_attendance_sessions ADD CONSTRAINT hrms_att_session_employment_company_fk "
        "FOREIGN KEY (company_id, employment_id) REFERENCES hrms_employments (company_id, id) "
        "DEFERRABLE INITIALLY DEFERRED",
        "ALTER TABLE hrms_attendance_sessions DROP CONSTRAINT IF EXISTS hrms_att_session_employment_company_fk",
    ),
    (
        "ALTER TABLE hrms_attendance_sessions ADD CONSTRAINT hrms_att_session_shift_company_fk "
        "FOREIGN KEY (company_id, shift_id) REFERENCES hrms_shifts (company_id, id) "
        "DEFERRABLE INITIALLY DEFERRED",
        "ALTER TABLE hrms_attendance_sessions DROP CONSTRAINT IF EXISTS hrms_att_session_shift_company_fk",
    ),
    (
        "ALTER TABLE hrms_attendance_sessions ADD CONSTRAINT hrms_att_session_checkin_company_fk "
        "FOREIGN KEY (company_id, check_in_event_id) REFERENCES hrms_attendance_events (company_id, id) "
        "DEFERRABLE INITIALLY DEFERRED",
        "ALTER TABLE hrms_attendance_sessions DROP CONSTRAINT IF EXISTS hrms_att_session_checkin_company_fk",
    ),
    (
        "ALTER TABLE hrms_attendance_sessions ADD CONSTRAINT hrms_att_session_checkout_company_fk "
        "FOREIGN KEY (company_id, check_out_event_id) REFERENCES hrms_attendance_events (company_id, id) "
        "DEFERRABLE INITIALLY DEFERRED",
        "ALTER TABLE hrms_attendance_sessions DROP CONSTRAINT IF EXISTS hrms_att_session_checkout_company_fk",
    ),
    (
        "ALTER TABLE hrms_attendance_daily_summaries ADD CONSTRAINT hrms_att_daily_employment_company_fk "
        "FOREIGN KEY (company_id, employment_id) REFERENCES hrms_employments (company_id, id) "
        "DEFERRABLE INITIALLY DEFERRED",
        "ALTER TABLE hrms_attendance_daily_summaries DROP CONSTRAINT IF EXISTS hrms_att_daily_employment_company_fk",
    ),
    (
        "ALTER TABLE hrms_attendance_exceptions ADD CONSTRAINT hrms_att_exception_employment_company_fk "
        "FOREIGN KEY (company_id, employment_id) REFERENCES hrms_employments (company_id, id) "
        "DEFERRABLE INITIALLY DEFERRED",
        "ALTER TABLE hrms_attendance_exceptions DROP CONSTRAINT IF EXISTS hrms_att_exception_employment_company_fk",
    ),
    (
        "ALTER TABLE hrms_attendance_exceptions ADD CONSTRAINT hrms_att_exception_event_company_fk "
        "FOREIGN KEY (company_id, event_id) REFERENCES hrms_attendance_events (company_id, id) "
        "DEFERRABLE INITIALLY DEFERRED",
        "ALTER TABLE hrms_attendance_exceptions DROP CONSTRAINT IF EXISTS hrms_att_exception_event_company_fk",
    ),
    (
        "ALTER TABLE hrms_attendance_exceptions ADD CONSTRAINT hrms_att_exception_session_company_fk "
        "FOREIGN KEY (company_id, session_id) REFERENCES hrms_attendance_sessions (company_id, id) "
        "DEFERRABLE INITIALLY DEFERRED",
        "ALTER TABLE hrms_attendance_exceptions DROP CONSTRAINT IF EXISTS hrms_att_exception_session_company_fk",
    ),
    (
        "ALTER TABLE hrms_attendance_correction_requests ADD CONSTRAINT hrms_att_correction_employment_company_fk "
        "FOREIGN KEY (company_id, employment_id) REFERENCES hrms_employments (company_id, id) "
        "DEFERRABLE INITIALLY DEFERRED",
        "ALTER TABLE hrms_attendance_correction_requests DROP CONSTRAINT IF EXISTS hrms_att_correction_employment_company_fk",
    ),
    (
        "ALTER TABLE hrms_attendance_correction_requests ADD CONSTRAINT hrms_att_correction_session_company_fk "
        "FOREIGN KEY (company_id, session_id) REFERENCES hrms_attendance_sessions (company_id, id) "
        "DEFERRABLE INITIALLY DEFERRED",
        "ALTER TABLE hrms_attendance_correction_requests DROP CONSTRAINT IF EXISTS hrms_att_correction_session_company_fk",
    ),
    (
        "ALTER TABLE hrms_attendance_policy_assignments ADD CONSTRAINT hrms_att_policy_policy_company_fk "
        "FOREIGN KEY (company_id, policy_id) REFERENCES hrms_attendance_policies (company_id, id) "
        "DEFERRABLE INITIALLY DEFERRED",
        "ALTER TABLE hrms_attendance_policy_assignments DROP CONSTRAINT IF EXISTS hrms_att_policy_policy_company_fk",
    ),
    (
        "ALTER TABLE hrms_attendance_policy_assignments ADD CONSTRAINT hrms_att_policy_location_company_fk "
        "FOREIGN KEY (company_id, work_location_id) REFERENCES hrms_work_locations (company_id, id) "
        "DEFERRABLE INITIALLY DEFERRED",
        "ALTER TABLE hrms_attendance_policy_assignments DROP CONSTRAINT IF EXISTS hrms_att_policy_location_company_fk",
    ),
    (
        "ALTER TABLE hrms_attendance_policy_assignments ADD CONSTRAINT hrms_att_policy_shift_company_fk "
        "FOREIGN KEY (company_id, shift_id) REFERENCES hrms_shifts (company_id, id) "
        "DEFERRABLE INITIALLY DEFERRED",
        "ALTER TABLE hrms_attendance_policy_assignments DROP CONSTRAINT IF EXISTS hrms_att_policy_shift_company_fk",
    ),
    (
        "ALTER TABLE hrms_attendance_policy_assignments ADD CONSTRAINT hrms_att_policy_employment_company_fk "
        "FOREIGN KEY (company_id, employment_id) REFERENCES hrms_employments (company_id, id) "
        "DEFERRABLE INITIALLY DEFERRED",
        "ALTER TABLE hrms_attendance_policy_assignments DROP CONSTRAINT IF EXISTS hrms_att_policy_employment_company_fk",
    ),
    (
        "ALTER TABLE hrms_company_holidays ADD CONSTRAINT hrms_holiday_location_company_fk "
        "FOREIGN KEY (company_id, work_location_id) REFERENCES hrms_work_locations (company_id, id) "
        "DEFERRABLE INITIALLY DEFERRED",
        "ALTER TABLE hrms_company_holidays DROP CONSTRAINT IF EXISTS hrms_holiday_location_company_fk",
    ),
    (
        "ALTER TABLE hrms_employment_schedule_assignments ADD CONSTRAINT hrms_schedule_employment_company_fk "
        "FOREIGN KEY (company_id, employment_id) REFERENCES hrms_employments (company_id, id) "
        "DEFERRABLE INITIALLY DEFERRED",
        "ALTER TABLE hrms_employment_schedule_assignments DROP CONSTRAINT IF EXISTS hrms_schedule_employment_company_fk",
    ),
    (
        "ALTER TABLE hrms_employment_schedule_assignments ADD CONSTRAINT hrms_schedule_shift_company_fk "
        "FOREIGN KEY (company_id, shift_id) REFERENCES hrms_shifts (company_id, id) "
        "DEFERRABLE INITIALLY DEFERRED",
        "ALTER TABLE hrms_employment_schedule_assignments DROP CONSTRAINT IF EXISTS hrms_schedule_shift_company_fk",
    ),
    (
        "ALTER TABLE hrms_employment_schedule_assignments ADD CONSTRAINT hrms_schedule_schedule_company_fk "
        "FOREIGN KEY (company_id, schedule_id) REFERENCES hrms_work_schedules (company_id, id) "
        "DEFERRABLE INITIALLY DEFERRED",
        "ALTER TABLE hrms_employment_schedule_assignments DROP CONSTRAINT IF EXISTS hrms_schedule_schedule_company_fk",
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
        ("hrms", "0007_attendanceevent_hrms_att_events_company_id_id_unique_and_more"),
    ]

    operations = [migrations.RunPython(forwards, backwards)]
