
from rest_framework.generics import ListAPIView
from rest_framework.permissions import IsAuthenticated

from apps.memberships.models import CompanyMembership
from apps.memberships.serializers import CompanyMembershipSerializer


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
