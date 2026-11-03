import hashlib

from django.db import connection, transaction
from django.utils import timezone

from apps.audit.models import AuditLog
from apps.authorization.company import require_permission
from apps.billing.access import current_subscription
from apps.billing.models import BillingPlanEntitlement
from apps.modules_registry.manifests import MANIFEST_BY_SLUG, MODULES
from apps.modules_registry.models import CompanyModuleInstallation, InstallationStatus, ModuleDefinition
from apps.tenants.services import _ip, _request_id
from common.api.errors import conflict, not_found
from common.api.exceptions import PulseAPIException


INSTALLERS = {}
UNINSTALLERS = {}


def register_installer(slug, func) -> None:
    INSTALLERS[slug] = func


def register_uninstaller(slug, func) -> None:
    UNINSTALLERS[slug] = func


def _advisory_lock(lock_key: int) -> None:
    """PostgreSQL transaction advisory lock; no-op on other backends (e.g. SQLite tests)."""
    if connection.vendor != "postgresql":
        return
    with connection.cursor() as cursor:
        cursor.execute("SELECT pg_advisory_xact_lock(%s)", [lock_key])


def _load_installers() -> None:
    if "hrms" not in INSTALLERS:
        from apps.hrms.install import on_install as hrms_install
        from apps.hrms.install import on_uninstall as hrms_uninstall

        register_installer("hrms", hrms_install)
        register_uninstaller("hrms", hrms_uninstall)
    if "projects" not in INSTALLERS:
        from apps.projects.install import on_install as projects_install
        from apps.projects.install import on_uninstall as projects_uninstall

        register_installer("projects", projects_install)
        register_uninstaller("projects", projects_uninstall)
    if "crm" not in INSTALLERS:
        from apps.crm.install import on_install as crm_install
        from apps.crm.install import on_uninstall as crm_uninstall

        register_installer("crm", crm_install)
        register_uninstaller("crm", crm_uninstall)
    if "commerce" not in INSTALLERS:
        from apps.commerce.install import on_install as commerce_install
        from apps.commerce.install import on_uninstall as commerce_uninstall

        register_installer("commerce", commerce_install)
        register_uninstaller("commerce", commerce_uninstall)


def ensure_module_catalog() -> None:
    """Re-seed public module definitions if flush left the catalog empty."""
    for item in MODULES:
        mod = ModuleDefinition.objects.filter(slug=item["slug"]).first()
        if mod is None:
            ModuleDefinition.objects.create(
                slug=item["slug"],
                display_name=item["display_name"],
                description=item["description"],
                version=item["version"],
                django_app_label=item["django_app_label"],
                min_platform_version="0.1.0",
                is_core=item["is_core"],
                is_public=item["is_public"],
                installation_available=item["installation_available"],
                config_schema=item.get("config_schema", {}),
            )
        else:
            mod.display_name = item["display_name"]
            mod.description = item["description"]
            mod.version = item["version"]
            mod.django_app_label = item["django_app_label"]
            mod.min_platform_version = "0.1.0"
            mod.is_core = item["is_core"]
            mod.is_public = item["is_public"]
            mod.config_schema = item.get("config_schema", {})
            # Preserve mod.installation_available as set by Platform Admin in DB!
            mod.save(
                update_fields=[
                    "display_name",
                    "description",
                    "version",
                    "django_app_label",
                    "min_platform_version",
                    "is_core",
                    "is_public",
                    "config_schema",
                    "updated_at",
                ]
            )


def list_onboarding_modules() -> dict:
    """Return only modules that are public, non-core, and globally available for installation."""
    ensure_module_catalog()
    modules = (
        ModuleDefinition.objects.filter(
            is_public=True,
            is_core=False,
            installation_available=True,
        )
        .order_by("display_name")
    )
    results = []
    for mod in modules:
        manifest = MANIFEST_BY_SLUG.get(mod.slug, {})
        raw_features = manifest.get("features", [])
        includes = [f.get("title") for f in raw_features] if raw_features else [mod.display_name]
        results.append(
            {
                "slug": mod.slug,
                "name": mod.display_name,
                "display_name": mod.display_name,
                "category": manifest.get("category", "Operations"),
                "description": mod.description,
                "summary": mod.description,
                "detail": manifest.get("problem_solved", mod.description),
                "pitch": manifest.get("problem_solved", mod.description),
                "version": mod.version,
                "installation_available": mod.installation_available,
                "installable": mod.installation_available,
                "icon": manifest.get("icon", "package"),
                "featured": manifest.get("featured", False),
                "includes": includes,
                "features_preview": includes[:3],
                "dependencies": [d.depends_on_id for d in mod.dependencies.all()],
            }
        )
    return {"results": results, "count": len(results)}


