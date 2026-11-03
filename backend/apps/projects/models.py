import uuid
from django.db import models


class ProjectStatus(models.TextChoices):
    PLANNING = "planning", "Planning"
    ACTIVE = "active", "Active"
    ON_HOLD = "on_hold", "On hold"
    COMPLETED = "completed", "Completed"
    CANCELLED = "cancelled", "Cancelled"
    ARCHIVED = "archived", "Archived"


class ProjectPriority(models.TextChoices):
    LOW = "low", "Low"
    MEDIUM = "medium", "Medium"
    HIGH = "high", "High"
    URGENT = "urgent", "Urgent"


class TaskStatus(models.TextChoices):
    BACKLOG = "backlog", "Backlog"
    TODO = "todo", "To do"
    IN_PROGRESS = "in_progress", "In progress"
    IN_REVIEW = "in_review", "In review"
    BLOCKED = "blocked", "Blocked"
    COMPLETED = "completed", "Completed"
    CANCELLED = "cancelled", "Cancelled"


class TaskPriority(models.TextChoices):
    LOW = "low", "Low"
    MEDIUM = "medium", "Medium"
    HIGH = "high", "High"
    URGENT = "urgent", "Urgent"


class MilestoneStatus(models.TextChoices):
    PLANNED = "planned", "Planned"
    IN_PROGRESS = "in_progress", "In progress"
    ACHIEVED = "achieved", "Achieved"
    MISSED = "missed", "Missed"


class MemberRole(models.TextChoices):
    MANAGER = "manager", "Project Manager"
    LEAD = "lead", "Technical / Team Lead"
    CONTRIBUTOR = "contributor", "Contributor"
    REVIEWER = "reviewer", "Reviewer / QA"
    VIEWER = "viewer", "Stakeholder / Viewer"


class TimesheetStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    SUBMITTED = "submitted", "Submitted"
    APPROVED = "approved", "Approved"
    REJECTED = "rejected", "Rejected"


class Project(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="projects")
    code = models.CharField(max_length=32, blank=True, default="")
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True, default="")
    status = models.CharField(max_length=32, choices=ProjectStatus.choices, default=ProjectStatus.ACTIVE)
    priority = models.CharField(max_length=16, choices=ProjectPriority.choices, default=ProjectPriority.MEDIUM)
    owner_person = models.ForeignKey(
        "organization.Person",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="owned_projects",
    )
    project_manager = models.ForeignKey(
        "organization.Person",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="managed_projects",
    )
    start_date = models.DateField(null=True, blank=True)
    due_date = models.DateField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    budget_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    currency = models.CharField(max_length=3, default="INR")
    progress_percentage = models.IntegerField(default=0)
    is_billable = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        "identity.User",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_projects",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "projects"
        constraints = [
            models.UniqueConstraint(fields=["company", "id"], name="projects_company_id_id_unique"),
        ]

    def __str__(self):
        return f"{self.code} - {self.name}" if self.code else self.name


class ProjectMember(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="project_memberships")
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="members")
    person = models.ForeignKey("organization.Person", on_delete=models.CASCADE, related_name="project_memberships")
    role = models.CharField(max_length=32, choices=MemberRole.choices, default=MemberRole.CONTRIBUTOR)
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "project_members"
        constraints = [
            models.UniqueConstraint(fields=["company", "id"], name="project_member_company_id_unique"),
            models.UniqueConstraint(fields=["project", "person"], name="project_member_project_person_unique"),
        ]


class ProjectOrganizationUnit(models.Model):
    """Links project to multiple participating departments/branches."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="project_org_units")
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="organization_units")
    department = models.ForeignKey(
        "organization.Department",
        on_delete=models.CASCADE,
        related_name="participating_projects",
    )
    is_primary = models.BooleanField(default=False)

    class Meta:
        db_table = "project_organization_units"
        constraints = [
            models.UniqueConstraint(fields=["company", "id"], name="project_dept_company_id_unique"),
            models.UniqueConstraint(fields=["project", "department"], name="project_dept_unique"),
        ]


class ProjectMilestone(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="project_milestones")
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="milestones")
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True, default="")
    due_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=32, choices=MilestoneStatus.choices, default=MilestoneStatus.PLANNED)
    achieved_at = models.DateTimeField(null=True, blank=True)
    order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "project_milestones"
        constraints = [
            models.UniqueConstraint(fields=["company", "id"], name="project_milestone_company_id_unique"),
        ]


class ProjectTask(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="project_tasks")
    project = models.ForeignKey(Project, null=True, blank=True, on_delete=models.CASCADE, related_name="tasks")
    code = models.CharField(max_length=32, blank=True, default="")
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    status = models.CharField(max_length=32, choices=TaskStatus.choices, default=TaskStatus.TODO)
    priority = models.CharField(max_length=16, choices=TaskPriority.choices, default=TaskPriority.MEDIUM)
    milestone = models.ForeignKey(
        ProjectMilestone,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="tasks",
    )
    parent_task = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="subtasks",
    )
    creator = models.ForeignKey(
        "identity.User",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_tasks",
    )
    creator_person = models.ForeignKey(
        "organization.Person",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_tasks",
    )
    assignee = models.ForeignKey(
        "organization.Person",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="project_tasks",
    )
    reviewer = models.ForeignKey(
        "organization.Person",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="reviewed_tasks",
    )
    start_date = models.DateField(null=True, blank=True)
    due_date = models.DateField(null=True, blank=True)
    estimated_hours = models.DecimalField(max_digits=6, decimal_places=2, default=0)
    actual_hours = models.DecimalField(max_digits=6, decimal_places=2, default=0)
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "project_tasks"
        constraints = [
            models.UniqueConstraint(fields=["company", "id"], name="project_tasks_company_id_id_unique"),
        ]

    def __str__(self):
        return f"{self.code} - {self.title}" if self.code else self.title


class TaskAssignee(models.Model):
    """Support for multiple assignees on a single task."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="task_assignees")
    task = models.ForeignKey(ProjectTask, on_delete=models.CASCADE, related_name="additional_assignees")
    person = models.ForeignKey("organization.Person", on_delete=models.CASCADE, related_name="assigned_tasks")
    is_primary = models.BooleanField(default=False)
    assigned_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "task_assignees"
        constraints = [
            models.UniqueConstraint(fields=["company", "id"], name="task_assignee_company_id_unique"),
            models.UniqueConstraint(fields=["task", "person"], name="task_person_assignee_unique"),
        ]


