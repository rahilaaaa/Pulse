from django.conf import settings
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.services.auth_cookies import clear_refresh_cookie


@method_decorator(csrf_protect, name="dispatch")
class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        refresh_token = request.COOKIES.get(
            settings.REFRESH_COOKIE_NAME
        )

        if refresh_token:
            try:
                refresh = RefreshToken(refresh_token)

                if str(refresh.payload.get("user_id")) != str(request.user.pk):
                    return Response(
                        {"detail": "Invalid refresh session."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                refresh.blacklist()

            except TokenError:
                # The refresh token may already be expired or blacklisted.
                pass

        response = Response(
            {"message": "Successfully logged out."},
            status=status.HTTP_200_OK,
        )

        clear_refresh_cookie(response)

        return response