import uuid
from decimal import Decimal
from django.db import transaction
from django.db.models import Count, Q, Sum
from django.utils import timezone

from apps.audit.models import AuditLog
from apps.authorization.company import effective_permission_codes, require_membership, require_permission
from apps.modules_registry.models import CompanyModuleInstallation, InstallationStatus
from apps.organization.models import Department, Person
from apps.projects.models import (
    MemberRole,
    MilestoneStatus,
    Project,
    ProjectActivityLog,
    ProjectMember,
    ProjectMilestone,
    ProjectOrganizationUnit,
    ProjectPriority,
    ProjectSettings,
    ProjectStatus,
    ProjectTask,
    ProjectTimeEntry,
    TaskActivityLog,
    TaskAssignee,
    TaskAttachment,
    TaskComment,
    TaskDependency,
    TaskPriority,
    TaskStatus,
    TimesheetStatus,
)
from apps.tenants.models import CompanyMembership, CompanyNotification, NotificationCategory
from apps.tenants.services import _ip, _request_id
from common.api.errors import conflict, not_found, validation_error


def ensure_projects_installed(company):
    if not CompanyModuleInstallation.objects.filter(
        company=company, module_id="projects", status=InstallationStatus.INSTALLED
    ).exists():
        raise not_found("Projects module is not installed for this company.")


def get_or_create_settings(company) -> ProjectSettings:
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
    return settings


def generate_project_code(company) -> str:
    settings = get_or_create_settings(company)
    prefix = settings.project_code_prefix or "PRJ"
    count = Project.objects.filter(company=company).count() + 1
    return f"{prefix}-{count:03d}"


def generate_task_code(company) -> str:
    settings = get_or_create_settings(company)
    prefix = settings.task_code_prefix or "TSK"
    count = ProjectTask.objects.filter(company=company).count() + 1
    return f"{prefix}-{count:03d}"


def _format_date(val):
    if not val:
        return None
    return val.isoformat() if hasattr(val, "isoformat") else str(val)


def _send_notification_to_person(company, person, title, body, kind="task_assigned"):
    if not person:
        return
    try:
        mem = CompanyMembership.objects.filter(company=company, person=person, status="active").select_related("user").first()
        if mem and mem.user:
            category_val = NotificationCategory.WORK if hasattr(NotificationCategory, "WORK") else "work"
            CompanyNotification.objects.create(
                company=company,
                recipient=mem.user,
                category=category_val,
                kind=kind,
                title=title,
                body=body,
            )
    except Exception:
        pass


# ----------------------------------------------------------------------
# Project Management
# ----------------------------------------------------------------------

def list_projects(company, user, *, status=None, priority=None, search=None, department_id=None):
    ensure_projects_installed(company)
    membership = require_membership(user, company.id)
    perms = effective_permission_codes(membership)

    qs = Project.objects.filter(company=company).select_related(
        "owner_person", "project_manager", "created_by"
    ).prefetch_related("members__person", "organization_units__department")

    is_admin = "projects.manage" in perms or "projects.admin" in perms or "administrator" in perms or "owner" in perms
    if not is_admin and membership.person_id:
        person_id = membership.person_id
        qs = qs.filter(
            Q(owner_person_id=person_id)
            | Q(project_manager_id=person_id)
            | Q(members__person_id=person_id)
        ).distinct()

    if status:
        qs = qs.filter(status=status)
    if priority:
        qs = qs.filter(priority=priority)
    if department_id:
        qs = qs.filter(organization_units__department_id=department_id)
    if search:
        q = search.strip()
        qs = qs.filter(Q(name__icontains=q) | Q(code__icontains=q) | Q(description__icontains=q))

    results = []
    for p in qs.order_by("-created_at"):
        results.append(_project_summary_payload(p))
    return {"results": results}


