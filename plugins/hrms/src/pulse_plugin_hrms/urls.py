
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from django.urls import path


from apps.memberships.permissions.company_access import HasActiveCompany
from apps.company_modules.permissions import HasInstalledModule


class HRMSHomeView(APIView):
    permission_classes = [
        IsAuthenticated,
        HasActiveCompany,
        HasInstalledModule,
    ]

    module_key = "hrms"

    def get(self, request):
        return Response({
            "module": "HRMS",
            "status": "available",
            "company": {
                "id": request.company.id,
                "name": request.company.name,
            },
        })


urlpatterns = [
    path("", HRMSHomeView.as_view(), name="hrms-home"),
]
