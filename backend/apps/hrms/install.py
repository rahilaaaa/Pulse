from apps.hrms.models import LeavePolicy


def on_install(*, company, user):
    LeavePolicy.objects.get_or_create(
        company=company,
        name="Annual leave",
        defaults={"days_per_year": 12},
    )
