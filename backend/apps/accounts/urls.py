
from django.urls import path

from apps.accounts.views.email_verification import EmailVerificationView
from apps.accounts.views.registration import CompanyRegistrationView
from apps.accounts.views.login import LoginView
from apps.accounts.views.profile import CurrentUserView

app_name = "accounts"

urlpatterns = [
    path("register/", CompanyRegistrationView.as_view(), name="register"),
    path("verify-email/",EmailVerificationView.as_view(),name="verify-email"),
    path("login/", LoginView.as_view(), name="login"),
    path("me/", CurrentUserView.as_view(), name="me"),
]
