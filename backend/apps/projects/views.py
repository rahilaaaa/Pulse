from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.authorization.company import require_permission
from apps.modules_registry.models import CompanyModuleInstallation, InstallationStatus
from apps.organization.models import Person
from apps.projects.models import Project, ProjectStatus, ProjectTask, TaskStatus
from common.api.errors import not_found, validation_error


def _installed(company):
    if not CompanyModuleInstallation.objects.filter(
        company=company, module_id="projects", status=InstallationStatus.INSTALLED
    ).exists():
        raise not_found("Projects is not installed.")


def _project_payload(row: Project) -> dict:
    return {
        "id": str(row.id),
        "name": row.name,
        "description": row.description,
        "status": row.status,
        "owner_person_id": str(row.owner_person_id) if row.owner_person_id else None,
        "task_count": row.tasks.count(),
    }


class ProjectListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = require_permission(request.user, company_id, "projects.view")
        _installed(membership.company)
        rows = Project.objects.filter(company=membership.company).order_by("-created_at")
        return Response({"results": [_project_payload(row) for row in rows]})

    def post(self, request, company_id):
        membership = require_permission(request.user, company_id, "projects.manage")
        _installed(membership.company)
        name = (request.data.get("name") or "").strip()
        if not name:
            raise validation_error([{"field": "name", "code": "required", "message": "Enter a project name."}])
        owner = None
        owner_id = request.data.get("owner_person_id")
        if owner_id:
            owner = Person.objects.filter(company=membership.company, pk=owner_id).first()
            if owner is None:
                raise not_found("That person was not found.")
        row = Project.objects.create(
            company=membership.company,
            name=name[:200],
            description=(request.data.get("description") or "")[:5000],
            owner_person=owner or membership.person,
        )
        return Response(_project_payload(row), status=201)


class ProjectDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id, project_id):
        membership = require_permission(request.user, company_id, "projects.view")
        _installed(membership.company)
        row = Project.objects.filter(company=membership.company, pk=project_id).first()
        if row is None:
            raise not_found()
        tasks = [
            {
                "id": str(task.id),
                "title": task.title,
                "status": task.status,
                "assignee_id": str(task.assignee_id) if task.assignee_id else None,
            }
            for task in row.tasks.order_by("created_at")
        ]
        payload = _project_payload(row)
        payload["tasks"] = tasks
        return Response(payload)

    def patch(self, request, company_id, project_id):
        membership = require_permission(request.user, company_id, "projects.manage")
        _installed(membership.company)
        row = Project.objects.filter(company=membership.company, pk=project_id).first()
        if row is None:
            raise not_found()
        if "name" in request.data:
            name = (request.data.get("name") or "").strip()
            if not name:
                raise validation_error([{"field": "name", "code": "required", "message": "Enter a project name."}])
            row.name = name[:200]
        if "description" in request.data:
            row.description = (request.data.get("description") or "")[:5000]
        if "status" in request.data:
            status = request.data.get("status")
            if status not in {choice.value for choice in ProjectStatus}:
                raise validation_error([{"field": "status", "code": "invalid", "message": "Invalid status."}])
            row.status = status
        row.save()
        return Response(_project_payload(row))


class ProjectTaskListView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, company_id, project_id):
        membership = require_permission(request.user, company_id, "projects.manage")
        _installed(membership.company)
        project = Project.objects.filter(company=membership.company, pk=project_id).first()
        if project is None:
            raise not_found()
        title = (request.data.get("title") or "").strip()
        if not title:
            raise validation_error([{"field": "title", "code": "required", "message": "Enter a task title."}])
        assignee = None
        assignee_id = request.data.get("assignee_id")
        if assignee_id:
            assignee = Person.objects.filter(company=membership.company, pk=assignee_id).first()
            if assignee is None:
                raise not_found("That person was not found.")
        task = ProjectTask.objects.create(
            company=membership.company,
            project=project,
            title=title[:255],
            status=request.data.get("status") or TaskStatus.TODO,
            assignee=assignee,
        )
        return Response(
            {
                "id": str(task.id),
                "title": task.title,
                "status": task.status,
                "assignee_id": str(task.assignee_id) if task.assignee_id else None,
            },
            status=201,
        )