class TaskDependency(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="task_dependencies")
    task = models.ForeignKey(ProjectTask, on_delete=models.CASCADE, related_name="dependencies")
    depends_on = models.ForeignKey(ProjectTask, on_delete=models.CASCADE, related_name="dependent_tasks")
    dependency_type = models.CharField(max_length=32, default="finish_to_start")

    class Meta:
        db_table = "task_dependencies"
        constraints = [
            models.UniqueConstraint(fields=["company", "id"], name="task_dependency_company_id_unique"),
            models.UniqueConstraint(fields=["task", "depends_on"], name="task_dependency_pair_unique"),
        ]


class TaskComment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="task_comments")
    task = models.ForeignKey(ProjectTask, on_delete=models.CASCADE, related_name="comments")
    author_user = models.ForeignKey("identity.User", on_delete=models.CASCADE, related_name="task_comments")
    author_person = models.ForeignKey(
        "organization.Person",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="task_comments",
    )
    body = models.TextField()
    mentions = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "task_comments"
        constraints = [
            models.UniqueConstraint(fields=["company", "id"], name="task_comment_company_id_unique"),
        ]


class TaskAttachment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="task_attachments")
    task = models.ForeignKey(ProjectTask, on_delete=models.CASCADE, related_name="attachments")
    file_name = models.CharField(max_length=255)
    file_url = models.CharField(max_length=500, blank=True, default="")
    file_size = models.IntegerField(default=0)
    content_type = models.CharField(max_length=100, blank=True, default="")
    uploaded_by = models.ForeignKey("identity.User", on_delete=models.CASCADE, related_name="uploaded_task_attachments")
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "task_attachments"
        constraints = [
            models.UniqueConstraint(fields=["company", "id"], name="task_attachment_company_id_unique"),
        ]


class TaskActivityLog(models.Model):
    """Auditable state transitions and assignment history."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="task_activities")
    task = models.ForeignKey(ProjectTask, on_delete=models.CASCADE, related_name="activity_logs")
    actor_user = models.ForeignKey("identity.User", null=True, blank=True, on_delete=models.SET_NULL)
    action = models.CharField(max_length=64)  # created, status_changed, assignee_changed, comment_added, etc.
    field_name = models.CharField(max_length=64, blank=True, default="")
    old_value = models.TextField(blank=True, default="")
    new_value = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "task_activities"
        constraints = [
            models.UniqueConstraint(fields=["company", "id"], name="task_activity_company_id_unique"),
        ]


class ProjectTimeEntry(models.Model):
    """
    Project work timesheets.
    Separate from HRMS presence attendance (which measures shift presence).
    Timesheets measure project and task effort.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="project_time_entries")
    project = models.ForeignKey(Project, null=True, blank=True, on_delete=models.SET_NULL, related_name="time_entries")
    task = models.ForeignKey(ProjectTask, null=True, blank=True, on_delete=models.SET_NULL, related_name="time_entries")
    person = models.ForeignKey("organization.Person", on_delete=models.CASCADE, related_name="project_time_entries")
    user = models.ForeignKey("identity.User", null=True, blank=True, on_delete=models.SET_NULL)
    work_date = models.DateField()
    duration_minutes = models.IntegerField(default=0)
    description = models.TextField(blank=True, default="")
    is_billable = models.BooleanField(default=True)
    status = models.CharField(max_length=32, choices=TimesheetStatus.choices, default=TimesheetStatus.DRAFT)
    approver_person = models.ForeignKey(
        "organization.Person",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="approved_time_entries",
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True, default="")
    timer_started_at = models.DateTimeField(null=True, blank=True)  # live timer support
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "project_time_entries"
        constraints = [
            models.UniqueConstraint(fields=["company", "id"], name="project_time_entry_company_id_unique"),
        ]


class ProjectActivityLog(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="project_activities")
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="activities")
    actor_user = models.ForeignKey("identity.User", null=True, blank=True, on_delete=models.SET_NULL)
    action = models.CharField(max_length=64)
    details = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "project_activities"
        constraints = [
            models.UniqueConstraint(fields=["company", "id"], name="project_activity_company_id_unique"),
        ]


class ProjectSettings(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    company = models.ForeignKey("tenants.Company", on_delete=models.CASCADE, related_name="project_settings")
    project_code_prefix = models.CharField(max_length=16, default="PRJ")
    task_code_prefix = models.CharField(max_length=16, default="TSK")
    default_billable = models.BooleanField(default=True)
    timesheet_requires_approval = models.BooleanField(default=True)
    allow_standalone_tasks = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "project_settings"
        constraints = [
            models.UniqueConstraint(fields=["company"], name="project_settings_company_unique"),
        ]
