from django.contrib.auth import get_user_model

from rest_framework import serializers
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.exceptions import InvalidToken
from rest_framework_simplejwt.settings import api_settings
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from apps.memberships.models import CompanyMembership


User = get_user_model()


class CompanyTokenRefreshSerializer(TokenRefreshSerializer):
    company_id = serializers.IntegerField(
        min_value=1,
        required=False,
    )

    def validate(self, attrs):
        try:
            refresh = RefreshToken(attrs["refresh"])
        except Exception as exc:
            raise InvalidToken(
                "Invalid or expired refresh token."
            ) from exc

        user_id = refresh.payload.get(api_settings.USER_ID_CLAIM)

        user = User.objects.filter(
            **{api_settings.USER_ID_FIELD: user_id}
        ).first()

        if user is None or not api_settings.USER_AUTHENTICATION_RULE(user):
            raise AuthenticationFailed("User account is not active.")

        membership = None

        if attrs.get("company_id") is not None:
            membership = (
                CompanyMembership.objects
                .filter(
                    user=user,
                    company_id=attrs["company_id"],
                    status=CompanyMembership.Status.ACTIVE,
                    company__status="active",
                )
                .first()
            )

            if membership is None:
                raise AuthenticationFailed(
                    "You do not have access to this active company."
                )

        # Perform SimpleJWT rotation and blacklist handling.
        data = super().validate(attrs)

        if membership:
            access = AccessToken.for_user(user)
            access["company_id"] = membership.company_id
            access["membership_id"] = membership.id

            data["access"] = str(access)

        return data