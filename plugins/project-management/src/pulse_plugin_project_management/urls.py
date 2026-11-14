
from django.urls import path

from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.memberships.permissions.company_access import HasActiveCompany
from apps.company_modules.permissions import HasInstalledModule

class ProjectManagementHomeView(APIView):
    permission_classes = [
        IsAuthenticated,
        HasActiveCompany,
        HasInstalledModule,
    ]

    module_key = "project_management"

    def get(self, request):
        return Response({
            "module": "Project Management",
            "status": "available",
            "company": {
                "id": request.company.id,
                "name": request.company.name,
            },
        })

urlpatterns = [
    path(
        "",
        ProjectManagementHomeView.as_view(),
        name="project-management-home",
    ),
]