def validate_onboarding_modules(slugs: list[str]) -> None:
    """Ensure all requested modules are valid and available for installation."""
    ensure_module_catalog()
    if not slugs or not isinstance(slugs, list):
        return
    for slug in slugs:
        if not isinstance(slug, str) or not slug.strip():
            continue
        slug = slug.strip()
        mod = ModuleDefinition.objects.filter(slug=slug, is_public=True).first()
        if mod is not None and not mod.installation_available:
            raise conflict(f"Module '{mod.display_name}' is currently not available for installation.")


def included_slugs(company) -> set[str]:
    subscription = current_subscription(company)
    if subscription is None:
        return set()
    row = BillingPlanEntitlement.objects.filter(plan=subscription.plan, entitlement_key="included_module_slugs").first()
    value = row.entitlement_value if row else []
    if not isinstance(value, list):
        return set()
    return {item for item in value if isinstance(item, str)}


def catalog_for_company(company) -> dict:
    ensure_module_catalog()
    installations = {
        row.module_id: row
        for row in CompanyModuleInstallation.objects.filter(company=company).select_related("module")
    }
    entitled = included_slugs(company)
    results = []
    for module in ModuleDefinition.objects.filter(is_public=True).order_by("display_name"):
        row = installations.get(module.slug)
        installed = row is not None and row.status == InstallationStatus.INSTALLED
        manifest = MANIFEST_BY_SLUG.get(module.slug, {})
        features = manifest.get("features", [])
        features_preview = [f.get("title") for f in features[:3]] if features else []

        results.append(
            {
                "slug": module.slug,
                "name": module.display_name,
                "description": module.description,
                "version": module.version,
                "category": manifest.get("category", "Operations"),
                "icon": manifest.get("icon", "package"),
                "featured": manifest.get("featured", False),
                "problem_solved": manifest.get("problem_solved", ""),
                "features_preview": features_preview,
                "installation_available": module.installation_available,
                "eligible": module.slug in entitled,
                "status": row.status if row else "available",
                "installed": installed,
                "last_error": row.last_error if row else "",
                "coming_soon": not module.installation_available,
                "dependencies": [d.depends_on_id for d in module.dependencies.all()],
            }
        )
    return {"results": results}


def evaluate_onboarding_checklist(company, slug: str) -> list[dict]:
    manifest = MANIFEST_BY_SLUG.get(slug, {})
    raw_checklist = manifest.get("onboarding_checklist", [])
    if not raw_checklist:
        return []

    evaluated = []
    for item in raw_checklist:
        check_key = item.get("check_key", "")
        completed = False
        try:
            if slug == "hrms":
                if check_key == "has_legal_entity":
                    from apps.tenants.models import LegalEntity
                    completed = LegalEntity.objects.filter(company=company, status="active").exists()
                elif check_key == "has_org_units":
                    from apps.organization.models import Department
                    completed = Department.objects.filter(company=company).exists()
                elif check_key == "has_hr_roles":
                    from apps.authorization.models import CompanyRole
                    completed = CompanyRole.objects.filter(company=company, name__icontains="HR").exists()
                elif check_key == "has_leave_policies":
                    from apps.hrms.models import LeavePolicy
                    completed = LeavePolicy.objects.filter(company=company).exists()
                elif check_key == "has_attendance_policies":
                    from apps.hrms.models import AttendancePolicy
                    completed = AttendancePolicy.objects.filter(company=company).exists()
                elif check_key == "has_active_employees":
                    from apps.hrms.models import Employment, EmploymentStatus
                    completed = Employment.objects.filter(company=company, status=EmploymentStatus.ACTIVE).exists()
            elif slug == "crm":
                if check_key == "has_leads":
                    from apps.crm.models import Lead
                    completed = Lead.objects.filter(company=company).exists()
            elif slug == "projects":
                if check_key == "has_projects":
                    from apps.projects.models import Project
                    completed = Project.objects.filter(company=company).exists()
            elif slug == "commerce":
                if check_key == "has_products":
                    from apps.commerce.models import Product
                    completed = Product.objects.filter(company=company).exists()
                elif check_key == "has_orders":
                    from apps.commerce.models import Order
                    completed = Order.objects.filter(company=company).exists()
                elif check_key == "has_categories":
                    from apps.commerce.models import Category
                    completed = Category.objects.filter(company=company).exists()
        except Exception:
            completed = False

        evaluated.append({
            "id": item["id"],
            "title": item["title"],
            "description": item["description"],
            "action_url": item.get("action_url", ""),
            "required_permission": item.get("required_permission", ""),
            "completed": completed,
        })
    return evaluated


