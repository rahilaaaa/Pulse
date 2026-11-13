
from django.urls import path

from . import views

app_name = "company_modules"

urlpatterns = [
    path(
        "available/",
        views.AvailableModulesView.as_view(),
        name="available",
    ),
    path(
        "",
        views.CompanyModulesView.as_view(),
        name="list",
    ),
    path(
        "install/",
        views.InstallCompanyModuleView.as_view(),
        name="install",
    ),
    path(
        "uninstall/",
        views.UninstallCompanyModuleView.as_view(),
        name="uninstall",
    ),
]
