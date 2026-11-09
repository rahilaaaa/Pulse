import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models


class PermissionScope(models.TextChoices):
    COMPANY = "company", "Company"
    PLATFORM = "platform", "Platform"


class Permission(models.Model):
    code = models.CharField(primary_key=True, max_length=100)
    description = models.TextField()
    scope = models.CharField(max_length=32, choices=PermissionScope.choices)
    module_slug = models.CharField(max_length=64, null=True, blank=True)

    class Meta:
        db_table = "permissions"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(scope__in=[choice.value for choice in PermissionScope]),
                name="permissions_scope_valid",
            )
        ]

    def __str__(self) -> str:
        return self.code


class PlatformPermissionGrant(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="platform_grants",
    )
    permission = models.ForeignKey(
        Permission,
        on_delete=models.PROTECT,
        db_column="permission_code",
        related_name="platform_grants",
    )
    granted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="platform_grants_issued",
        db_column="granted_by_user_id",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "platform_permission_grants"
        constraints = [
            models.UniqueConstraint(
                fields=["user", "permission"],
                name="platform_permission_grants_user_permission_unique",
            )
        ]

    def save(self, *args, **kwargs):
        if self.permission.scope != PermissionScope.PLATFORM:
            raise ValidationError("Platform grants can only reference platform permissions.")
        super().save(*args, **kwargs)


class RoleTemplate(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.SlugField(max_length=64, unique=True)
    name = models.CharField(max_length=150)
    description = models.TextField(blank=True, default="")
    is_system = models.BooleanField(default=True)
    is_owner_role = models.BooleanField(default=False)

    class Meta:
        db_table = "role_templates"


class RoleTemplatePermission(models.Model):
    template = models.ForeignKey(RoleTemplate, on_delete=models.CASCADE, related_name="permissions")
    permission = models.ForeignKey(Permission, on_delete=models.PROTECT, db_column="permission_code", related_name="template_grants")

    class Meta:
        db_table = "role_template_permissions"
        constraints = [
            models.UniqueConstraint(fields=["template", "permission"], name="role_template_permissions_unique"),
        ]


class CompanyRole(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="roles")
    template_code = models.SlugField(max_length=64, blank=True, default="")
    name = models.CharField(max_length=150)
    description = models.TextField(blank=True, default="")
    is_owner_role = models.BooleanField(default=False)
    is_system = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    archived_at = models.DateTimeField(null=True, blank=True)
    record_scopes = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "company_roles"
        constraints = [
            models.UniqueConstraint(fields=["company", "name"], name="company_roles_company_name_unique"),
            models.UniqueConstraint(fields=["company", "id"], name="company_roles_company_id_id_unique"),
        ]


class CompanyRolePermission(models.Model):
    role = models.ForeignKey(CompanyRole, on_delete=models.CASCADE, related_name="permissions")
    permission = models.ForeignKey(Permission, on_delete=models.PROTECT, db_column="permission_code", related_name="company_role_grants")

    class Meta:
        db_table = "company_role_permissions"
        constraints = [
            models.UniqueConstraint(fields=["role", "permission"], name="company_role_permissions_unique"),
        ]


class MembershipRoleAssignment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    membership = models.ForeignKey("tenants.CompanyMembership", on_delete=models.CASCADE, related_name="role_assignments")
    role = models.ForeignKey(CompanyRole, on_delete=models.PROTECT, related_name="assignments")
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="role_assignments_made",
        db_column="assigned_by_user_id",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "membership_role_assignments"
        constraints = [
            models.UniqueConstraint(fields=["membership", "role"], name="membership_role_assignments_unique"),
        ]


class CompanyRoleNavigation(models.Model):
    role = models.ForeignKey(CompanyRole, on_delete=models.CASCADE, related_name="navigation_items")
    code = models.SlugField(max_length=64)
    position = models.PositiveIntegerField(default=0)
    enabled = models.BooleanField(default=True)

    class Meta:
        db_table = "company_role_navigation"
        constraints = [
            models.UniqueConstraint(fields=["role", "code"], name="company_role_navigation_unique"),
        ]
        ordering = ["position", "code"]


class PlatformRole(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=150, unique=True)
    slug = models.SlugField(max_length=64, unique=True)
    description = models.TextField(blank=True, default="")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="platform_roles_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "platform_roles"
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class PlatformRolePermission(models.Model):
    role = models.ForeignKey(PlatformRole, on_delete=models.CASCADE, related_name="role_permissions")
    permission = models.ForeignKey(
        Permission,
        on_delete=models.PROTECT,
        db_column="permission_code",
        related_name="platform_role_grants",
    )

    class Meta:
        db_table = "platform_role_permissions"
        constraints = [
            models.UniqueConstraint(fields=["role", "permission"], name="platform_role_permissions_unique"),
        ]

    def save(self, *args, **kwargs):
        if self.permission.scope != PermissionScope.PLATFORM:
            raise ValidationError("Platform role permissions can only reference platform permissions.")
        super().save(*args, **kwargs)


class PlatformSuperAdmin(models.Model):
    """Guarantees exactly ONE Super Admin in the entire Pulse platform."""

    id = models.IntegerField(primary_key=True, default=1, editable=False)
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="super_admin_record",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "platform_super_admin"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(id=1),
                name="single_super_admin_id_must_be_one",
            )
        ]

    def __str__(self) -> str:
        return f"Super Admin: {self.user.email}"


class OperatorStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    SUSPENDED = "suspended", "Suspended"
    DEACTIVATED = "deactivated", "Deactivated"


class PlatformOperatorProfile(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="platform_profile",
    )
    role = models.ForeignKey(
        PlatformRole,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="operators",
    )
    is_super_admin = models.BooleanField(default=False)
    status = models.CharField(max_length=32, choices=OperatorStatus.choices, default=OperatorStatus.ACTIVE)
    status_reason = models.TextField(blank=True, default="")
    session_version = models.PositiveIntegerField(default=1)
    custom_permissions = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "platform_operator_profiles"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.user.email} ({self.status})"


class PlatformInvitationStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    ACCEPTED = "accepted", "Accepted"
    REVOKED = "revoked", "Revoked"
    EXPIRED = "expired", "Expired"


class PlatformInvitation(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField()
    first_name = models.CharField(max_length=150, blank=True, default="")
    last_name = models.CharField(max_length=150, blank=True, default="")
    role = models.ForeignKey(
        PlatformRole,
        on_delete=models.PROTECT,
        related_name="invitations",
    )
    custom_permissions = models.JSONField(default=list, blank=True)
    status = models.CharField(
        max_length=32,
        choices=PlatformInvitationStatus.choices,
        default=PlatformInvitationStatus.PENDING,
    )
    token_hash = models.CharField(max_length=64, unique=True)
    invited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="platform_invitations_sent",
    )
    accepted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="platform_invitations_accepted",
    )
    accepted_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "platform_invitations"
        indexes = [
            models.Index(fields=["email", "status"], name="plat_inv_email_status_idx"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["email"],
                condition=models.Q(status="pending"),
                name="platform_invitations_pending_email_unique",
            ),
        ]

    def __str__(self) -> str:
        return f"Invite for {self.email} ({self.status})"

