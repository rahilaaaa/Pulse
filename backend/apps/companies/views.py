from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework.generics import RetrieveUpdateAPIView
from rest_framework.permissions import IsAuthenticated
from apps.memberships.models import CompanyMembership
from rest_framework.views import APIView
from rest_framework.response import Response
from apps.companies.serializers.onboarding import (CompanyOnboardingSetupSerializer,)
from apps.companies.permissions import CanManageCompany
from apps.companies.serializers.company import CompanyProfileSerializer
from apps.memberships.permissions.company_access import HasActiveCompany
from rest_framework import status
from django.utils import timezone
from apps.companies.models import Company



class CompanyProfileView(RetrieveUpdateAPIView):
    serializer_class = CompanyProfileSerializer
    http_method_names = ["get", "patch", "head", "options"]

    def get_permissions(self):
        permissions = [
            IsAuthenticated(),
            HasActiveCompany(),
        ]

        if self.request.method == "PATCH":
            permissions.append(CanManageCompany())

        return permissions

    def get_object(self):
        return self.request.company




class CompanyOnboardingSetupView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not request.user.is_active or not request.user.email_verified_at:
            return Response(
                {"detail": "Please verify your email before setting up a company."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = CompanyOnboardingSetupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        User = get_user_model()

        with transaction.atomic():
            # Lock the user row to prevent concurrent initial company creation.
            user = User.objects.select_for_update().get(pk=request.user.pk)

            if CompanyMembership.objects.filter(user=user).exists():
                return Response(
                    {"detail": "You already have a company membership."},
                    status=status.HTTP_409_CONFLICT,
                )

            company = Company.objects.create(
                **serializer.validated_data,
                status=Company.Status.ACTIVE,
                onboarding_completed=False,
            )

            membership = CompanyMembership.objects.create(
                user=user,
                company=company,
                role=CompanyMembership.Role.OWNER,
                status=CompanyMembership.Status.ACTIVE,
                joined_at=timezone.now(),
            )

        return Response(
            {
                "message": "Company created successfully.",
                "company": CompanyProfileSerializer(company).data,
                "membership": {
                    "id": membership.id,
                    "role": membership.role,
                    "status": membership.status,
                },
            },
            status=status.HTTP_201_CREATED,
        )

class CompanyOnboardingStatusView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user

        if not user.is_active or not user.email_verified_at:
            return Response(
                {
                    "step": "email_verification_required",
                    "onboarding_required": True,
                },
                status=status.HTTP_200_OK,
            )

        memberships = CompanyMembership.objects.filter(
            user=user,
        ).select_related("company")

        active_memberships = memberships.filter(
            status=CompanyMembership.Status.ACTIVE,
            company__status=Company.Status.ACTIVE,
        )

        if not active_memberships.exists():
            # Don't treat a user with an existing but suspended/removed
            # membership as a brand-new user.
            if memberships.exists():
                return Response({
                    "step": "access_unavailable",
                    "onboarding_required": False,
                })

            return Response({
                "step": "company_setup",
                "onboarding_required": True,
            })

        if active_memberships.count() > 1:
            return Response({
                "step": "company_selection",
                "onboarding_required": False,
            })

        membership = active_memberships.first()
        company = membership.company

        if not company.onboarding_completed:
            if membership.role == CompanyMembership.Role.OWNER:
                step = "module_selection"
            else:
                step = "company_onboarding_incomplete"

            return Response({
                "step": step,
                "onboarding_required": True,
                "company": {
                    "id": company.id,
                    "name": company.name,
                },
                "membership": {
                    "id": membership.id,
                    "role": membership.role,
                },
            })

        return Response({
            "step": "dashboard",
            "onboarding_required": False,
            "company": {
                "id": company.id,
                "name": company.name,
            },
            "membership": {
                "id": membership.id,
                "role": membership.role,
            },
        })
