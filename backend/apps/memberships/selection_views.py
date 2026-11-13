
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.memberships.models import CompanyMembership
from apps.memberships.selection_serializers import (
    CompanySelectionSerializer,
)
from apps.memberships.services import create_company_access_token

class ActiveCompanyView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = CompanySelectionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        company_id = serializer.validated_data["company_id"]

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
            return Response(
                {"message": "You do not have access to this company."},
                status=status.HTTP_403_FORBIDDEN,
            )

        access_token = create_company_access_token(
            request.user,
            membership,
        )

        return Response(
            {
                "message": "Company selected successfully.",
                "active_company": {
                    "id": membership.company.id,
                    "name": membership.company.name,
                    "role": membership.role,
                },
                "access": access_token,
            },
            status=status.HTTP_200_OK,
        )