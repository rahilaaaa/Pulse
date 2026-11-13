
from django.conf import settings
from django.db import models


class CompanyMembership(models.Model):

    class Role(models.TextChoices):
        OWNER = "owner", "Owner"
        ADMIN = "admin", "Admin"
        MEMBER = "member", "Member"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        ACTIVE = "active", "Active"
        SUSPENDED = "suspended", "Suspended"
        REMOVED = "removed", "Removed"
        
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="company_memberships",
    )

    company = models.ForeignKey(
        "companies.Company",
        on_delete=models.CASCADE,
        related_name="memberships",
    )

    role = models.CharField(
        max_length=20,
        choices=Role.choices,
        default=Role.MEMBER,
    )

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.ACTIVE,
        db_index=True,
    )

    joined_at = models.DateTimeField(null=True,blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "company_memberships"
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "company"],
                name="unique_user_company_membership",
            ),
        ]

    def __str__(self):
        return f"{self.user.email} - {self.company.name}"
