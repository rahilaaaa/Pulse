from django.contrib.auth.models import AbstractBaseUser
from django.core.exceptions import ObjectDoesNotExist
from rest_framework.authentication import SessionAuthentication


class ActiveSessionAuthentication(SessionAuthentication):
    """Session authentication that ends the session when the account is deactivated or suspended."""

    def authenticate(self, request):
        user = getattr(request._request, "user", None)
        if isinstance(user, AbstractBaseUser) and user.is_active and user.is_authenticated:
            # Check platform operator profile status and session version
            profile = getattr(user, "platform_profile", None)
            if profile is None:
                try:
                    profile = user.platform_profile
                except (ObjectDoesNotExist, AttributeError):
                    profile = None

            if profile is not None:
                if profile.status in ("suspended", "deactivated"):
                    if request.session.get("_auth_user_id"):
                        request.session.flush()
                    return None

                sess_ver = request.session.get("session_version")
                if sess_ver is not None and sess_ver != profile.session_version:
                    if request.session.get("_auth_user_id"):
                        request.session.flush()
                    return None

            if request.method not in ("GET", "HEAD", "OPTIONS", "TRACE"):
                self.enforce_csrf(request)
            return (user, None)

        # Django will not load an inactive or deleted account. Drop the stale session.
        if request.session.get("_auth_user_id"):
            request.session.flush()
        return None

    def authenticate_header(self, request):
        # DRF turns 401 into 403 unless the authenticator provides a challenge.
        return "Session"