def create_project(company, user, data, request=None):
    ensure_projects_installed(company)
    require_permission(user, company.id, "projects.manage")

    name = (data.get("name") or "").strip()
    if not name:
        raise validation_error([{"field": "name", "code": "required", "message": "Project name is required."}])

    code = (data.get("code") or "").strip() or generate_project_code(company)
    description = (data.get("description") or "")[:5000]
    status = data.get("status") or ProjectStatus.ACTIVE
    priority = data.get("priority") or ProjectPriority.MEDIUM
    start_date = data.get("start_date") or None
    due_date = data.get("due_date") or None
    budget_amount = Decimal(str(data.get("budget_amount") or 0))
    currency = data.get("currency") or "INR"
    is_billable = bool(data.get("is_billable", True))

    owner_person = None
    if data.get("owner_person_id"):
        owner_person = Person.objects.filter(company=company, pk=data["owner_person_id"]).first()
        if not owner_person:
            raise not_found("Owner person not found in company directory.")

    project_manager = None
    if data.get("project_manager_id"):
        project_manager = Person.objects.filter(company=company, pk=data["project_manager_id"]).first()
        if not project_manager:
            raise not_found("Project manager not found in company directory.")

    with transaction.atomic():
        project = Project.objects.create(
            company=company,
            code=code,
            name=name[:200],
            description=description,
            status=status,
            priority=priority,
            owner_person=owner_person,
            project_manager=project_manager,
            start_date=start_date,
            due_date=due_date,
            budget_amount=budget_amount,
            currency=currency,
            is_billable=is_billable,
            created_by=user,
        )

        # Add PM as initial member
        if project_manager:
            ProjectMember.objects.get_or_create(
                company=company,
                project=project,
                person=project_manager,
                defaults={"role": MemberRole.MANAGER},
            )

        # Connect participating departments
        dept_ids = data.get("department_ids") or []
        for d_id in dept_ids:
            dept = Department.objects.filter(company=company, pk=d_id).first()
            if dept:
                ProjectOrganizationUnit.objects.get_or_create(
                    company=company,
                    project=project,
                    department=dept,
                    defaults={"is_primary": True if d_id == dept_ids[0] else False},
                )

        # Connect initial members
        member_ids = data.get("member_person_ids") or []
        for m_id in member_ids:
            p_obj = Person.objects.filter(company=company, pk=m_id).first()
            if p_obj:
                ProjectMember.objects.get_or_create(
                    company=company,
                    project=project,
                    person=p_obj,
                    defaults={"role": MemberRole.CONTRIBUTOR},
                )

        ProjectActivityLog.objects.create(
            company=company,
            project=project,
            actor_user=user,
            action="project_created",
            details={"name": project.name, "code": project.code},
        )

        AuditLog.objects.create(
            company=company,
            actor=user,
            action="project.created",
            object_type="project",
            object_id=project.id,
            after={"name": project.name, "code": project.code},
            ip_address=_ip(request) if request else "",
            request_id=_request_id(request) if request else "",
        )

    return get_project_detail(company, project.id, user)


def get_project_detail(company, project_id, user):
    ensure_projects_installed(company)
    require_membership(user, company.id)

    project = Project.objects.filter(company=company, pk=project_id).select_related(
        "owner_person", "project_manager", "created_by"
    ).first()
    if not project:
        raise not_found("Project not found.")

    tasks_total = project.tasks.count()
    tasks_completed = project.tasks.filter(status=TaskStatus.COMPLETED).count()
    progress = int((tasks_completed / tasks_total * 100)) if tasks_total > 0 else project.progress_percentage

    members = []
    for m in project.members.select_related("person").all():
        members.append({
            "id": str(m.id),
            "person_id": str(m.person.id),
            "name": f"{m.person.first_name} {m.person.last_name}".strip(),
            "email": m.person.work_email or "",
            "role": m.role,
            "role_label": m.get_role_display(),
            "joined_at": m.joined_at.isoformat(),
        })

    departments = []
    for d in project.organization_units.select_related("department").all():
        departments.append({
            "id": str(d.department.id),
            "name": d.department.name,
            "code": d.department.key or "",
            "is_primary": d.is_primary,
        })

    milestones = []
    for ms in project.milestones.order_by("order", "due_date"):
        milestones.append({
            "id": str(ms.id),
            "title": ms.title,
            "description": ms.description,
            "due_date": _format_date(ms.due_date),
            "status": ms.status,
            "achieved_at": _format_date(ms.achieved_at),
        })

    task_counts_by_status = dict(
        project.tasks.values("status").annotate(count=Count("id")).values_list("status", "count")
    )

    activities = []
    for act in ProjectActivityLog.objects.filter(company=company, project=project).select_related("actor_user").order_by("-created_at")[:10]:
        actor_name = f"{act.actor_user.first_name} {act.actor_user.last_name}".strip() if act.actor_user else "System"
        summary = act.details.get("summary") or act.action or "Project updated"
        activities.append({
            "id": str(act.id),
            "actor_name": actor_name,
            "summary": summary,
            "created_at": _format_date(act.created_at),
        })

    tasks = [_task_summary_payload(t) for t in project.tasks.select_related("project", "assignee").order_by("-created_at")[:20]]

    return {
        "id": str(project.id),
        "code": project.code,
        "name": project.name,
        "description": project.description,
        "status": project.status,
        "status_label": project.get_status_display(),
        "priority": project.priority,
        "priority_label": project.get_priority_display(),
        "owner_person": {
            "id": str(project.owner_person.id),
            "name": f"{project.owner_person.first_name} {project.owner_person.last_name}".strip(),
        } if project.owner_person else None,
        "project_manager": {
            "id": str(project.project_manager.id),
            "name": f"{project.project_manager.first_name} {project.project_manager.last_name}".strip(),
        } if project.project_manager else None,
        "start_date": _format_date(project.start_date),
        "due_date": _format_date(project.due_date),
        "completed_at": _format_date(project.completed_at),
        "budget_amount": str(project.budget_amount),
        "currency": project.currency,
        "progress_percentage": progress,
        "is_billable": project.is_billable,
        "tasks_total": tasks_total,
        "tasks_completed": tasks_completed,
        "task_counts_by_status": task_counts_by_status,
        "members": members,
        "departments": departments,
        "milestones": milestones,
        "tasks": tasks,
        "activities": activities,
        "activity": activities,
        "created_at": _format_date(project.created_at),
        "updated_at": _format_date(project.updated_at),
    }


