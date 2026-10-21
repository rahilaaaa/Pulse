from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.billing.services import list_public_plans, select_plan


class PlanCatalogView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        return Response(list_public_plans())


class OnboardingPlanView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        return Response(select_plan(user=request.user, payload=request.data, request=request))
