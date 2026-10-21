from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.identity.password_reset import confirm_password_reset, request_password_reset
from apps.identity.registration import confirm_verification, email_delivery, register_user, resend_verification
from apps.identity.serializers import serialize_current_user


class RegisterView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        body = request.data if isinstance(request.data, dict) else {}
        user = register_user(
            request=request,
            email_raw=body.get("email", ""),
            password=body.get("password", ""),
            first_name=body.get("first_name", ""),
            last_name=body.get("last_name", ""),
        )
        payload = serialize_current_user(user)
        payload.pop("memberships", None)
        payload.pop("platform_permissions", None)
        return Response(
            {
                "id": payload["id"],
                "email": payload["email"],
                "first_name": payload["first_name"],
                "last_name": payload["last_name"],
                "email_verified": payload["email_verified"],
                "email_delivery": email_delivery(),
            },
            status=201,
        )


class EmailVerificationResendView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        resend_verification(request=request, user=request.user)
        return Response({"status": "sent", "delivery": email_delivery()}, status=202)


class PasswordResetRequestView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        body = request.data if isinstance(request.data, dict) else {}
        request_password_reset(request=request, email_raw=body.get("email", ""))
        return Response({"status": "accepted"})


class PasswordResetConfirmView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        body = request.data if isinstance(request.data, dict) else {}
        confirm_password_reset(token=body.get("token", ""), password=body.get("password", ""))
        return Response({"reset": True})


class EmailVerificationConfirmView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        body = request.data if isinstance(request.data, dict) else {}
        confirm_verification(token=body.get("token", ""))
        return Response({"email_verified": True})
