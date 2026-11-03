from django.db import transaction
from django.db.models import Count, Q

from apps.audit.models import AuditLog
from apps.identity.models import User
from apps.modules_registry.manifests import MANIFEST_BY_SLUG
from apps.modules_registry.models import CompanyModuleInstallation, InstallationStatus, ModuleDefinition
from apps.modules_registry.services import ensure_module_catalog, install_module, uninstall_module
from apps.tenants.models import Company
from common.api.errors import conflict, not_found, validation_error


def _iso(value):
    if value is None:
        return None
    return value.isoformat()


def list_platform_modules() -> dict:
    ensure_module_catalog()
    queryset = (
        ModuleDefinition.objects.all()
        .annotate(
            active_installs=Count(
                "installations",
                filter=Q(installations__status=InstallationStatus.INSTALLED),
            )
        )
        .order_by("display_name")
    )
    results = []
    for mod in queryset:
        manifest = MANIFEST_BY_SLUG.get(mod.slug, {})
        deps = [d.depends_on_id for d in mod.dependencies.all()]
        results.append(
            {
                "slug": mod.slug,
                "display_name": mod.display_name,
                "description": mod.description,
                "version": mod.version,
                "category": manifest.get("category", "Operations"),
                "icon": manifest.get("icon", "package"),
                "is_core": mod.is_core,
                "is_public": mod.is_public,
                "installation_available": mod.installation_available,
                "installed_companies_count": mod.active_installs,
                "dependencies": deps,
            }
        )
    return {"results": results, "count": len(results)}


def get_platform_module_detail(slug: str) -> dict:
    mod = ModuleDefinition.objects.filter(slug=slug).first()
    if mod is None:
        ensure_module_catalog()
        mod = ModuleDefinition.objects.filter(slug=slug).first()
    if mod is None:
        raise not_found("Module not found in catalog.")

    manifest = MANIFEST_BY_SLUG.get(slug, {})
    deps = [
        {
            "slug": d.depends_on_id,
            "display_name": d.depends_on.display_name,
            "version": d.depends_on.version,
        }
        for d in mod.dependencies.select_related("depends_on").all()
    ]

    installations = (
        CompanyModuleInstallation.objects.filter(module=mod, status=InstallationStatus.INSTALLED)
        .select_related("company")
        .order_by("company__display_name")
    )
    companies = [
        {
            "company_id": str(row.company_id),
            "display_name": row.company.display_name,
            "slug": row.company.slug,
            "installed_version": row.installed_version or mod.version,
            "installed_at": _iso(row.installed_at),
        }
        for row in installations
    ]

    return {
        "slug": mod.slug,
        "display_name": mod.display_name,
        "description": mod.description,
        "version": mod.version,
        "category": manifest.get("category", "Operations"),
        "icon": manifest.get("icon", "package"),
        "is_core": mod.is_core,
        "is_public": mod.is_public,
        "installation_available": mod.installation_available,
        "problem_solved": manifest.get("problem_solved", ""),
        "target_users": manifest.get("target_users", ""),
        "features": manifest.get("features", []),
        "config_schema": mod.config_schema or manifest.get("config_schema", {}),
        "dependencies": deps,
        "installed_companies_count": len(companies),
        "installed_companies": companies,
    }


def update_platform_module_availability(*, actor: User, slug: str, payload: dict, request) -> dict:
    if not isinstance(payload, dict):
        raise validation_error([{"field": "", "code": "invalid", "message": "Send a JSON object."}])

    mod = ModuleDefinition.objects.filter(slug=slug).first()
    if mod is None:
        ensure_module_catalog()
        mod = ModuleDefinition.objects.filter(slug=slug).first()
    if mod is None:
        raise not_found("Module not found in catalog.")

    if "installation_available" not in payload:
        raise validation_error(
            [{"field": "installation_available", "code": "required", "message": "Specify installation availability."}]
        )

    installation_available = bool(payload.get("installation_available"))
    before = mod.installation_available
    with transaction.atomic():
        mod.installation_available = installation_available
        mod.save(update_fields=["installation_available", "updated_at"])

        AuditLog.objects.create(
            company=None,
            actor=actor,
            action="platform.module.availability_changed",
            object_type="module_definition",
            object_id=None,
            before={"slug": slug, "installation_available": before},
            after={"slug": slug, "installation_available": installation_available},
        )

    return get_platform_module_detail(slug)


def install_company_module(*, actor: User, company_id, slug: str, request) -> dict:
    company = Company.objects.filter(pk=company_id).first()
    if company is None:
        raise not_found("That company was not found.")

    return install_module(
        user=actor,
        company=company,
        slug=slug,
        request=request,
        enforce_permission=False,
    )


def uninstall_company_module(*, actor: User, company_id, slug: str, request) -> dict:
    company = Company.objects.filter(pk=company_id).first()
    if company is None:
        raise not_found("That company was not found.")

    return uninstall_module(
        user=actor,
        company=company,
        slug=slug,
        request=request,
        enforce_permission=False,
    )
