import uuid

from django.conf import settings
from django.db import models


class InstallationStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    INSTALLING = "installing", "Installing"
    INSTALLED = "installed", "Installed"
    FAILED = "failed", "Failed"
    UPGRADING = "upgrading", "Upgrading"
    UNINSTALLING = "uninstalling", "Uninstalling"
    UNINSTALLED = "uninstalled", "Uninstalled"


class ModuleDefinition(models.Model):
    slug = models.SlugField(primary_key=True, max_length=64)
    display_name = models.CharField(max_length=150)
    description = models.TextField(blank=True, default="")
    version = models.CharField(max_length=32)
    django_app_label = models.CharField(max_length=64, blank=True, default="")
    min_platform_version = models.CharField(max_length=32, default="0.1.0")
    is_core = models.BooleanField(default=False)
    is_public = models.BooleanField(default=True)
    installation_available = models.BooleanField(default=False)
    config_schema = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "module_definitions"

    def __str__(self) -> str:
        return self.slug


class ModuleDependency(models.Model):
    module = models.ForeignKey(ModuleDefinition, on_delete=models.CASCADE, related_name="dependencies", db_column="module_slug")
    depends_on = models.ForeignKey(
        ModuleDefinition,
        on_delete=models.PROTECT,
        related_name="required_by",
        db_column="depends_on_slug",
    )

    class Meta:
        db_table = "module_dependencies"
        constraints = [
            models.UniqueConstraint(fields=["module", "depends_on"], name="module_dependencies_pair_unique"),
            models.CheckConstraint(condition=~models.Q(module=models.F("depends_on")), name="module_dependencies_not_self"),
        ]


class CompanyModuleInstallation(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="module_installations")
    module = models.ForeignKey(ModuleDefinition, on_delete=models.PROTECT, related_name="installations", db_column="module_slug")
    status = models.CharField(max_length=32, choices=InstallationStatus.choices)
    installed_version = models.CharField(max_length=32, blank=True, default="")
    config = models.JSONField(default=dict, blank=True)
    last_error = models.TextField(blank=True, default="")
    installed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="module_installations",
        db_column="installed_by_user_id",
    )
    installed_at = models.DateTimeField(null=True, blank=True)
    uninstalled_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "company_module_installations"
        constraints = [
            models.UniqueConstraint(fields=["company", "module"], name="company_module_install_unique"),
            models.CheckConstraint(
                condition=models.Q(status__in=[choice.value for choice in InstallationStatus]),
                name="company_module_install_status_ok",
            ),
        ]
