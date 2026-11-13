
from django.core.exceptions import ValidationError as DjangoValidationError

from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.services.password_reset import (
    request_password_reset,
    reset_password,
)


class ForgotPasswordSerializer(serializers.Serializer):
    email = serializers.EmailField()


class ResetPasswordSerializer(serializers.Serializer):
    token = serializers.CharField(
        write_only=True,
        trim_whitespace=True,
    )

    new_password = serializers.CharField(
        write_only=True,
        trim_whitespace=False,
        min_length=12,
    )


class ForgotPasswordView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        serializer = ForgotPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        request_password_reset(
            serializer.validated_data["email"]
        )

        return Response(
            {
                "message": (
                    "If an eligible account exists for that email, "
                    "you will receive password reset instructions."
                )
            },
            status=status.HTTP_200_OK,
        )


class ResetPasswordView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        serializer = ResetPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            reset_password(
                raw_token=serializer.validated_data["token"],
                new_password=serializer.validated_data["new_password"],
            )
        except DjangoValidationError as error:
            return Response(
                {"message": " ".join(error.messages)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            {
                "message": (
                    "Your password has been reset successfully. "
                    "You can now sign in with your new password."
                )
            },
            status=status.HTTP_200_OK,
        )
