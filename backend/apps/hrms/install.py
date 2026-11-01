from apps.hrms.models import LeavePolicy


def on_install(*, company, user):
    LeavePolicy.objects.get_or_create(
        company=company,
        name="Annual leave",
        defaults={"days_per_year": 12},
    )


def on_uninstall(*, company, user):
    """Retain leave rows; callers only flip installation status to uninstalled."""
    return None
