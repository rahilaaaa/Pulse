from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.authorization.company import require_permission
from apps.modules_registry.services import catalog_for_company, install_module


class ModuleCatalogView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = require_permission(request.user, company_id, "modules.view")
        return Response(catalog_for_company(membership.company))


class ModuleInstallView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, company_id, slug):
        membership = require_permission(request.user, company_id, "modules.install")
        return Response(install_module(user=request.user, company=membership.company, slug=slug, request=request, enforce_permission=False))
