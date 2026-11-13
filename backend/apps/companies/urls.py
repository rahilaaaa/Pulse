
from django.urls import path

from apps.companies.views import (CompanyProfileView,CompanyOnboardingSetupView,CompanyOnboardingStatusView,)

app_name = "companies"

urlpatterns = [
    path("profile/", CompanyProfileView.as_view(), name="profile"),
    path("onboarding/setup/",CompanyOnboardingSetupView.as_view(),name="onboarding-setup",),
    path("onboarding/status/",CompanyOnboardingStatusView.as_view(),name="onboarding-status",),
]
