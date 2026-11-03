import uuid

from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.models import AuditLog
from apps.authorization.catalog import COMPANY_PERMISSIONS, NAV_CATALOG
from apps.authorization.company import (
    authorize_owner_role_member_add,
    authorize_owner_role_member_remove,
    holds_owner_role,
    replace_role_permissions,
    require_permission,
)
from apps.authorization.models import CompanyRole, CompanyRoleNavigation, CompanyRolePermission, MembershipRoleAssignment, Permission, PermissionScope
from apps.dashboards.services import publish_role_layout, role_layout, widget_catalog
from apps.modules_registry.models import CompanyModuleInstallation, InstallationStatus
from apps.tenants.models import CompanyMembership, MembershipStatus
from apps.tenants.services import _ip, _request_id
from common.api.errors import conflict, not_found, permission_denied, validation_error


def _role_name_taken(company_id, name: str, *, exclude_id=None) -> bool:
    query = CompanyRole.objects.filter(company_id=company_id, name=name)
    if exclude_id is not None:
        query = query.exclude(pk=exclude_id)
    return query.exists()


def _assert_unique_role_name(company_id, name: str, *, exclude_id=None) -> None:
    if _role_name_taken(company_id, name, exclude_id=exclude_id):
        raise conflict(
            "A role with this name already exists.",
            [{"field": "name", "code": "duplicate", "message": "A role with this name already exists."}],
        )


def _unique_copy_name(company_id, base: str) -> str:
    for index in range(1, 100):
        suffix = " copy" if index == 1 else f" copy {index}"
        candidate = f"{base[: max(1, 150 - len(suffix))]}{suffix}"
        if not _role_name_taken(company_id, candidate):
            return candidate
    raise conflict("Could not create a unique copy name for this role.")


def _serialize_role(role: CompanyRole) -> dict:
    return {
        "id": str(role.id),
        "name": role.name,
        "description": role.description,
        "is_system": role.is_system,
        "is_owner_role": role.is_owner_role,
        "is_active": role.is_active,
        "archived_at": role.archived_at.isoformat() if role.archived_at else None,
        "template_code": role.template_code,
        "permissions": [] if role.is_owner_role else list(role.permissions.order_by("permission_id").values_list("permission_id", flat=True)),
        "permission_count": None if role.is_owner_role else role.permissions.count(),
        "user_count": MembershipRoleAssignment.objects.filter(role=role, membership__status="active").count(),
        "updated_at": role.updated_at.isoformat(),
    }


class RoleListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = require_permission(request.user, company_id, "roles.view")
        include_archived = str(request.query_params.get("include_archived") or "").lower() in {"1", "true", "yes"}
        roles = CompanyRole.objects.filter(company_id=company_id).order_by("-is_owner_role", "name")
        if not include_archived:
            roles = roles.filter(is_active=True)
        installed_module_slugs = set(
            CompanyModuleInstallation.objects.filter(
                company_id=company_id,
                status=InstallationStatus.INSTALLED,
            ).values_list("module_id", flat=True)
        )
        permission_module_map = {code: module_slug for code, _, module_slug in COMPANY_PERMISSIONS}
        catalog = [
            {
                "code": item.code,
                "description": item.description,
                "module_slug": item.module_slug or permission_module_map.get(item.code),
            }
            for item in Permission.objects.filter(scope=PermissionScope.COMPANY).order_by("code")
            if not (item.module_slug or permission_module_map.get(item.code))
            or (item.module_slug or permission_module_map.get(item.code)) in installed_module_slugs
        ]
        return Response(
            {
                "results": [_serialize_role(role) for role in roles],
                "catalog": catalog,
                "installed_modules": sorted(installed_module_slugs),
                "caller_holds_owner_role": holds_owner_role(membership),
            }
        )

    def post(self, request, company_id):
        require_permission(request.user, company_id, "roles.manage")
        name = request.data.get("name")
        if not isinstance(name, str) or not name.strip():
            raise validation_error([{"field": "name", "code": "required", "message": "Enter a role name."}])
        description = request.data.get("description") if isinstance(request.data.get("description"), str) else ""
        cleaned_name = name.strip()[:150]
        _assert_unique_role_name(company_id, cleaned_name)
        try:
            role = CompanyRole.objects.create(
                company_id=company_id,
                name=cleaned_name,
                description=description.strip(),
                is_system=False,
            )
        except IntegrityError as exc:
            raise conflict(
                "A role with this name already exists.",
                [{"field": "name", "code": "duplicate", "message": "A role with this name already exists."}],
            ) from exc
        AuditLog.objects.create(
            company_id=company_id,
            actor=request.user,
            action="role.created",
            object_type="company_role",
            object_id=role.id,
            after={"name": role.name},
            ip_address=_ip(request),
            request_id=_request_id(request),
        )
        return Response(_serialize_role(role), status=201)


class RoleDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, company_id, role_id):
        actor = require_permission(request.user, company_id, "roles.manage")
        role = CompanyRole.objects.filter(company_id=company_id, pk=role_id).first()
        if role is None:
            raise not_found("That role was not found.")
        if role.is_owner_role and not holds_owner_role(actor):
            raise permission_denied("Only an owner can change this role.")
        if role.is_owner_role and request.data.get("name"):
            raise conflict("The owner role name stays as it was created.")
        permissions = request.data.get("permissions")
        try:
            with transaction.atomic():
                if isinstance(request.data.get("name"), str) and request.data["name"].strip() and not role.is_system:
                    cleaned_name = request.data["name"].strip()[:150]
                    _assert_unique_role_name(company_id, cleaned_name, exclude_id=role.id)
                    role.name = cleaned_name
                if isinstance(request.data.get("description"), str):
                    role.description = request.data["description"].strip()
                role.save()
                if isinstance(permissions, list):
                    before = sorted(role.permissions.values_list("permission_id", flat=True))
                    replace_role_permissions(role, permissions)
                    after = sorted(role.permissions.values_list("permission_id", flat=True))
                    if before != after:
                        AuditLog.objects.create(
                            company_id=company_id,
                            actor=request.user,
                            action="role.permissions_changed",
                            object_type="company_role",
                            object_id=role.id,
                            before={"permissions": before},
                            after={"permissions": after},
                            ip_address=_ip(request),
                            request_id=_request_id(request),
                        )
        except IntegrityError as exc:
            raise conflict(
                "A role with this name already exists.",
                [{"field": "name", "code": "duplicate", "message": "A role with this name already exists."}],
            ) from exc
        return Response(_serialize_role(role))

    def delete(self, request, company_id, role_id):
        require_permission(request.user, company_id, "roles.manage")
        role = CompanyRole.objects.filter(company_id=company_id, pk=role_id).first()
        if role is None:
            raise not_found("That role was not found.")
        if role.is_system or role.is_owner_role:
            raise conflict("System roles cannot be archived.")
        if MembershipRoleAssignment.objects.filter(role=role).exists():
            raise conflict("Remove this role from every user before archiving it.")
        if not role.is_active:
            return Response(_serialize_role(role))
        before = _serialize_role(role)
        role.is_active = False
        role.archived_at = timezone.now()
        role.save(update_fields=["is_active", "archived_at", "updated_at"])
        after = _serialize_role(role)
        AuditLog.objects.create(
            company_id=company_id,
            actor=request.user,
            action="role.archived",
            object_type="company_role",
            object_id=role.id,
            before=before,
            after=after,
            ip_address=_ip(request),
            request_id=_request_id(request),
        )
        return Response(after)


class RoleDuplicateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, company_id, role_id):
        require_permission(request.user, company_id, "roles.manage")
        source = CompanyRole.objects.filter(company_id=company_id, pk=role_id).first()
        if source is None:
            raise not_found("That role was not found.")
        try:
            copy = CompanyRole.objects.create(
                company_id=company_id,
                name=_unique_copy_name(company_id, source.name),
                description=source.description,
                is_system=False,
                is_owner_role=False,
            )
        except IntegrityError as exc:
            raise conflict(
                "A role with this name already exists.",
                [{"field": "name", "code": "duplicate", "message": "A role with this name already exists."}],
            ) from exc
        CompanyRolePermission.objects.bulk_create(
            [CompanyRolePermission(role=copy, permission_id=item.permission_id) for item in source.permissions.all()]
        )
        return Response(_serialize_role(copy), status=201)


