
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.serializers.registration import (
    CompanyRegistrationSerializer,
)
from apps.accounts.services.registration import register_company


class CompanyRegistrationView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = CompanyRegistrationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        result = register_company(serializer.validated_data)

        # Email delivery will be connected in the next step.
        return Response(
            {
                "message": (
                    "Registration received. "
                    "Please verify your email to activate your account."
                ),
                "data": {
                    "company_id": result["company"].id,
                    "user_id": result["user"].id,
                    "email": result["user"].email,
                },
            },
            status=status.HTTP_201_CREATED,
        )
