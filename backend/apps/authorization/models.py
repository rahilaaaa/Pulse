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
