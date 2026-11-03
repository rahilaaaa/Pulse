from django.conf import settings
from django.db import models


class PlatformSetting(models.Model):
    key = models.CharField(max_length=64, primary_key=True)
    value = models.JSONField(default=dict)
    description = models.CharField(max_length=255, blank=True, default="")
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="platform_settings_updated",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "platform_settings"
        ordering = ["key"]

    def __str__(self) -> str:
        return self.key

