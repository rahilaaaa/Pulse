
from django.conf import settings
from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction
from django.utils import timezone

from apps.memberships.models import CompanyMembership
from .models import CompanyModule


class ModuleNotAvailableError(Exception):
    """Raised when a requested plugin is not registered in Pulse."""


def _get_plugin_manifest(module_key):
    """
    Return the manifest for a discovered plugin.
    Only plugins registered in Pulse can be installed.
    """
    registry = settings.PULSE_PLUGIN_REGISTRY

    for manifest in registry.get_all_plugins():
        if manifest.key == module_key:
            return manifest

    raise ModuleNotAvailableError(
        f"Module '{module_key}' is not available."
    )


def _get_authorized_membership(company, user):
    """
    Only active company owners and admins can manage modules.
    """
    membership = CompanyMembership.objects.filter(
        company=company,
        user=user,
        status=CompanyMembership.Status.ACTIVE,
    ).first()

    if membership is None:
        raise PermissionDenied(
            "You do not have an active membership in this company."
        )

    allowed_roles = {
        CompanyMembership.Role.OWNER,
        CompanyMembership.Role.ADMIN,
    }

    if membership.role not in allowed_roles:
        raise PermissionDenied(
            "Only company owners and admins can manage modules."
        )

    return membership


def get_available_modules():
    """
    Return all plugins discovered by Pulse.
    This does not mean they are installed for every company.
    """
    registry = settings.PULSE_PLUGIN_REGISTRY

    return [
        {
            "key": manifest.key,
            "name": manifest.name,
            "version": manifest.version,
            "description": manifest.description,
        }
        for manifest in registry.get_all_plugins()
    ]


def get_company_modules(company):
    """
    Return the module installation records for one company.
    """
    return CompanyModule.objects.filter(
        company=company,
        status=CompanyModule.Status.INSTALLED,
    ).order_by("module_key")


def is_module_installed(company, module_key):
    """
    Check whether a module is installed for a specific company.
    """
    return CompanyModule.objects.filter(
        company=company,
        module_key=module_key,
        status=CompanyModule.Status.INSTALLED,
    ).exists()


@transaction.atomic
def install_company_module(company, user, module_key):
    """
    Install or reinstall a discovered plugin for a company.
    """
    _get_authorized_membership(company, user)
    _get_plugin_manifest(module_key)

    module, created = CompanyModule.objects.select_for_update().get_or_create(
        company=company,
        module_key=module_key,
        defaults={
            "status": CompanyModule.Status.INSTALLED,
            "installed_by": user,
            "installed_at": timezone.now(),
            "uninstalled_at": None,
        },
    )

    if not created:
        module.status = CompanyModule.Status.INSTALLED
        module.installed_by = user
        module.installed_at = timezone.now()
        module.uninstalled_at = None

        module.save(
            update_fields=[
                "status",
                "installed_by",
                "installed_at",
                "uninstalled_at",
                "updated_at",
            ]
        )

    return module


@transaction.atomic
def uninstall_company_module(company, user, module_key):
    """
    Disable a company's access to a plugin without deleting its data.
    """
    _get_authorized_membership(company, user)
    _get_plugin_manifest(module_key)

    module = CompanyModule.objects.select_for_update().filter(
        company=company,
        module_key=module_key,
    ).first()

    if module is None:
        raise ValidationError(
            "This module has not been installed for this company."
        )

    if module.status == CompanyModule.Status.UNINSTALLED:
        return module

    module.status = CompanyModule.Status.UNINSTALLED
    module.uninstalled_at = timezone.now()

    module.save(
        update_fields=[
            "status",
            "uninstalled_at",
            "updated_at",
        ]
    )

    return module