def update_project(company, project_id, user, data, request=None):
    ensure_projects_installed(company)
    require_permission(user, company.id, "projects.manage")

    project = Project.objects.filter(company=company, pk=project_id).first()
    if not project:
        raise not_found("Project not found.")

    changes = {}
    if "name" in data and data["name"].strip():
        changes["name"] = (project.name, data["name"].strip()[:200])
        project.name = data["name"].strip()[:200]
    if "description" in data:
        project.description = (data["description"] or "")[:5000]
    if "status" in data and data["status"] in {c.value for c in ProjectStatus}:
        changes["status"] = (project.status, data["status"])
        project.status = data["status"]
        if data["status"] == ProjectStatus.COMPLETED and not project.completed_at:
            project.completed_at = timezone.now()
    if "priority" in data and data["priority"] in {c.value for c in ProjectPriority}:
        changes["priority"] = (project.priority, data["priority"])
        project.priority = data["priority"]
    if "start_date" in data:
        project.start_date = data["start_date"] or None
    if "due_date" in data:
        project.due_date = data["due_date"] or None
    if "progress_percentage" in data:
        project.progress_percentage = max(0, min(100, int(data["progress_percentage"])))
    if "project_manager_id" in data:
        pm = Person.objects.filter(company=company, pk=data["project_manager_id"]).first() if data["project_manager_id"] else None
        project.project_manager = pm

    project.save()

    if changes:
        ProjectActivityLog.objects.create(
            company=company,
            project=project,
            actor_user=user,
            action="project_updated",
            details={k: {"old": v[0], "new": v[1]} for k, v in changes.items()},
        )

    return get_project_detail(company, project.id, user)


def add_project_member(company, project_id, person_id, role, user):
    ensure_projects_installed(company)
    require_permission(user, company.id, "projects.manage")

    project = Project.objects.filter(company=company, pk=project_id).first()
    if not project:
        raise not_found("Project not found.")

    person = Person.objects.filter(company=company, pk=person_id).first()
    if not person:
        raise not_found("Person not found.")

    member, _ = ProjectMember.objects.update_or_create(
        company=company,
        project=project,
        person=person,
        defaults={"role": role or MemberRole.CONTRIBUTOR},
    )
    return {
        "id": str(member.id),
        "person_id": str(person.id),
        "name": f"{person.first_name} {person.last_name}".strip(),
        "role": member.role,
        "role_label": member.get_role_display(),
    }


def remove_project_member(company, project_id, member_id, user):
    ensure_projects_installed(company)
    require_permission(user, company.id, "projects.manage")

    member = ProjectMember.objects.filter(company=company, project_id=project_id, pk=member_id).first()
    if not member:
        raise not_found("Project member not found.")
    member.delete()
    return {"deleted": True}


def create_milestone(company, project_id, data, user):
    ensure_projects_installed(company)
    require_permission(user, company.id, "projects.manage")

    project = Project.objects.filter(company=company, pk=project_id).first()
    if not project:
        raise not_found("Project not found.")

    title = (data.get("title") or "").strip()
    if not title:
        raise validation_error([{"field": "title", "code": "required", "message": "Milestone title required."}])

    ms = ProjectMilestone.objects.create(
        company=company,
        project=project,
        title=title[:200],
        description=(data.get("description") or "")[:2000],
        due_date=data.get("due_date") or None,
        status=data.get("status") or MilestoneStatus.PLANNED,
    )
    return {
        "id": str(ms.id),
        "title": ms.title,
        "description": ms.description,
        "due_date": _format_date(ms.due_date),
        "status": ms.status,
    }


# ----------------------------------------------------------------------
# Task Management
# ----------------------------------------------------------------------

def list_tasks(company, user, *, project_id=None, assignee_id=None, status=None, priority=None, search=None, scope=None):
    ensure_projects_installed(company)
    membership = require_membership(user, company.id)

    qs = ProjectTask.objects.filter(company=company).select_related(
        "project", "assignee", "reviewer", "milestone"
    ).prefetch_related("additional_assignees__person", "comments")

    if project_id:
        qs = qs.filter(project_id=project_id)
    if assignee_id:
        qs = qs.filter(Q(assignee_id=assignee_id) | Q(additional_assignees__person_id=assignee_id)).distinct()
    if status:
        qs = qs.filter(status=status)
    if priority:
        qs = qs.filter(priority=priority)
    if search:
        q = search.strip()
        qs = qs.filter(Q(title__icontains=q) | Q(code__icontains=q) | Q(description__icontains=q))

    if scope == "my_work" and membership.person_id:
        qs = qs.filter(
            Q(assignee_id=membership.person_id)
            | Q(additional_assignees__person_id=membership.person_id)
            | Q(creator_person_id=membership.person_id)
        ).distinct()
    elif scope == "overdue":
        today = timezone.localdate()
        qs = qs.filter(due_date__lt=today).exclude(status__in=[TaskStatus.COMPLETED, TaskStatus.CANCELLED])

    results = [_task_summary_payload(t) for t in qs.order_by("-created_at")]
    return {"results": results}


