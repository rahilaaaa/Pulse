
from django.shortcuts import get_object_or_404

from rest_framework.generics import ListAPIView, RetrieveUpdateAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.memberships.models import CompanyMembership
from apps.memberships.permissions.company_access import HasActiveCompany
from apps.memberships.permissions.company_management import CanManageMemberships
from apps.memberships.management_serializers import (
    CompanyMemberSerializer,
    UpdateCompanyMemberSerializer,
)


class CompanyMemberListView(ListAPIView):
    serializer_class = CompanyMemberSerializer
    permission_classes = [IsAuthenticated, HasActiveCompany]

    def get_queryset(self):
        return (
            CompanyMembership.objects
            .filter(company=self.request.company)
            .select_related("user")
            .order_by("-created_at")
        )


class CompanyMemberDetailView(RetrieveUpdateAPIView):
    http_method_names = ["get", "patch", "head", "options"]

    def get_permissions(self):
        permissions = [
            IsAuthenticated(),
            HasActiveCompany(),
        ]

        if self.request.method == "PATCH":
            permissions.append(CanManageMemberships())

        return permissions

    def get_queryset(self):
        return (
            CompanyMembership.objects
            .filter(company=self.request.company)
            .select_related("user")
        )

    def get_object(self):
        return get_object_or_404(
            self.get_queryset(),
            id=self.kwargs["pk"],
        )

    def get_serializer_class(self):
        if self.request.method == "PATCH":
            return UpdateCompanyMemberSerializer

        return CompanyMemberSerializer

    def perform_update(self, serializer):
        target = self.get_object()
        actor = self.request.company_membership

        if target.id == actor.id:
            raise PermissionDenied(
                "You cannot modify your own membership."
            )

        if target.role == CompanyMembership.Role.OWNER:
            raise PermissionDenied(
                "Owner memberships cannot be modified here."
            )

        if actor.role == CompanyMembership.Role.ADMIN:
            if target.role != CompanyMembership.Role.MEMBER:
                raise PermissionDenied(
                    "Admins can only modify regular members."
                )

            if (
                "role" in serializer.validated_data
                and serializer.validated_data["role"] != CompanyMembership.Role.MEMBER
            ):
                raise PermissionDenied(
                    "Only an owner can assign administrative roles."
                )

        serializer.save()