def module_detail_for_company(company, slug: str, user=None) -> dict:
    ensure_module_catalog()
    module = ModuleDefinition.objects.filter(slug=slug, is_public=True).first()
    if module is None:
        raise not_found("Module not found in registry.")

    manifest = MANIFEST_BY_SLUG.get(slug, {})
    entitled_set = included_slugs(company)
    is_eligible = slug in entitled_set
    row = CompanyModuleInstallation.objects.filter(company=company, module=module).first()
    installed = row is not None and row.status == InstallationStatus.INSTALLED

    # Check dependencies
    dependencies_status = []
    all_deps_met = True
    for dep in module.dependencies.all():
        dep_installed = CompanyModuleInstallation.objects.filter(
            company=company,
            module_id=dep.depends_on_id,
            status=InstallationStatus.INSTALLED,
        ).exists()
        if not dep_installed:
            all_deps_met = False
        dep_manifest = MANIFEST_BY_SLUG.get(dep.depends_on_id, {})
        dependencies_status.append({
            "slug": dep.depends_on_id,
            "name": dep_manifest.get("display_name", dep.depends_on_id),
            "installed": dep_installed,
            "required": dep.is_required,
        })

    # Evaluate live onboarding checklist
    onboarding = evaluate_onboarding_checklist(company, slug) if installed else []

    # Can current user install?
    has_install_perm = True
    if user is not None:
        from apps.authorization.company import effective_permission_codes, require_membership
        try:
            mem = require_membership(user, company.id)
            has_install_perm = "modules.install" in effective_permission_codes(mem)
        except Exception:
            has_install_perm = False

    return {
        "slug": module.slug,
        "name": module.display_name,
        "description": module.description,
        "category": manifest.get("category", "Operations"),
        "icon": manifest.get("icon", "package"),
        "version": module.version,
        "featured": manifest.get("featured", False),
        "problem_solved": manifest.get("problem_solved", ""),
        "target_users": manifest.get("target_users", ""),
        "installation_available": module.installation_available,
        "coming_soon": not module.installation_available,
        "is_public": module.is_public,
        "status": row.status if row else "available",
        "installed": installed,
        "installed_version": row.installed_version if row else None,
        "installed_at": row.installed_at.isoformat() if row and row.installed_at else None,
        "last_error": row.last_error if row else "",
        "config": row.config if row else {},
        "eligible": is_eligible,
        "features": manifest.get("features", []),
        "screenshots": manifest.get("screenshots", []),
        "tutorials": manifest.get("tutorials", []),
        "config_schema": manifest.get("config_schema", {}),
        "dependencies": dependencies_status,
        "onboarding_checklist": onboarding,
        "requirements_status": {
            "subscription_eligible": is_eligible,
            "has_install_permission": has_install_perm,
            "dependencies_met": all_deps_met,
            "is_available": module.installation_available,
        },
    }


