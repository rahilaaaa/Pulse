
from rest_framework.permissions import BasePermission

from apps.memberships.models import CompanyMembership


class CanManageMemberships(BasePermission):
    message = "You do not have permission to manage company memberships."

    def has_permission(self, request, view):
        membership = getattr(request, "company_membership", None)

        if membership is None:
            return False

        return membership.role in [
            CompanyMembership.Role.OWNER,
            CompanyMembership.Role.ADMIN,
        ]
