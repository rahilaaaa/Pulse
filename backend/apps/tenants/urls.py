from django.urls import path

from apps.identity.urls import session_view
from apps.tenants.views import (
    MemberCompanyDetailView,
    MemberCompanyListView,
    OnboardingBillingProfileView,
    OnboardingModulesView,
    OnboardingCompanyCreateView,
    OnboardingCompanyProfileView,
    OnboardingView,
)

urlpatterns = [
    path("onboarding/", OnboardingView.as_view(), name="onboarding"),
    path("onboarding/modules/", session_view(OnboardingModulesView), name="onboarding-modules"),
    path("onboarding/company/", session_view(OnboardingCompanyCreateView), name="onboarding-company"),
    path("onboarding/company-profile/", session_view(OnboardingCompanyProfileView), name="onboarding-company-profile"),
    path("onboarding/billing-profile/", session_view(OnboardingBillingProfileView), name="onboarding-billing-profile"),
    path("companies/", MemberCompanyListView.as_view(), name="member-companies"),
    path("companies/<uuid:company_id>/", MemberCompanyDetailView.as_view(), name="member-company"),
]