def create_task(company, user, data, request=None):
    ensure_projects_installed(company)
    membership = require_membership(user, company.id)
    perms = effective_permission_codes(membership)

    if not ("projects.task.manage" in perms or "projects.manage" in perms or "projects.admin" in perms):
        require_permission(user, company.id, "projects.task.manage")

    title = (data.get("title") or "").strip()
    if not title:
        raise validation_error([{"field": "title", "code": "required", "message": "Task title is required."}])

    project = None
    if data.get("project_id"):
        project = Project.objects.filter(company=company, pk=data["project_id"]).first()
        if not project:
            raise not_found("Project not found.")

    assignee = None
    if data.get("assignee_id"):
        assignee = Person.objects.filter(company=company, pk=data["assignee_id"]).first()
        if not assignee:
            raise not_found("Assignee person not found in company directory.")

    reviewer = None
    if data.get("reviewer_id"):
        reviewer = Person.objects.filter(company=company, pk=data["reviewer_id"]).first()

    milestone = None
    if data.get("milestone_id") and project:
        milestone = ProjectMilestone.objects.filter(company=company, project=project, pk=data["milestone_id"]).first()

    parent_task = None
    if data.get("parent_task_id"):
        parent_task = ProjectTask.objects.filter(company=company, pk=data["parent_task_id"]).first()

    code = (data.get("code") or "").strip() or generate_task_code(company)

    with transaction.atomic():
        task = ProjectTask.objects.create(
            company=company,
            project=project,
            code=code,
            title=title[:255],
            description=(data.get("description") or "")[:5000],
            status=data.get("status") or TaskStatus.TODO,
            priority=data.get("priority") or TaskPriority.MEDIUM,
            milestone=milestone,
            parent_task=parent_task,
            creator=user,
            creator_person=membership.person,
            assignee=assignee,
            reviewer=reviewer,
            start_date=data.get("start_date") or None,
            due_date=data.get("due_date") or None,
            estimated_hours=Decimal(str(data.get("estimated_hours") or 0)),
        )

        add_assignees = data.get("additional_assignee_ids") or []
        for a_id in add_assignees:
            p = Person.objects.filter(company=company, pk=a_id).first()
            if p and p != assignee:
                TaskAssignee.objects.create(
                    company=company,
                    task=task,
                    person=p,
                    is_primary=False,
                )

        TaskActivityLog.objects.create(
            company=company,
            task=task,
            actor_user=user,
            action="created",
            field_name="task",
            new_value=task.title,
        )

        _send_notification_to_person(
            company,
            assignee,
            f"New Task Assigned: {task.title}",
            f"You have been assigned task {task.code} ({task.title}) by {user.first_name} {user.last_name}.",
        )

    return get_task_detail(company, task.id, user)


