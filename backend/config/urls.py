
from django.contrib import admin
from django.conf import settings
from django.urls import include, path


urlpatterns = [
    path("admin/", admin.site.urls),

    # Pulse Core APIs
    path("api/accounts/", include("apps.accounts.urls")),
    path("api/memberships/", include("apps.memberships.urls")),
    path("api/companies/", include("apps.companies.urls")),
    path("api/invitations/", include("apps.invitations.urls")),
    path("api/company-modules/",include("apps.company_modules.urls"),
),
]


# Dynamically register discovered plugin API routes.
for manifest in settings.PULSE_PLUGIN_REGISTRY.get_all_plugins():
    urlpatterns.append(
        path(
            f"api/plugins/{manifest.url_prefix}/",
            include(manifest.url_module),
        )
    )
