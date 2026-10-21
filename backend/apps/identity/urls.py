from django.urls import path

from apps.identity.registration_views import (
    EmailVerificationConfirmView,
    EmailVerificationResendView,
    PasswordResetConfirmView,
    PasswordResetRequestView,
    RegisterView,
)
from apps.identity.views import CsrfView, LoginView, LogoutView, MeView, MfaView
from apps.platform_admin.health import HealthView


def session_view(view_cls):
    """Keep Django's CSRF middleware active. DRF marks API views exempt by default."""
    view = view_cls.as_view()
    view.csrf_exempt = False
    return view


urlpatterns = [
    path("health/", HealthView.as_view(), name="health"),
    path("auth/csrf/", CsrfView.as_view(), name="auth-csrf"),
    path("auth/register/", session_view(RegisterView), name="auth-register"),
    path("auth/login/", session_view(LoginView), name="auth-login"),
    path("auth/password-resets/", session_view(PasswordResetRequestView), name="auth-password-reset"),
    path("auth/password-resets/confirm/", session_view(PasswordResetConfirmView), name="auth-password-reset-confirm"),
    path("auth/email-verifications/", session_view(EmailVerificationResendView), name="auth-email-verification"),
    path(
        "auth/email-verifications/confirm/",
        session_view(EmailVerificationConfirmView),
        name="auth-email-verification-confirm",
    ),
    path("auth/mfa/", session_view(MfaView), name="auth-mfa"),
    path("auth/logout/", session_view(LogoutView), name="auth-logout"),
    path("auth/me/", MeView.as_view(), name="auth-me"),
]
