from django.db import transaction

from apps.authorization.catalog import COMPANY_PERMISSIONS, NAV_CATALOG, OWNER_FLOOR, ROLE_TEMPLATES
from apps.authorization.models import (
    CompanyRole,
    CompanyRoleNavigation,
    CompanyRolePermission,
    MembershipRoleAssignment,
    Permission,
    PermissionScope,
    RoleTemplate,
    RoleTemplatePermission,
)
from apps.organization.models import Person, PersonStatus
from apps.tenants.models import CompanyMembership, MembershipStatus
from common.api.errors import conflict, not_found, permission_denied


def ensure_company_catalog() -> None:
    for code, description, module_slug in COMPANY_PERMISSIONS:
        Permission.objects.update_or_create(
            code=code,
            defaults={"description": description, "scope": PermissionScope.COMPANY, "module_slug": module_slug},
        )
    all_codes = [code for code, _description, _module in COMPANY_PERMISSIONS]
    for code, name, description, is_owner, limited in ROLE_TEMPLATES:
        template, _created = RoleTemplate.objects.update_or_create(
            code=code,
            defaults={"name": name, "description": description, "is_system": True, "is_owner_role": is_owner},
        )
        wanted = set(all_codes if limited is None else limited)
        RoleTemplatePermission.objects.filter(template=template).exclude(permission_id__in=wanted).delete()
        for permission_code in wanted:
            RoleTemplatePermission.objects.get_or_create(template=template, permission_id=permission_code)


def bootstrap_company_access(company, owner_user) -> None:
    """Clone role templates once and make sure the founder holds the owner role."""
    ensure_company_catalog()
    with transaction.atomic():
        if not CompanyRole.objects.filter(company=company).exists():
            for template in RoleTemplate.objects.prefetch_related("permissions"):
                role = CompanyRole.objects.create(
                    company=company,
                    template_code=template.code,
                    name=template.name,
                    description=template.description,
                    is_owner_role=template.is_owner_role,
                    is_system=True,
                )
                CompanyRolePermission.objects.bulk_create(
                    [
                        CompanyRolePermission(role=role, permission_id=item.permission_id)
                        for item in template.permissions.all()
                    ]
                )
                CompanyRoleNavigation.objects.bulk_create(
                    [
                        CompanyRoleNavigation(role=role, code=code, position=index, enabled=True)
                        for index, (code, _label, _permission, _module) in enumerate(NAV_CATALOG)
                    ]
                )
        membership = CompanyMembership.objects.filter(company=company, user=owner_user, status=MembershipStatus.ACTIVE).first()
        if membership is None:
            return
        owner_role = CompanyRole.objects.filter(company=company, is_owner_role=True).first()
        if owner_role and not MembershipRoleAssignment.objects.filter(membership=membership, role=owner_role).exists():
            MembershipRoleAssignment.objects.create(membership=membership, role=owner_role, assigned_by=owner_user)
        if membership.person_id is None:
            person = Person.objects.create(
                company=company,
                first_name=owner_user.first_name,
                last_name=owner_user.last_name,
                work_email=owner_user.email,
                job_title="Owner",
                status=PersonStatus.ACTIVE,
            )
            membership.person = person
            membership.save(update_fields=["person", "updated_at"])


def effective_permission_codes(membership) -> set[str]:
    return set(
        CompanyRolePermission.objects.filter(role__assignments__membership=membership).values_list("permission_id", flat=True)
    )


def require_membership(user, company_id):
    if not getattr(user, "is_authenticated", False) or not user.is_active:
        raise permission_denied()
    membership = (
        CompanyMembership.objects.select_related("company", "person", "user")
        .filter(company_id=company_id, user=user, status=MembershipStatus.ACTIVE)
        .first()
    )
    if membership is None:
        raise not_found("That company is not available.")
    if membership.company.status in {"suspended", "closed"}:
        raise permission_denied("This company is not available.")
    return membership


def require_permission(user, company_id, code: str):
    membership = require_membership(user, company_id)
    from apps.billing.access import access_mode, current_subscription

    mode = access_mode(membership.company, current_subscription(membership.company))
    billing_codes = {"billing.view", "billing.manage"}
    if mode == "blocked" or (mode not in {"full", "grace"} and code not in billing_codes):
        raise permission_denied("The company subscription does not allow this action.")
    if code not in effective_permission_codes(membership):
        raise permission_denied()
    return membership


def replace_role_permissions(role: CompanyRole, codes: list[str]) -> None:
    cleaned = []
    for code in codes:
        if not isinstance(code, str) or not code.strip():
            continue
        cleaned.append(code.strip())
    permissions = list(Permission.objects.filter(code__in=cleaned))
    found = {item.code for item in permissions}
    unknown = [code for code in cleaned if code not in found]
    if unknown:
        raise conflict("Unknown permission.", [{"field": "permissions", "code": "invalid", "message": ", ".join(unknown)}])
    platform = [item.code for item in permissions if item.scope != PermissionScope.COMPANY]
    if platform:
        raise conflict("Company roles cannot hold platform permissions.", [{"field": "permissions", "code": "invalid", "message": ", ".join(platform)}])
    if role.is_owner_role:
        missing = [code for code in OWNER_FLOOR if code not in found]
        if missing:
            raise conflict("The owner role must keep its required permissions.", [{"field": "permissions", "code": "conflict", "message": ", ".join(missing)}])
    with transaction.atomic():
        CompanyRolePermission.objects.filter(role=role).exclude(permission_id__in=found).delete()
        for code in found:
            CompanyRolePermission.objects.get_or_create(role=role, permission_id=code)


def assert_owner_remains(company, *, membership=None, role=None) -> None:
    owners = MembershipRoleAssignment.objects.filter(
        role__company=company,
        role__is_owner_role=True,
        membership__status=MembershipStatus.ACTIVE,
    )
    if membership is not None:
        owners = owners.exclude(membership=membership)
    if role is not None:
        owners = owners.exclude(role=role)
    if not owners.exists():
        raise conflict("The company must keep one active owner.")


def holds_owner_role(membership) -> bool:
    """True when this active membership is assigned a protected owner role in its company."""
    if membership is None or membership.status != MembershipStatus.ACTIVE:
        return False
    return MembershipRoleAssignment.objects.filter(
        membership=membership,
        role__company_id=membership.company_id,
        role__is_owner_role=True,
    ).exists()


def authorize_owner_role_change(*, actor_membership, target_membership, roles: list[CompanyRole]) -> None:
    """Granting or revoking a protected owner role requires the caller to already hold one."""
    current_owner_ids = set(
        MembershipRoleAssignment.objects.filter(
            membership=target_membership,
            role__company_id=target_membership.company_id,
            role__is_owner_role=True,
        ).values_list("role_id", flat=True)
    )
    next_owner_ids = {role.id for role in roles if role.is_owner_role}
    if current_owner_ids != next_owner_ids and not holds_owner_role(actor_membership):
        raise permission_denied("Only an owner can grant or revoke the owner role.")
    if not next_owner_ids:
        assert_owner_remains(target_membership.company, membership=target_membership)
