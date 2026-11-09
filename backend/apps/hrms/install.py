from apps.hrms.models import HrmsActivation, LeavePolicy, Employment, EmploymentStatus
from common.api.errors import conflict


def on_install(*, company, user):
    LeavePolicy.objects.get_or_create(
        company=company,
        name="Annual leave",
        defaults={"days_per_year": 12},
    )
    HrmsActivation.objects.get_or_create(company=company)


def on_uninstall(*, company, user):
    # active_employees_count = Employment.objects.filter(company=company, status__in=[EmploymentStatus.ACTIVE, EmploymentStatus.ON_LEAVE]).count()
    # if active_employees_count > 0:
    #     raise conflict(f"cannot disable HRMS this company has  {active_employees_count}")
    # 
    return None
