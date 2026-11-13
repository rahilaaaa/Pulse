from rest_framework.permissions import BasePermission

from apps.memberships.models import CompanyMembership


class HasActiveCompany(BasePermission):
    message = "You do not have access to an active company."

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        token = request.auth

        if not token:
            return False

        company_id = token.get("company_id")

        if not company_id:
            return False

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

        request.company = membership.company
        request.company_membership = membership

        return True