def _membership_ids(raw) -> list[uuid.UUID]:
    if not isinstance(raw, list):
        raise validation_error(
            [{"field": "membership_ids", "code": "invalid", "message": "Send a list of members."}]
        )
    parsed: list[uuid.UUID] = []
    for item in raw:
        if not isinstance(item, str):
            raise validation_error(
                [{"field": "membership_ids", "code": "invalid", "message": "Send each membership id as text."}]
            )
        try:
            parsed.append(uuid.UUID(item))
        except ValueError:
            raise validation_error(
                [{"field": "membership_ids", "code": "invalid", "message": "One of those members was not found."}]
            ) from None
    if len(parsed) != len(set(parsed)):
        raise validation_error(
            [{"field": "membership_ids", "code": "invalid", "message": "Send each member once."}]
        )
    return parsed


def _serialize_role_member(membership: CompanyMembership) -> dict:
    user = membership.user
    name = " ".join(part for part in [user.first_name, user.last_name] if part).strip()
    return {
        "membership_id": str(membership.id),
        "email": user.email,
        "name": name,
        "status": membership.status,
    }


class RoleMembersView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id, role_id):
        actor = require_permission(request.user, company_id, "roles.view")
        role = CompanyRole.objects.filter(company_id=company_id, pk=role_id).first()
        if role is None:
            raise not_found("That role was not found.")
        assigned_ids = set(
            MembershipRoleAssignment.objects.filter(role=role, membership__status=MembershipStatus.ACTIVE).values_list(
                "membership_id", flat=True
            )
        )
        active = list(
            CompanyMembership.objects.select_related("user")
            .filter(company_id=company_id, status=MembershipStatus.ACTIVE)
            .order_by("user__email", "id")
        )
        results = [_serialize_role_member(row) for row in active if row.id in assigned_ids]
        available = [_serialize_role_member(row) for row in active if row.id not in assigned_ids]
        return Response(
            {
                "results": results,
                "available": available,
                "caller_holds_owner_role": holds_owner_role(actor),
                "role": {
                    "id": str(role.id),
                    "name": role.name,
                    "is_owner_role": role.is_owner_role,
                },
            }
        )

    def post(self, request, company_id, role_id):
        actor = require_permission(request.user, company_id, "roles.manage")
        role = CompanyRole.objects.filter(company_id=company_id, pk=role_id).first()
        if role is None:
            raise not_found("That role was not found.")
        authorize_owner_role_member_add(actor_membership=actor, role=role)
        membership_ids = _membership_ids(request.data.get("membership_ids"))
        memberships = list(
            CompanyMembership.objects.select_related("user").filter(
                company_id=company_id,
                pk__in=membership_ids,
                status=MembershipStatus.ACTIVE,
            )
        )
        if len(memberships) != len(membership_ids):
            raise not_found("One of those members was not found.")
        before = sorted(
            str(membership_id)
            for membership_id in MembershipRoleAssignment.objects.filter(role=role).values_list("membership_id", flat=True)
        )
        added = []
        with transaction.atomic():
            for membership in memberships:
                _assignment, created = MembershipRoleAssignment.objects.get_or_create(
                    membership=membership,
                    role=role,
                    defaults={"assigned_by": request.user},
                )
                if created:
                    added.append(str(membership.id))
            after = sorted(
                str(membership_id)
                for membership_id in MembershipRoleAssignment.objects.filter(role=role).values_list(
                    "membership_id", flat=True
                )
            )
            if before != after:
                AuditLog.objects.create(
                    company_id=company_id,
                    actor=request.user,
                    action="role.members_changed",
                    object_type="company_role",
                    object_id=role.id,
                    before={"membership_ids": before},
                    after={"membership_ids": after},
                    ip_address=_ip(request),
                    request_id=_request_id(request),
                )
        membership_ids = sorted(
            str(membership_id)
            for membership_id in MembershipRoleAssignment.objects.filter(role=role).values_list("membership_id", flat=True)
        )
        return Response({"role_id": str(role.id), "added": added, "membership_ids": membership_ids})


class RoleMemberDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, company_id, role_id, membership_id):
        actor = require_permission(request.user, company_id, "roles.manage")
        role = CompanyRole.objects.filter(company_id=company_id, pk=role_id).first()
        if role is None:
            raise not_found("That role was not found.")
        membership = CompanyMembership.objects.filter(company_id=company_id, pk=membership_id).first()
        if membership is None:
            raise not_found("That member was not found.")
        assignment = MembershipRoleAssignment.objects.filter(membership=membership, role=role).first()
        if assignment is None:
            raise not_found("That member does not hold this role.")
        authorize_owner_role_member_remove(actor_membership=actor, role=role, target_membership=membership)
        before = sorted(
            str(row_id)
            for row_id in MembershipRoleAssignment.objects.filter(role=role).values_list("membership_id", flat=True)
        )
        with transaction.atomic():
            assignment.delete()
            after = sorted(
                str(row_id)
                for row_id in MembershipRoleAssignment.objects.filter(role=role).values_list("membership_id", flat=True)
            )
            AuditLog.objects.create(
                company_id=company_id,
                actor=request.user,
                action="role.members_changed",
                object_type="company_role",
                object_id=role.id,
                before={"membership_ids": before},
                after={"membership_ids": after},
                ip_address=_ip(request),
                request_id=_request_id(request),
            )
        return Response(status=204)


class RoleNavigationView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id, role_id):
        require_permission(request.user, company_id, "dashboards.manage")
        role = CompanyRole.objects.filter(company_id=company_id, pk=role_id).first()
        if role is None:
            raise not_found("That role was not found.")
        saved = {item.code: item for item in role.navigation_items.all()}
        results = []
        for index, (code, label, permission, module_slug) in enumerate(NAV_CATALOG):
            item = saved.get(code)
            results.append(
                {
                    "code": code,
                    "label": label,
                    "permission": permission,
                    "module_slug": module_slug,
                    "enabled": item.enabled if item else True,
                    "position": item.position if item else index,
                }
            )
        results.sort(key=lambda row: row["position"])
        return Response({"results": results})

    def put(self, request, company_id, role_id):
        require_permission(request.user, company_id, "dashboards.manage")
        role = CompanyRole.objects.filter(company_id=company_id, pk=role_id).first()
        if role is None:
            raise not_found("That role was not found.")
        items = request.data.get("items")
        if not isinstance(items, list):
            raise validation_error([{"field": "items", "code": "invalid", "message": "Send the navigation list."}])
        known = {code for code, _label, _permission, _module in NAV_CATALOG}
        with transaction.atomic():
            CompanyRoleNavigation.objects.filter(role=role).delete()
            rows = []
            for index, item in enumerate(items):
                if not isinstance(item, dict) or item.get("code") not in known:
                    continue
                rows.append(CompanyRoleNavigation(role=role, code=item["code"], position=index, enabled=bool(item.get("enabled", True))))
            CompanyRoleNavigation.objects.bulk_create(rows)
        return Response({"saved": True})


class StudioView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id, role_id):
        membership = require_permission(request.user, company_id, "dashboards.manage")
        role = CompanyRole.objects.filter(company_id=company_id, pk=role_id).first()
        if role is None:
            raise not_found("That role was not found.")
        return Response({"widgets": widget_catalog(membership.company, role), "selected": role_layout(role)})

    def put(self, request, company_id, role_id):
        membership = require_permission(request.user, company_id, "dashboards.manage")
        role = CompanyRole.objects.filter(company_id=company_id, pk=role_id).first()
        if role is None:
            raise not_found("That role was not found.")
        codes = request.data.get("widgets")
        if not isinstance(codes, list):
            raise validation_error([{"field": "widgets", "code": "invalid", "message": "Send the widget list."}])
        selected = publish_role_layout(company=membership.company, role=role, codes=codes)
        AuditLog.objects.create(
            company=membership.company,
            actor=request.user,
            action="dashboard.published",
            object_type="company_role",
            object_id=role.id,
            after={"widgets": selected},
            ip_address=_ip(request),
            request_id=_request_id(request),
        )
        return Response({"selected": selected})
