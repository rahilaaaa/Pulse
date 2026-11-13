
from django.urls import path

from apps.memberships.views import MyCompaniesView
from apps.memberships.selection_views import ActiveCompanyView
from apps.memberships.views import CompanyContextTestView
from apps.memberships.management_views import (
    CompanyMemberListView,
    CompanyMemberDetailView,
)

app_name = "memberships"

urlpatterns = [
    path("my-companies/", MyCompaniesView.as_view(), name="my-companies"),
    path("select-company/", ActiveCompanyView.as_view(), name="select-company"),
    path("company-context/",CompanyContextTestView.as_view(),name="company-context"),
    path("members/", CompanyMemberListView.as_view(), name="company-members"),
    path("members/<int:pk>/", CompanyMemberDetailView.as_view(), name="company-member-detail"),
]
