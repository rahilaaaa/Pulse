import uuid

from django.db import models


class ProjectStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    ON_HOLD = "on_hold", "On hold"
    COMPLETED = "completed", "Completed"
    ARCHIVED = "archived", "Archived"


class TaskStatus(models.TextChoices):
    TODO = "todo", "To do"
    IN_PROGRESS = "in_progress", "In progress"
    DONE = "done", "Done"


class Project(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="projects")
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True, default="")
    status = models.CharField(max_length=32, choices=ProjectStatus.choices, default=ProjectStatus.ACTIVE)
    owner_person = models.ForeignKey(
        "organization.Person",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="owned_projects",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "projects"
        constraints = [
            models.UniqueConstraint(fields=["company", "id"], name="projects_company_id_id_unique"),
            models.CheckConstraint(
                condition=models.Q(status__in=[choice.value for choice in ProjectStatus]),
                name="projects_status_valid",
            ),
        ]


class ProjectTask(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="project_tasks")
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="tasks")
    title = models.CharField(max_length=255)
    status = models.CharField(max_length=32, choices=TaskStatus.choices, default=TaskStatus.TODO)
    assignee = models.ForeignKey(
        "organization.Person",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="project_tasks",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "project_tasks"
        constraints = [
            models.UniqueConstraint(fields=["company", "id"], name="project_tasks_company_id_id_unique"),
            models.CheckConstraint(
                condition=models.Q(status__in=[choice.value for choice in TaskStatus]),
                name="project_tasks_status_valid",
            ),
        ]
