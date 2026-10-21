from django.db import migrations

WIDGETS = [
    ("company.summary", "Company summary", "Company name, status, and plan.", "", "company.view"),
    ("membership.counts", "User statistics", "Active, invited, and suspended memberships.", "", "membership.view"),
    ("invitations.pending", "Pending invitations", "Invitations that have not been accepted.", "", "membership.view"),
    ("modules.installed", "Installed modules", "Modules with an installed record.", "", "modules.view"),
    ("billing.subscription", "Subscription", "Current plan and trial status.", "", "billing.view"),
    ("audit.recent", "Recent activity", "Latest company audit events.", "", "audit.view"),
    ("hrms.leave.pending", "HRMS leave", "Pending leave requests.", "hrms", "hrms.leave.view"),
]


def seed(apps, schema_editor):
    WidgetDefinition = apps.get_model("dashboards", "WidgetDefinition")
    for code, title, description, module_slug, permission in WIDGETS:
        WidgetDefinition.objects.update_or_create(
            code=code,
            defaults={
                "title": title,
                "description": description,
                "module_slug": module_slug,
                "required_permission": permission,
            },
        )


def unseed(apps, schema_editor):
    WidgetDefinition = apps.get_model("dashboards", "WidgetDefinition")
    WidgetDefinition.objects.filter(code__in=[item[0] for item in WIDGETS]).delete()


class Migration(migrations.Migration):
    dependencies = [("dashboards", "0001_initial")]
    operations = [migrations.RunPython(seed, unseed)]
