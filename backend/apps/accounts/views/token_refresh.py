from django.conf import settings
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect

from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenRefreshView

from apps.accounts.serializers.token_refresh import (
    CompanyTokenRefreshSerializer,
)
from apps.accounts.services.auth_cookies import (
    clear_refresh_cookie,
    set_refresh_cookie,
)


@method_decorator(csrf_protect, name="dispatch")
class CompanyTokenRefreshView(TokenRefreshView):
    permission_classes = [AllowAny]
    serializer_class = CompanyTokenRefreshSerializer

    def post(self, request, *args, **kwargs):
        refresh_token = request.COOKIES.get(
            settings.REFRESH_COOKIE_NAME
        )

        if not refresh_token:
            return Response(
                {"detail": "Refresh session not found."},
                status=401,
            )

        data = {
            "refresh": refresh_token,
        }

        company_id = request.data.get("company_id")

        if company_id is not None:
            data["company_id"] = company_id

        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)

        result = serializer.validated_data
        rotated_refresh = result.pop("refresh", None)

        response = Response(result)

        if rotated_refresh:
            set_refresh_cookie(response, rotated_refresh)

        return response