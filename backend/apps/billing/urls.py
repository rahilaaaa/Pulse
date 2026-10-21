from django.urls import path

from apps.identity.urls import session_view
from apps.billing.views import OnboardingPlanView, PlanCatalogView

urlpatterns = [
    path("plans/", PlanCatalogView.as_view(), name="plans"),
    path("onboarding/plan/", session_view(OnboardingPlanView), name="onboarding-plan"),
]