def get_task_detail(company, task_id, user):
    ensure_projects_installed(company)
    task = ProjectTask.objects.filter(company=company, pk=task_id).select_related(
        "project", "assignee", "reviewer", "creator", "creator_person", "milestone", "parent_task"
    ).prefetch_related(
        "additional_assignees__person",
        "subtasks__assignee",
        "comments__author_user",
        "comments__author_person",
        "attachments__uploaded_by",
        "activity_logs__actor_user",
    ).first()
    if not task:
        raise not_found("Task not found.")

    assignees = []
    if task.assignee:
        assignees.append({
            "person_id": str(task.assignee.id),
            "name": f"{task.assignee.first_name} {task.assignee.last_name}".strip(),
            "email": task.assignee.work_email or "",
            "is_primary": True,
        })
    for extra in task.additional_assignees.all():
        assignees.append({
            "person_id": str(extra.person.id),
            "name": f"{extra.person.first_name} {extra.person.last_name}".strip(),
            "email": extra.person.work_email or "",
            "is_primary": False,
        })

    subtasks = []
    for st in task.subtasks.all():
        subtasks.append({
            "id": str(st.id),
            "code": st.code,
            "title": st.title,
            "status": st.status,
            "status_label": st.get_status_display(),
            "assignee_name": f"{st.assignee.first_name} {st.assignee.last_name}".strip() if st.assignee else None,
        })

    comments = []
    for c in task.comments.order_by("created_at"):
        comments.append({
            "id": str(c.id),
            "body": c.body,
            "author_name": f"{c.author_user.first_name} {c.author_user.last_name}".strip() or c.author_user.email,
            "created_at": c.created_at.isoformat(),
            "mentions": c.mentions,
        })

    attachments = []
    for att in task.attachments.order_by("-uploaded_at"):
        attachments.append({
            "id": str(att.id),
            "file_name": att.file_name,
            "file_url": att.file_url,
            "file_size": att.file_size,
            "uploaded_by": f"{att.uploaded_by.first_name} {att.uploaded_by.last_name}".strip() or att.uploaded_by.email,
            "uploaded_at": att.uploaded_at.isoformat(),
        })

    activities = []
    for act in task.activity_logs.order_by("-created_at")[:20]:
        actor_name = f"{act.actor_user.first_name} {act.actor_user.last_name}".strip() if act.actor_user else "System"
        activities.append({
            "id": str(act.id),
            "actor_name": actor_name,
            "action": act.action,
            "field_name": act.field_name,
            "old_value": act.old_value,
            "new_value": act.new_value,
            "created_at": act.created_at.isoformat(),
        })

    return {
        "id": str(task.id),
        "code": task.code,
        "title": task.title,
        "description": task.description,
        "status": task.status,
        "status_label": task.get_status_display(),
        "priority": task.priority,
        "priority_label": task.get_priority_display(),
        "project": {
            "id": str(task.project.id),
            "name": task.project.name,
            "code": task.project.code,
        } if task.project else None,
        "milestone": {
            "id": str(task.milestone.id),
            "title": task.milestone.title,
        } if task.milestone else None,
        "assignee": {
            "id": str(task.assignee.id),
            "name": f"{task.assignee.first_name} {task.assignee.last_name}".strip(),
            "email": task.assignee.work_email or "",
        } if task.assignee else None,
        "reviewer": {
            "id": str(task.reviewer.id),
            "name": f"{task.reviewer.first_name} {task.reviewer.last_name}".strip(),
        } if task.reviewer else None,
        "assignees": assignees,
        "start_date": _format_date(task.start_date),
        "due_date": _format_date(task.due_date),
        "estimated_hours": str(task.estimated_hours),
        "actual_hours": str(task.actual_hours),
        "completed_at": _format_date(task.completed_at),
        "subtasks": subtasks,
        "comments": comments,
        "attachments": attachments,
        "activities": activities,
        "created_at": task.created_at.isoformat(),
        "updated_at": task.updated_at.isoformat(),
    }


def update_task(company, task_id, user, data, request=None):
    ensure_projects_installed(company)
    membership = require_membership(user, company.id)
    perms = effective_permission_codes(membership)

    task = ProjectTask.objects.filter(company=company, pk=task_id).first()
    if not task:
        raise not_found("Task not found.")

    can_manage = "projects.task.manage" in perms or "projects.manage" in perms or "projects.admin" in perms
    can_update_status = "projects.task.status" in perms or can_manage or (task.assignee_id and task.assignee_id == membership.person_id)

    if not can_update_status and not can_manage:
        raise require_permission(user, company.id, "projects.task.status")

    changes = []
    if "status" in data and data["status"] in {c.value for c in TaskStatus}:
        old_st = task.status
        new_st = data["status"]
        if old_st != new_st:
            task.status = new_st
            changes.append(("status", old_st, new_st))
            if new_st == TaskStatus.COMPLETED:
                task.completed_at = timezone.now()
            else:
                task.completed_at = None

    if can_manage:
        if "title" in data and data["title"].strip():
            old_t = task.title
            task.title = data["title"].strip()[:255]
            if old_t != task.title:
                changes.append(("title", old_t, task.title))
        if "description" in data:
            task.description = (data["description"] or "")[:5000]
        if "priority" in data and data["priority"] in {c.value for c in TaskPriority}:
            old_p = task.priority
            task.priority = data["priority"]
            if old_p != task.priority:
                changes.append(("priority", old_p, task.priority))
        if "start_date" in data:
            task.start_date = data["start_date"] or None
        if "due_date" in data:
            task.due_date = data["due_date"] or None
        if "estimated_hours" in data:
            task.estimated_hours = Decimal(str(data["estimated_hours"] or 0))
        if "assignee_id" in data:
            old_assignee = task.assignee
            new_assignee = Person.objects.filter(company=company, pk=data["assignee_id"]).first() if data["assignee_id"] else None
            task.assignee = new_assignee
            if old_assignee != new_assignee:
                old_name = f"{old_assignee.first_name} {old_assignee.last_name}" if old_assignee else "None"
                new_name = f"{new_assignee.first_name} {new_assignee.last_name}" if new_assignee else "None"
                changes.append(("assignee", old_name, new_name))
                _send_notification_to_person(
                    company,
                    new_assignee,
                    f"Task Reassigned: {task.title}",
                    f"Task {task.code} has been assigned to you.",
                )

    task.save()

    for field, old_val, new_val in changes:
        TaskActivityLog.objects.create(
            company=company,
            task=task,
            actor_user=user,
            action=f"{field}_changed",
            field_name=field,
            old_value=str(old_val),
            new_value=str(new_val),
        )

    return get_task_detail(company, task.id, user)


