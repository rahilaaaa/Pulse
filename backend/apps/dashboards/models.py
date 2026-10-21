import uuid

from django.db import models


class VersionStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    PUBLISHED = "published", "Published"
    SUPERSEDED = "superseded", "Superseded"


class WidgetDefinition(models.Model):
    code = models.SlugField(primary_key=True, max_length=64)
    title = models.CharField(max_length=150)
    description = models.TextField(blank=True, default="")
    module_slug = models.CharField(max_length=64, blank=True, default="")
    required_permission = models.CharField(max_length=100)

    class Meta:
        db_table = "widget_definitions"


class Dashboard(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="dashboards")
    name = models.CharField(max_length=150)
    published_version = models.ForeignKey(
        "DashboardVersion",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "dashboards"


class DashboardVersion(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    dashboard = models.ForeignKey(Dashboard, on_delete=models.CASCADE, related_name="versions")
    status = models.CharField(max_length=32, choices=VersionStatus.choices, default=VersionStatus.DRAFT)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "dashboard_versions"


class DashboardWidget(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    version = models.ForeignKey(DashboardVersion, on_delete=models.CASCADE, related_name="widgets")
    widget = models.ForeignKey(WidgetDefinition, on_delete=models.PROTECT, db_column="widget_code")
    position = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "dashboard_widgets"
        ordering = ["position", "id"]
        constraints = [
            models.UniqueConstraint(fields=["version", "widget"], name="dashboard_widgets_version_widget_unique"),
        ]


class DashboardAssignment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="dashboard_assignments")
    dashboard = models.ForeignKey(Dashboard, on_delete=models.CASCADE, related_name="assignments")
    role = models.ForeignKey("authorization.CompanyRole", null=True, blank=True, on_delete=models.CASCADE, related_name="dashboard_assignments")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "dashboard_assignments"
        constraints = [
            models.UniqueConstraint(fields=["role"], condition=models.Q(role__isnull=False), name="dashboard_assignments_role_unique"),
        ]
