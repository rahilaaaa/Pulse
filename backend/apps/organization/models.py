import uuid

from django.db import models


class PersonStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    INACTIVE = "inactive", "Inactive"


class UnitStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    INACTIVE = "inactive", "Inactive"


class OrganizationUnitType(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="unit_types")
    key = models.SlugField(max_length=64)
    singular_label = models.CharField(max_length=150)
    plural_label = models.CharField(max_length=150)
    icon = models.CharField(max_length=64, blank=True, default="")
    description = models.TextField(blank=True, default="")
    is_active = models.BooleanField(default=True)
    position = models.PositiveIntegerField(default=0)
    allowed_parent_keys = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "organization_unit_types"
        ordering = ["position", "singular_label"]
        constraints = [
            models.UniqueConstraint(fields=["company", "key"], name="org_unit_types_company_key_unique"),
        ]


class Department(models.Model):
    """Company organization unit. The parent link is the only hierarchy."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="departments")
    name = models.CharField(max_length=150)
    key = models.SlugField(max_length=64, null=True, blank=True)
    unit_type = models.ForeignKey(
        OrganizationUnitType,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="units",
    )
    parent = models.ForeignKey("self", null=True, blank=True, on_delete=models.PROTECT, related_name="children")
    description = models.TextField(blank=True, default="")
    manager = models.ForeignKey(
        "Person",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="managed_units",
    )
    status = models.CharField(max_length=32, choices=UnitStatus.choices, default=UnitStatus.ACTIVE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "departments"
        constraints = [
            models.UniqueConstraint(fields=["company", "name"], name="departments_company_name_unique"),
            models.UniqueConstraint(
                fields=["company", "key"],
                condition=models.Q(key__isnull=False),
                name="departments_company_key_unique",
            ),
            models.CheckConstraint(
                condition=models.Q(status__in=[choice.value for choice in UnitStatus]),
                name="departments_status_valid",
            ),
        ]


class Person(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="people")
    department = models.ForeignKey(Department, null=True, blank=True, on_delete=models.PROTECT, related_name="people")
    first_name = models.CharField(max_length=150, blank=True, default="")
    last_name = models.CharField(max_length=150, blank=True, default="")
    work_email = models.EmailField(blank=True, default="")
    job_title = models.CharField(max_length=150, blank=True, default="")
    status = models.CharField(max_length=32, choices=PersonStatus.choices, default=PersonStatus.ACTIVE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "people"
        indexes = [
            models.Index(fields=["company", "status"], name="people_company_status_idx"),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(status__in=[choice.value for choice in PersonStatus]),
                name="people_status_valid",
            )
        ]