def add_task_comment(company, task_id, user, body, mentions=None):
    ensure_projects_installed(company)
    membership = require_membership(user, company.id)

    task = ProjectTask.objects.filter(company=company, pk=task_id).first()
    if not task:
        raise not_found("Task not found.")

    body = (body or "").strip()
    if not body:
        raise validation_error([{"field": "body", "code": "required", "message": "Comment body cannot be empty."}])

    comment = TaskComment.objects.create(
        company=company,
        task=task,
        author_user=user,
        author_person=membership.person,
        body=body,
        mentions=mentions or [],
    )

    TaskActivityLog.objects.create(
        company=company,
        task=task,
        actor_user=user,
        action="comment_added",
        field_name="comment",
        new_value=body[:100],
    )

    return {
        "id": str(comment.id),
        "body": comment.body,
        "author_name": f"{user.first_name} {user.last_name}".strip() or user.email,
        "created_at": comment.created_at.isoformat(),
        "mentions": comment.mentions,
    }


# ----------------------------------------------------------------------
# Timesheet Management (Project Effort Tracking)
# ----------------------------------------------------------------------

def list_timesheets(company, user, *, person_id=None, project_id=None, work_date=None, status=None):
    ensure_projects_installed(company)
    membership = require_membership(user, company.id)
    perms = effective_permission_codes(membership)

    qs = ProjectTimeEntry.objects.filter(company=company).select_related(
        "person", "project", "task", "approver_person"
    )

    is_approver = "projects.timesheet.approve" in perms or "projects.admin" in perms or "administrator" in perms or "owner" in perms
    if not is_approver:
        if membership.person_id:
            qs = qs.filter(person_id=membership.person_id)
        else:
            qs = qs.none()
    elif person_id:
        qs = qs.filter(person_id=person_id)

    if project_id:
        qs = qs.filter(project_id=project_id)
    if work_date:
        qs = qs.filter(work_date=work_date)
    if status:
        qs = qs.filter(status=status)

    results = []
    for row in qs.order_by("-work_date", "-created_at"):
        date_str = row.work_date.isoformat() if hasattr(row.work_date, "isoformat") else str(row.work_date)
        results.append({
            "id": str(row.id),
            "person": {
                "id": str(row.person.id),
                "name": f"{row.person.first_name} {row.person.last_name}".strip(),
            },
            "project": {
                "id": str(row.project.id),
                "name": row.project.name,
                "code": row.project.code,
            } if row.project else None,
            "task": {
                "id": str(row.task.id),
                "title": row.task.title,
                "code": row.task.code,
            } if row.task else None,
            "work_date": date_str,
            "duration_minutes": row.duration_minutes,
            "hours": round(row.duration_minutes / 60, 2),
            "description": row.description,
            "is_billable": row.is_billable,
            "status": row.status,
            "status_label": row.get_status_display(),
            "timer_active": row.timer_started_at is not None,
            "rejection_reason": row.rejection_reason,
            "created_at": row.created_at.isoformat(),
        })
    return {"results": results}


def log_time_entry(company, user, data):
    ensure_projects_installed(company)
    membership = require_membership(user, company.id)
    require_permission(user, company.id, "projects.timesheet.log")

    if not membership.person:
        raise conflict("You must be linked to a Person profile in this company to log timesheet hours.")

    work_date = data.get("work_date") or timezone.localdate()
    duration_minutes = int(data.get("duration_minutes") or 0)
    if duration_minutes <= 0 and not data.get("start_timer"):
        raise validation_error([{"field": "duration_minutes", "code": "invalid", "message": "Duration must be greater than 0."}])

    project = None
    if data.get("project_id"):
        project = Project.objects.filter(company=company, pk=data["project_id"]).first()

    task = None
    if data.get("task_id"):
        task = ProjectTask.objects.filter(company=company, pk=data["task_id"]).first()
        if task and not project:
            project = task.project

    is_billable = bool(data.get("is_billable", True))
    timer_started_at = timezone.now() if data.get("start_timer") else None

    entry = ProjectTimeEntry.objects.create(
        company=company,
        project=project,
        task=task,
        person=membership.person,
        user=user,
        work_date=work_date,
        duration_minutes=duration_minutes,
        description=(data.get("description") or "")[:2000],
        is_billable=is_billable,
        status=TimesheetStatus.DRAFT,
        timer_started_at=timer_started_at,
    )

    if task and duration_minutes > 0:
        task.actual_hours = task.actual_hours + Decimal(str(round(duration_minutes / 60, 2)))
        task.save(update_fields=["actual_hours", "updated_at"])

    date_str = entry.work_date.isoformat() if hasattr(entry.work_date, "isoformat") else str(entry.work_date)
    return {
        "id": str(entry.id),
        "duration_minutes": entry.duration_minutes,
        "work_date": date_str,
        "status": entry.status,
        "timer_active": entry.timer_started_at is not None,
    }


