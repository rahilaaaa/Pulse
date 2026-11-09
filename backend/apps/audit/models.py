import uuid

from django.conf import settings
from django.db import models


class AuditScope(models.TextChoices):
    PLATFORM = "platform", "Platform"
    COMPANY = "company", "Company"


PLATFORM_ACTIONS = {
    "company.suspended",
    "company.reactivated",
    "company.closed",
    "company.activated",
    "company.metadata_updated",
    "company.subscription_changed",
    "company.module_installed",
    "company.module_uninstalled",
    "company.auto_reactivated",
}


class AuditLog(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey(
        "tenants.Company",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="audit_logs",
        db_column="company_id",
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="audit_logs",
        db_column="actor_user_id",
    )
    scope = models.CharField(
        max_length=20,
        choices=AuditScope.choices,
        default=AuditScope.COMPANY,
        db_index=True,
    )
    action = models.CharField(max_length=100)
    object_type = models.CharField(max_length=100)
    object_id = models.UUIDField(null=True, blank=True)
    before = models.JSONField(null=True, blank=True)
    after = models.JSONField(null=True, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    request_id = models.UUIDField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "audit_logs"
        indexes = [
            models.Index(fields=["company", "created_at"], name="audit_logs_company_created_idx"),
            models.Index(fields=["company", "scope", "created_at"], name="audit_comp_scope_created_idx"),
            models.Index(fields=["scope", "created_at"], name="audit_scope_created_idx"),
            models.Index(fields=["object_type", "object_id"], name="audit_logs_object_idx"),
            models.Index(fields=["actor"], name="audit_logs_actor_idx"),
        ]

    def save(self, *args, **kwargs):
        if self.pk and AuditLog.objects.filter(pk=self.pk).exists():
            raise PermissionError("Audit logs are append-only.")
        if not self.company_id or self.action.startswith("platform.") or self.action in PLATFORM_ACTIONS:
            self.scope = AuditScope.PLATFORM
        elif not self.scope:
            self.scope = AuditScope.COMPANY
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise PermissionError("Audit logs are append-only.")
