
from rest_framework.generics import ListAPIView
from rest_framework.permissions import IsAuthenticated

from apps.memberships.models import CompanyMembership
from apps.memberships.serializers import CompanyMembershipSerializer
from apps.memberships.permissions.company_access import HasActiveCompany


class MyCompaniesView(ListAPIView):
    serializer_class = CompanyMembershipSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return (
            CompanyMembership.objects
            .filter(
                user=self.request.user,
                status=CompanyMembership.Status.ACTIVE,
                company__status="active",
            )
            .select_related("company")
            .order_by("company__name")
        )


from rest_framework.views import APIView
from rest_framework.response import Response


class CompanyContextTestView(APIView):
    permission_classes = [IsAuthenticated, HasActiveCompany]

    def get(self, request):
        return Response({
            "message": "Company access verified.",
            "company": {
                "id": request.company.id,
                "name": request.company.name,
            },
            "membership": {
                "id": request.company_membership.id,
                "role": request.company_membership.role,
            },
        })