def start_stop_timer(company, user, data):
    ensure_projects_installed(company)
    membership = require_membership(user, company.id)
    require_permission(user, company.id, "projects.timesheet.log")

    entry_id = data.get("entry_id")
    if entry_id:
        entry = ProjectTimeEntry.objects.filter(company=company, pk=entry_id, person=membership.person).first()
        if not entry:
            raise not_found("Timesheet timer not found.")
        if entry.timer_started_at:
            elapsed_seconds = (timezone.now() - entry.timer_started_at).total_seconds()
            additional_minutes = max(1, int(elapsed_seconds / 60))
            entry.duration_minutes += additional_minutes
            entry.timer_started_at = None
            entry.save(update_fields=["duration_minutes", "timer_started_at", "updated_at"])
            return {"status": "stopped", "duration_minutes": entry.duration_minutes}
        else:
            entry.timer_started_at = timezone.now()
            entry.save(update_fields=["timer_started_at", "updated_at"])
            return {"status": "started"}

    return log_time_entry(company, user, {**data, "start_timer": True, "duration_minutes": 0})


def submit_timesheets(company, user, entry_ids):
    ensure_projects_installed(company)
    membership = require_membership(user, company.id)
    require_permission(user, company.id, "projects.timesheet.log")

    rows = ProjectTimeEntry.objects.filter(
        company=company,
        person=membership.person,
        id__in=entry_ids,
        status=TimesheetStatus.DRAFT,
    )
    count = rows.update(status=TimesheetStatus.SUBMITTED, updated_at=timezone.now())
    return {"submitted_count": count}


def decide_timesheet(company, user, entry_id, action, rejection_reason=""):
    ensure_projects_installed(company)
    membership = require_membership(user, company.id)
    require_permission(user, company.id, "projects.timesheet.approve")

    entry = ProjectTimeEntry.objects.filter(company=company, pk=entry_id).first()
    if not entry:
        raise not_found("Time entry not found.")

    if action == "approve":
        entry.status = TimesheetStatus.APPROVED
        entry.approver_person = membership.person
        entry.approved_at = timezone.now()
        entry.rejection_reason = ""
    elif action == "reject":
        entry.status = TimesheetStatus.REJECTED
        entry.rejection_reason = rejection_reason or "Rejected by reviewer."
    else:
        raise validation_error([{"field": "action", "code": "invalid", "message": "Action must be approve or reject."}])

    entry.save()
    return {"id": str(entry.id), "status": entry.status}


# ----------------------------------------------------------------------
# Dashboards & Workload Aggregations
# ----------------------------------------------------------------------

def get_overview_dashboard(company, user):
    ensure_projects_installed(company)
    membership = require_membership(user, company.id)
    today = timezone.localdate()

    total_projects = Project.objects.filter(company=company).count()
    active_projects = Project.objects.filter(company=company, status=ProjectStatus.ACTIVE).count()
    completed_projects = Project.objects.filter(company=company, status=ProjectStatus.COMPLETED).count()

    total_tasks = ProjectTask.objects.filter(company=company).count()
    completed_tasks = ProjectTask.objects.filter(company=company, status=TaskStatus.COMPLETED).count()
    overdue_tasks = ProjectTask.objects.filter(
        company=company, due_date__lt=today
    ).exclude(status__in=[TaskStatus.COMPLETED, TaskStatus.CANCELLED]).count()
    due_today_tasks = ProjectTask.objects.filter(
        company=company, due_date=today
    ).exclude(status__in=[TaskStatus.COMPLETED, TaskStatus.CANCELLED]).count()

    my_tasks = []
    if membership.person_id:
        my_qs = ProjectTask.objects.filter(
            company=company,
            assignee_id=membership.person_id,
        ).exclude(status__in=[TaskStatus.COMPLETED, TaskStatus.CANCELLED]).select_related("project").order_by("due_date")[:5]
        for t in my_qs:
            my_tasks.append({
                "id": str(t.id),
                "code": t.code,
                "title": t.title,
                "project_name": t.project.name if t.project else "General",
                "due_date": _format_date(t.due_date),
                "priority": t.priority,
                "status": t.status,
            })

    recent_projects = []
    for p in Project.objects.filter(company=company, status=ProjectStatus.ACTIVE).order_by("-updated_at")[:5]:
        recent_projects.append(_project_summary_payload(p))

    week_start = today - timezone.timedelta(days=today.weekday())
    weekly_minutes = ProjectTimeEntry.objects.filter(
        company=company, work_date__gte=week_start
    ).aggregate(total=Sum("duration_minutes"))["total"] or 0
    weekly_hours = round(weekly_minutes / 60, 1)

    return {
        "kpis": {
            "total_projects": total_projects,
            "active_projects": active_projects,
            "completed_projects": completed_projects,
            "total_tasks": total_tasks,
            "completed_tasks": completed_tasks,
            "overdue_tasks": overdue_tasks,
            "due_today_tasks": due_today_tasks,
            "weekly_hours_logged": weekly_hours,
        },
        "my_tasks": my_tasks,
        "recent_projects": recent_projects,
    }


