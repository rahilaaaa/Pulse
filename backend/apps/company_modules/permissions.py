
from rest_framework.permissions import BasePermission

from .models import CompanyModule


class HasInstalledModule(BasePermission):
    """
    Allow access only when the requested module is installed
    for the authenticated user's active company.

    The view must define its module_key attribute.
    """

    message = "This module is not installed for your company."

    def has_permission(self, request, view):
        company = getattr(request, "company", None)
        module_key = getattr(view, "module_key", None)

        if company is None or not module_key:
            return False

        return CompanyModule.objects.filter(
            company=company,
            module_key=module_key,
            status=CompanyModule.Status.INSTALLED,
        ).exists()
