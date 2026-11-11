
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.services.email_verification import (
    verify_email_token,
)


class EmailVerificationView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        token = request.data.get("token")

        if not isinstance(token, str) or not token:
            return Response(
                {"message": "A verification token is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        verified = verify_email_token(token)

        if not verified:
            return Response(
                {
                    "message": (
                        "The verification link is invalid, expired, "
                        "or has already been used."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            {"message": "Email verified successfully. Your account is active."},
            status=status.HTTP_200_OK,
        )
