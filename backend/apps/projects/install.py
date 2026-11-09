from apps.audit.models import AuditLog
from apps.projects.models import (
    MemberRole,
    Project,
    ProjectMember,
    ProjectPriority,
    ProjectSettings,
    ProjectStatus,
    ProjectTask,
    TaskPriority,
    TaskStatus,
)


def on_install(*, company, user):
    """
    Called when Projects module is installed for a company.
    Idempotent initialization.
    """
    settings, _ = ProjectSettings.objects.get_or_create(
        company=company,
        defaults={
            "project_code_prefix": "PRJ",
            "task_code_prefix": "TSK",
            "default_billable": True,
            "timesheet_requires_approval": True,
            "allow_standalone_tasks": True,
        },
    )

    # If workspace has zero projects, create a sample starter project
    if not Project.objects.filter(company=company).exists():
        caller_person = getattr(user, "person", None)
        if not caller_person:
            from apps.organization.models import Person
            caller_person = Person.objects.filter(company=company).first()

        sample_project = Project.objects.create(
            company=company,
            code="PRJ-001",
            name="Workspace Onboarding & Launch",
            description="Default initiatives and tasks to set up work management workflows for the company.",
            status=ProjectStatus.ACTIVE,
            priority=ProjectPriority.HIGH,
            owner_person=caller_person,
            project_manager=caller_person,
            created_by=user,
        )

        if caller_person:
            ProjectMember.objects.get_or_create(
                company=company,
                project=sample_project,
                person=caller_person,
                defaults={"role": MemberRole.MANAGER},
            )

        ProjectTask.objects.create(
            company=company,
            project=sample_project,
            code="TSK-001",
            title="Configure Project Management & Team Workspaces",
            description="Review project settings, establish departments, and invite team members to collaborate.",
            status=TaskStatus.TODO,
            priority=TaskPriority.HIGH,
            assignee=caller_person,
            creator=user,
        )

    AuditLog.objects.create(
        company=company,
        actor=user,
        action="projects.module_installed",
        object_type="module",
        object_id=company.id,
        after={"module": "projects", "version": "1.0.0"},
    )
    return None


def on_uninstall(*, company, user):
    """
    Called when Projects module is uninstalled.
    Preserves all business data (projects, tasks, timesheets) per ADR-011.
    """
    AuditLog.objects.create(
        company=company,
        actor=user,
        action="projects.module_uninstalled",
        object_type="module",
        object_id=company.id,
        after={"module": "projects", "data_preserved": True},
    )
    return None
