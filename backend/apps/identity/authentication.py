from django.contrib.auth.models import AbstractBaseUser
from rest_framework.authentication import SessionAuthentication


class ActiveSessionAuthentication(SessionAuthentication):
    """Session authentication that ends the session when the account is deactivated."""

    def authenticate(self, request):
        user = getattr(request._request, "user", None)
        if isinstance(user, AbstractBaseUser) and user.is_active and user.is_authenticated:
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
