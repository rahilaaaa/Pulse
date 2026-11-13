from django.http import JsonResponse
from django.urls import path


def project_management_home(request):
    return JsonResponse({
        "module": "Project Management",
        "status": "available",
    })


urlpatterns = [
    path("", project_management_home, name="project-management-home"),
]