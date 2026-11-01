from django.contrib.auth import logout
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.identity.serializers import normalize_email, serialize_current_user
from apps.identity.services import (
    SIGN_IN_FAILED,
    authenticate_credentials,
    clear_login_throttle,
    client_ip,
    complete_login,
    enforce_login_throttle,
    record_login_attempt,
)
from common.api.errors import not_authenticated, validation_error


class CsrfView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    @method_decorator(ensure_csrf_cookie)
    def get(self, request):
        return Response({"csrf_token": request.META.get("CSRF_COOKIE", "")})


class LoginView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        email_raw = request.data.get("email", "")
        password = request.data.get("password", "")
        details = []
        if not isinstance(email_raw, str) or "@" not in email_raw or not email_raw.strip():
            details.append({"field": "email", "code": "invalid", "message": "Enter a valid email address."})
        if not isinstance(password, str) or password == "":
            details.append({"field": "password", "code": "required", "message": "Enter a password."})
        if details:
            raise validation_error(details)

        email = normalize_email(email_raw)
        ip = client_ip(request)
        enforce_login_throttle(ip=ip, email=email)
        record_login_attempt(ip=ip, email=email)
        user = authenticate_credentials(email=email, password=password)
        if user is None:
            raise not_authenticated(SIGN_IN_FAILED)

        clear_login_throttle(ip=ip, email=email)
        complete_login(request, user)
        return Response(serialize_current_user(user))


class LogoutView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        logout(request)
        return Response(status=204)


class MeView(APIView):
    def get(self, request):
        return Response(serialize_current_user(request.user))
