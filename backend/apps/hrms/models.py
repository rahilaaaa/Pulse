import uuid

from django.db import models


class LeaveRequestStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    APPROVED = "approved", "Approved"
    REJECTED = "rejected", "Rejected"


class LeavePolicy(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="leave_policies")
    name = models.CharField(max_length=150)
    days_per_year = models.PositiveIntegerField(default=12)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "hrms_leave_policies"
        constraints = [
            models.UniqueConstraint(fields=["company", "name"], name="hrms_leave_policies_company_name_unique"),
            models.UniqueConstraint(fields=["company", "id"], name="hrms_leave_policies_company_id_id_unique"),
        ]


class LeaveRequest(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="leave_requests")
    person = models.ForeignKey("organization.Person", on_delete=models.PROTECT, related_name="leave_requests")
    policy = models.ForeignKey(LeavePolicy, on_delete=models.PROTECT, related_name="requests")
    status = models.CharField(max_length=32, choices=LeaveRequestStatus.choices, default=LeaveRequestStatus.PENDING)
    starts_on = models.DateField()
    ends_on = models.DateField()
    reason = models.CharField(max_length=500, blank=True, default="")
    decided_by = models.ForeignKey(
        "identity.User",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="leave_decisions",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "hrms_leave_requests"
        constraints = [
            models.CheckConstraint(condition=models.Q(ends_on__gte=models.F("starts_on")), name="hrms_leave_requests_dates_ok"),
            models.CheckConstraint(
                condition=models.Q(status__in=[choice.value for choice in LeaveRequestStatus]),
                name="hrms_leave_requests_status_valid",
            ),
        ]


class LeaveBalance(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="leave_balances")
    person = models.ForeignKey("organization.Person", on_delete=models.CASCADE, related_name="leave_balances")
    policy = models.ForeignKey(LeavePolicy, on_delete=models.CASCADE, related_name="balances")
    year = models.PositiveIntegerField()
    allocated_days = models.PositiveIntegerField(default=0)
    used_days = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "hrms_leave_balances"
        constraints = [
            models.UniqueConstraint(
                fields=["company", "person", "policy", "year"],
                name="hrms_leave_balances_person_policy_year_unique",
            ),
            models.UniqueConstraint(fields=["company", "id"], name="hrms_leave_balances_company_id_id_unique"),
        ]
