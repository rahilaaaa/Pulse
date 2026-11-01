import hashlib

from django.db import connection, transaction
from django.utils import timezone

from apps.audit.models import AuditLog
from apps.authorization.company import require_permission
from apps.billing.access import current_subscription
from apps.billing.models import BillingPlanEntitlement
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
    from apps.modules_registry.manifests import MODULES

    for item in MODULES:
        ModuleDefinition.objects.update_or_create(
            slug=item["slug"],
            defaults={
                "display_name": item["display_name"],
                "description": item["description"],
                "version": item["version"],
                "django_app_label": item["django_app_label"],
                "min_platform_version": "0.1.0",
                "is_core": item["is_core"],
                "is_public": item["is_public"],
                "installation_available": item["installation_available"],
                "config_schema": {},
            },
        )


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
        results.append(
            {
                "slug": module.slug,
                "name": module.display_name,
                "description": module.description,
                "version": module.version,
                "installation_available": module.installation_available,
                "eligible": module.slug in entitled,
                "status": row.status if row else "available",
                "installed": installed,
                "last_error": row.last_error if row else "",
                "coming_soon": not module.installation_available,
            }
        )
    return {"results": results}


def install_module(*, user, company, slug: str, request, enforce_permission: bool = True) -> dict:
    ensure_module_catalog()
    _load_installers()
    if enforce_permission:
        require_permission(user, company.id, "modules.install")
    module = ModuleDefinition.objects.filter(slug=slug, is_public=True).first()
    if module is None:
        raise not_found("That module is not in the catalog.")
    if not module.installation_available or slug not in INSTALLERS:
        raise conflict("This module is coming soon and cannot be installed.")
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
                )
            else:
                row.status = InstallationStatus.INSTALLING
                row.last_error = ""
                row.installed_by = user
                row.save(update_fields=["status", "last_error", "installed_by", "updated_at"])
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
                ip_address=_ip(request),
                request_id=_request_id(request),
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


def uninstall_module(*, user, company, slug: str, request, enforce_permission: bool = True) -> dict:
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
            ip_address=_ip(request),
            request_id=_request_id(request),
        )
    return _payload(module, row)


def install_selected(*, user, company, slugs, request) -> dict:
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
