from django.db import transaction
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.models import AuditLog
from apps.authorization.catalog import NAV_CATALOG
from apps.authorization.company import holds_owner_role, replace_role_permissions, require_permission
from apps.authorization.models import CompanyRole, CompanyRoleNavigation, CompanyRolePermission, MembershipRoleAssignment, Permission, PermissionScope
from apps.dashboards.services import publish_role_layout, role_layout, widget_catalog
from apps.tenants.services import _ip, _request_id
from common.api.errors import conflict, not_found, permission_denied, validation_error


def _serialize_role(role: CompanyRole) -> dict:
    return {
        "id": str(role.id),
        "name": role.name,
        "description": role.description,
        "is_system": role.is_system,
        "is_owner_role": role.is_owner_role,
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
        roles = CompanyRole.objects.filter(company_id=company_id).order_by("-is_owner_role", "name")
        catalog = [
            {"code": item.code, "description": item.description, "module_slug": item.module_slug}
            for item in Permission.objects.filter(scope=PermissionScope.COMPANY).order_by("code")
        ]
        return Response(
            {
                "results": [_serialize_role(role) for role in roles],
                "catalog": catalog,
                "caller_holds_owner_role": holds_owner_role(membership),
            }
        )

    def post(self, request, company_id):
        require_permission(request.user, company_id, "roles.manage")
        name = request.data.get("name")
        if not isinstance(name, str) or not name.strip():
            raise validation_error([{"field": "name", "code": "required", "message": "Enter a role name."}])
        description = request.data.get("description") if isinstance(request.data.get("description"), str) else ""
        role = CompanyRole.objects.create(company_id=company_id, name=name.strip()[:150], description=description.strip(), is_system=False)
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
        with transaction.atomic():
            if isinstance(request.data.get("name"), str) and request.data["name"].strip() and not role.is_system:
                role.name = request.data["name"].strip()[:150]
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
        return Response(_serialize_role(role))

    def delete(self, request, company_id, role_id):
        require_permission(request.user, company_id, "roles.manage")
        role = CompanyRole.objects.filter(company_id=company_id, pk=role_id).first()
        if role is None:
            raise not_found("That role was not found.")
        if role.is_system or role.is_owner_role:
            raise conflict("System roles cannot be deleted.")
        if MembershipRoleAssignment.objects.filter(role=role).exists():
            raise conflict("Remove this role from every user before deleting it.")
        role.delete()
        return Response(status=204)


class RoleDuplicateView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, company_id, role_id):
        require_permission(request.user, company_id, "roles.manage")
        source = CompanyRole.objects.filter(company_id=company_id, pk=role_id).first()
        if source is None:
            raise not_found("That role was not found.")
        copy = CompanyRole.objects.create(
            company_id=company_id,
            name=f"{source.name} copy"[:150],
            description=source.description,
            is_system=False,
            is_owner_role=False,
        )
        CompanyRolePermission.objects.bulk_create(
            [CompanyRolePermission(role=copy, permission_id=item.permission_id) for item in source.permissions.all()]
        )
        return Response(_serialize_role(copy), status=201)


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
