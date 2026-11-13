
from rest_framework.permissions import BasePermission

from apps.memberships.models import CompanyMembership


class HasActiveCompany(BasePermission):
    """
    Allows access only when the authenticated user has
    an active membership in the company specified by the JWT.
    """

    message = "You do not have access to an active company."

    def has_permission(self, request, view):
        # Authentication must have already succeeded.
        if not request.user or not request.user.is_authenticated:
            return False

        # The company_id must come from the verified JWT.
        token = request.auth

        if not token:
            return False

        company_id = token.get("company_id")

        if not company_id:
            return False

        # Verify current membership and company status in the database.
        membership = (
            CompanyMembership.objects
            .select_related("company")
            .filter(
                user=request.user,
                company_id=company_id,
                status=CompanyMembership.Status.ACTIVE,
                company__status="active",
            )
            .first()
        )

        if membership is None:
            return False

        # Make validated tenant context available to the view.
        request.company = membership.company
        request.company_membership = membership

        return True
