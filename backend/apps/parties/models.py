import uuid

from django.db import models


class PartyKind(models.TextChoices):
    PERSON = "person", "Person"
    ORGANIZATION = "organization", "Organization"


class PartyStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    INACTIVE = "inactive", "Inactive"


class Party(models.Model):
    """External business partner shared by CRM, Commerce, and Procurement (ADR-020)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="parties")
    kind = models.CharField(max_length=32, choices=PartyKind.choices, default=PartyKind.ORGANIZATION)
    display_name = models.CharField(max_length=255)
    email = models.EmailField(blank=True, default="")
    phone = models.CharField(max_length=64, blank=True, default="")
    status = models.CharField(max_length=32, choices=PartyStatus.choices, default=PartyStatus.ACTIVE)
    custom_data = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "parties"
        ordering = ["display_name"]
        constraints = [
            models.UniqueConstraint(fields=["company", "id"], name="parties_company_id_id_unique"),
            models.CheckConstraint(
                condition=models.Q(kind__in=[choice.value for choice in PartyKind]),
                name="parties_kind_valid",
            ),
            models.CheckConstraint(
                condition=models.Q(status__in=[choice.value for choice in PartyStatus]),
                name="parties_status_valid",
            ),
        ]
