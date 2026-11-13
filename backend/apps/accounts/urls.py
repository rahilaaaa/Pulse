
from django.urls import path

from apps.accounts.views.email_verification import EmailVerificationView
from apps.accounts.views.registration import CompanyRegistrationView
from apps.accounts.views.login import LoginView
from apps.accounts.views.profile import CurrentUserView
from apps.accounts.views.token_refresh import CompanyTokenRefreshView
from apps.accounts.views.logout import LogoutView
from apps.accounts.views.csrf import CsrfTokenView
from apps.accounts.views.password_reset import (
    ForgotPasswordView,
    ResetPasswordView,
)


app_name = "accounts"

urlpatterns = [
    path("register/", CompanyRegistrationView.as_view(), name="register"),
    path("verify-email/",EmailVerificationView.as_view(),name="verify-email"),
    path("login/", LoginView.as_view(), name="login"),
    path("me/", CurrentUserView.as_view(), name="me"),
    path("token/refresh/",CompanyTokenRefreshView.as_view(),name="token-refresh"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("csrf/", CsrfTokenView.as_view(), name="csrf"),
    path("password/forgot/",ForgotPasswordView.as_view(),name="password-forgot"),
    path("password/reset/",ResetPasswordView.as_view(),name="password-reset"),
]