def install_module(*, user, company, slug: str, request=None, config: dict = None, enforce_permission: bool = True) -> dict:
    ensure_module_catalog()
    _load_installers()
    if enforce_permission:
        require_permission(user, company.id, "modules.install")
    module = ModuleDefinition.objects.filter(slug=slug, is_public=True).first()
    if module is None:
        raise not_found("That module is not in the catalog.")
    if not module.installation_available:
        raise conflict(f"Module '{module.display_name}' is currently not available for installation.")
    if slug not in INSTALLERS:
        raise conflict("This module does not have an installer configured and cannot be installed.")
    if slug not in included_slugs(company):
        raise conflict("The current plan does not include this module.")
    missing = [
        item.depends_on_id
        for item in module.dependencies.all()
        if not CompanyModuleInstallation.objects.filter(
            company=company,
            module_id=item.depends_on_id,
            status=InstallationStatus.INSTALLED,
        ).exists()
    ]
    if missing:
        raise conflict("Install the required modules first.", [{"field": "slug", "code": "dependency", "message": ", ".join(missing)}])

    lock_key = int(hashlib.sha256(f"{company.id}:{slug}".encode("utf-8")).hexdigest()[:15], 16)
    try:
        with transaction.atomic():
            _advisory_lock(lock_key)
            row = CompanyModuleInstallation.objects.select_for_update().filter(company=company, module=module).first()
            if row and row.status == InstallationStatus.INSTALLED:
                return _payload(module, row)
            if row is None:
                row = CompanyModuleInstallation.objects.create(
                    company=company,
                    module=module,
                    status=InstallationStatus.INSTALLING,
                    installed_by=user,
                    config=config or {},
                )
            else:
                row.status = InstallationStatus.INSTALLING
                row.last_error = ""
                row.installed_by = user
                if config is not None:
                    row.config = config
                row.save(update_fields=["status", "last_error", "installed_by", "config", "updated_at"])
            INSTALLERS[slug](company=company, user=user)
            row.status = InstallationStatus.INSTALLED
            row.installed_version = module.version
            row.installed_at = timezone.now()
            row.uninstalled_at = None
            row.last_error = ""
            row.save(update_fields=["status", "installed_version", "installed_at", "uninstalled_at", "last_error", "updated_at"])
            AuditLog.objects.create(
                company=company,
                actor=user,
                action="module.installed",
                object_type="company_module_installation",
                object_id=row.id,
                after={"slug": slug, "version": module.version},
                ip_address=_ip(request) if request else "",
                request_id=_request_id(request) if request else "",
            )
    except PulseAPIException:
        raise
    except Exception as exc:
        CompanyModuleInstallation.objects.update_or_create(
            company=company,
            module=module,
            defaults={"status": InstallationStatus.FAILED, "last_error": str(exc)[:500], "installed_by": user},
        )
        raise conflict("The module could not be installed.") from exc
    return _payload(module, row)


def uninstall_module(*, user, company, slug: str, request=None, enforce_permission: bool = True) -> dict:
    """Mark a module uninstalled without deleting business rows (ADR-011 / doc 16)."""
    ensure_module_catalog()
    _load_installers()
    if enforce_permission:
        require_permission(user, company.id, "modules.uninstall")
    module = ModuleDefinition.objects.filter(slug=slug, is_public=True).first()
    if module is None:
        raise not_found("That module is not in the catalog.")
    lock_key = int(hashlib.sha256(f"{company.id}:{slug}:uninstall".encode("utf-8")).hexdigest()[:15], 16)
    with transaction.atomic():
        _advisory_lock(lock_key)
        row = CompanyModuleInstallation.objects.select_for_update().filter(company=company, module=module).first()
        if row is None or row.status != InstallationStatus.INSTALLED:
            raise conflict("That module is not installed.")
        row.status = InstallationStatus.UNINSTALLING
        row.save(update_fields=["status", "updated_at"])
        uninstaller = UNINSTALLERS.get(slug)
        if uninstaller is not None:
            uninstaller(company=company, user=user)
        row.status = InstallationStatus.UNINSTALLED
        row.uninstalled_at = timezone.now()
        row.last_error = ""
        row.save(update_fields=["status", "uninstalled_at", "last_error", "updated_at"])
        AuditLog.objects.create(
            company=company,
            actor=user,
            action="module.uninstalled",
            object_type="company_module_installation",
            object_id=row.id,
            after={"slug": slug, "retained": True},
            ip_address=_ip(request) if request else "",
            request_id=_request_id(request) if request else "",
        )
    return _payload(module, row)


def install_selected(*, user, company, slugs, request=None) -> dict:
    ensure_module_catalog()
    installed = []
    skipped = []
    if not isinstance(slugs, list):
        return {"installed": installed, "skipped": skipped}
    for slug in slugs:
        if not isinstance(slug, str) or not slug.strip():
            continue
        slug = slug.strip()
        module = ModuleDefinition.objects.filter(slug=slug, is_public=True).first()
        if module is None or not module.installation_available or slug not in included_slugs(company):
            skipped.append(slug)
            continue
        try:
            install_module(user=user, company=company, slug=slug, request=request, enforce_permission=True)
            installed.append(slug)
        except Exception:
            skipped.append(slug)
    return {"installed": installed, "skipped": skipped}


def _payload(module, row) -> dict:
    return {
        "slug": module.slug,
        "name": module.display_name,
        "status": row.status,
        "installed": row.status == InstallationStatus.INSTALLED,
        "version": row.installed_version,
        "last_error": row.last_error,
    }
