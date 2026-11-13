
import uuid

from django.conf import settings
from django.db import models


class Invitation(models.Model):

    class Role(models.TextChoices):
        ADMIN = "admin", "Admin"
        MEMBER = "member", "Member"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        ACCEPTED = "accepted", "Accepted"
        EXPIRED = "expired", "Expired"
        REVOKED = "revoked", "Revoked"

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )

    company = models.ForeignKey(
        "companies.Company",
        on_delete=models.CASCADE,
        related_name="invitations",
    )

    email = models.EmailField()

    role = models.CharField(
        max_length=20,
        choices=Role.choices,
        default=Role.MEMBER,
    )

    token_hash = models.CharField(
        max_length=64,
        unique=True,
    )

    invited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="sent_invitations",
    )

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
        db_index=True,
    )

    expires_at = models.DateTimeField()

    accepted_at = models.DateTimeField(
        null=True,
        blank=True,
    )

    revoked_at = models.DateTimeField(
        null=True,
        blank=True,
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    last_sent_at = models.DateTimeField(null=True, blank=True)

    resend_count = models.PositiveSmallIntegerField(default=0)

    class Meta:
        db_table = "invitations"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["company", "email"],
                condition=models.Q(status="pending"),
                name="unique_pending_company_invitation",
            ),
        ]
        indexes = [
            models.Index(
                fields=["company", "status"],
                name="inv_company_status_idx",
            ),
            models.Index(
                fields=["email", "status"],
                name="inv_email_status_idx",
            ),
        ]

    def __str__(self):
        return f"{self.email} - {self.company.name}"




class InvitationResendAttempt(models.Model):
    invitation = models.ForeignKey(
        Invitation,
        on_delete=models.CASCADE,
        related_name="resend_attempts",
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "invitation_resend_attempts"
        ordering = ["-created_at"]
        indexes = [
            models.Index(
                fields=["invitation", "created_at"],
                name="inv_resend_time_idx",
            ),
        ]

    def __str__(self):
        return f"Resend attempt for {self.invitation.email}"
