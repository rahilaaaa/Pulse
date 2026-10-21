from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

urlpatterns = [
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    path("api/v1/", include("apps.identity.urls")),
    path("api/v1/", include("apps.tenants.urls")),
    path("api/v1/", include("apps.billing.urls")),
    path("api/v1/", include("apps.company_urls")),
    path("api/v1/", include("apps.platform_admin.urls")),
]
