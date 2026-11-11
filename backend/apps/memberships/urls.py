
from django.urls import path

from apps.memberships.views import MyCompaniesView
from apps.memberships.selection_views import ActiveCompanyView

app_name = "memberships"

urlpatterns = [
    path("my-companies/", MyCompaniesView.as_view(), name="my-companies"),
    path("select-company/", ActiveCompanyView.as_view(), name="select-company"),
]
