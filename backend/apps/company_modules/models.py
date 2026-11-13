
from django.conf import settings
from django.db import models
from django.utils import timezone


class CompanyModule(models.Model):

    class Status(models.TextChoices):
        INSTALLED = "installed", "Installed"
        UNINSTALLED = "uninstalled", "Uninstalled"

    company = models.ForeignKey(
        "companies.Company",
        on_delete=models.CASCADE,
        related_name="installed_modules",
    )

    # Must match the plugin manifest key.
    # Examples: hrms, project_management
    module_key = models.CharField(max_length=100)

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.INSTALLED,
        db_index=True,
    )

    installed_at = models.DateTimeField(
        default=timezone.now,
    )

    uninstalled_at = models.DateTimeField(
        null=True,
        blank=True,
    )

    installed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="installed_company_modules",
    )

    created_at = models.DateTimeField(auto_now_add=True)

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "company_modules"
        ordering = ["module_key"]

        constraints = [
            models.UniqueConstraint(
                fields=["company", "module_key"],
                name="unique_company_module",
            ),
        ]

        indexes = [
            models.Index(
                fields=["company", "status"],
                name="company_module_status_idx",
            ),
        ]

    def __str__(self):
        return (
            f"{self.company.name} - "
            f"{self.module_key} ({self.status})"
        )