def get_team_workload(company, user):
    ensure_projects_installed(company)
    require_membership(user, company.id)

    people_qs = Person.objects.filter(company=company, status="active").select_related("department")
    today = timezone.localdate()
    week_start = today - timezone.timedelta(days=today.weekday())

    team = []
    for p in people_qs[:20]:
        assigned_count = ProjectTask.objects.filter(
            company=company, assignee=p
        ).exclude(status__in=[TaskStatus.COMPLETED, TaskStatus.CANCELLED]).count()
        overdue_count = ProjectTask.objects.filter(
            company=company, assignee=p, due_date__lt=today
        ).exclude(status__in=[TaskStatus.COMPLETED, TaskStatus.CANCELLED]).count()
        mins_logged = ProjectTimeEntry.objects.filter(
            company=company, person=p, work_date__gte=week_start
        ).aggregate(tot=Sum("duration_minutes"))["tot"] or 0

        team.append({
            "person_id": str(p.id),
            "name": f"{p.first_name} {p.last_name}".strip(),
            "department": p.department.name if p.department else "General",
            "designation": p.job_title or "",
            "active_tasks_count": assigned_count,
            "overdue_tasks_count": overdue_count,
            "weekly_hours": round(mins_logged / 60, 1),
        })

    return {"results": team}


def get_reports_summary(company, user):
    ensure_projects_installed(company)
    require_permission(user, company.id, "projects.reports.view")

    projects_data = []
    for p in Project.objects.filter(company=company):
        tot = p.tasks.count()
        done = p.tasks.filter(status=TaskStatus.COMPLETED).count()
        pct = int(done / tot * 100) if tot > 0 else p.progress_percentage
        projects_data.append({
            "name": p.name,
            "code": p.code,
            "status": p.status,
            "total_tasks": tot,
            "completed_tasks": done,
            "progress_percentage": pct,
        })

    task_distribution = dict(
        ProjectTask.objects.filter(company=company).values("status").annotate(count=Count("id")).values_list("status", "count")
    )

    billable_mins = ProjectTimeEntry.objects.filter(company=company, is_billable=True).aggregate(t=Sum("duration_minutes"))["t"] or 0
    non_billable_mins = ProjectTimeEntry.objects.filter(company=company, is_billable=False).aggregate(t=Sum("duration_minutes"))["t"] or 0

    return {
        "projects_progress": projects_data,
        "task_distribution": task_distribution,
        "timesheet_totals": {
            "billable_hours": round(billable_mins / 60, 1),
            "non_billable_hours": round(non_billable_mins / 60, 1),
            "total_hours": round((billable_mins + non_billable_mins) / 60, 1),
        },
    }


def _project_summary_payload(p: Project) -> dict:
    tot = p.tasks.count()
    done = p.tasks.filter(status=TaskStatus.COMPLETED).count()
    progress = int(done / tot * 100) if tot > 0 else p.progress_percentage
    return {
        "id": str(p.id),
        "code": p.code,
        "name": p.name,
        "description": p.description,
        "status": p.status,
        "status_label": p.get_status_display(),
        "priority": p.priority,
        "priority_label": p.get_priority_display(),
        "owner_person": f"{p.owner_person.first_name} {p.owner_person.last_name}".strip() if p.owner_person else None,
        "project_manager": f"{p.project_manager.first_name} {p.project_manager.last_name}".strip() if p.project_manager else None,
        "start_date": _format_date(p.start_date),
        "due_date": _format_date(p.due_date),
        "progress_percentage": progress,
        "tasks_total": tot,
        "tasks_completed": done,
        "is_billable": p.is_billable,
        "created_at": _format_date(p.created_at),
    }


def _task_summary_payload(t: ProjectTask) -> dict:
    return {
        "id": str(t.id),
        "code": t.code,
        "title": t.title,
        "status": t.status,
        "status_label": t.get_status_display(),
        "priority": t.priority,
        "priority_label": t.get_priority_display(),
        "project": {
            "id": str(t.project.id),
            "name": t.project.name,
            "code": t.project.code,
        } if t.project else None,
        "assignee": {
            "id": str(t.assignee.id),
            "name": f"{t.assignee.first_name} {t.assignee.last_name}".strip(),
        } if t.assignee else None,
        "due_date": _format_date(t.due_date),
        "start_date": _format_date(t.start_date),
        "estimated_hours": str(t.estimated_hours),
        "actual_hours": str(t.actual_hours),
        "subtasks_count": t.subtasks.count(),
        "comments_count": t.comments.count(),
        "created_at": _format_date(t.created_at),
    }
