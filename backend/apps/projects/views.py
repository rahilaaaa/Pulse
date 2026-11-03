from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.authorization.company import require_membership, require_permission
from apps.projects.services import (
    add_project_member,
    add_task_comment,
    create_milestone,
    create_project,
    create_task,
    decide_timesheet,
    ensure_projects_installed,
    get_or_create_settings,
    get_overview_dashboard,
    get_project_detail,
    get_reports_summary,
    get_task_detail,
    get_team_workload,
    list_projects,
    list_tasks,
    list_timesheets,
    log_time_entry,
    remove_project_member,
    start_stop_timer,
    submit_timesheets,
    update_project,
    update_task,
)


class ProjectListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = require_permission(request.user, company_id, "projects.view")
        params = request.query_params
        data = list_projects(
            membership.company,
            request.user,
            status=params.get("status"),
            priority=params.get("priority"),
            search=params.get("search"),
            department_id=params.get("department_id"),
        )
        return Response(data)

    def post(self, request, company_id):
        membership = require_permission(request.user, company_id, "projects.manage")
        data = create_project(membership.company, request.user, request.data, request=request)
        return Response(data, status=201)


class ProjectDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id, project_id):
        membership = require_permission(request.user, company_id, "projects.view")
        data = get_project_detail(membership.company, project_id, request.user)
        return Response(data)

    def patch(self, request, company_id, project_id):
        membership = require_permission(request.user, company_id, "projects.manage")
        data = update_project(membership.company, project_id, request.user, request.data, request=request)
        return Response(data)


class ProjectMembersView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, company_id, project_id):
        membership = require_permission(request.user, company_id, "projects.manage")
        person_id = request.data.get("person_id")
        role = request.data.get("role")
        data = add_project_member(membership.company, project_id, person_id, role, request.user)
        return Response(data, status=201)

    def delete(self, request, company_id, project_id, member_id):
        membership = require_permission(request.user, company_id, "projects.manage")
        data = remove_project_member(membership.company, project_id, member_id, request.user)
        return Response(data)


class ProjectMilestonesView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, company_id, project_id):
        membership = require_permission(request.user, company_id, "projects.manage")
        data = create_milestone(membership.company, project_id, request.data, request.user)
        return Response(data, status=201)


class TaskListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = require_permission(request.user, company_id, "projects.view")
        params = request.query_params
        data = list_tasks(
            membership.company,
            request.user,
            project_id=params.get("project_id"),
            assignee_id=params.get("assignee_id"),
            status=params.get("status"),
            priority=params.get("priority"),
            search=params.get("search"),
            scope=params.get("scope"),
        )
        return Response(data)

    def post(self, request, company_id):
        membership = require_permission(request.user, company_id, "projects.task.manage")
        data = create_task(membership.company, request.user, request.data, request=request)
        return Response(data, status=201)


class TaskDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id, task_id):
        membership = require_permission(request.user, company_id, "projects.view")
        data = get_task_detail(membership.company, task_id, request.user)
        return Response(data)

    def patch(self, request, company_id, task_id):
        membership = require_permission(request.user, company_id, "projects.task.status")
        data = update_task(membership.company, task_id, request.user, request.data, request=request)
        return Response(data)


class TaskCommentsView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, company_id, task_id):
        membership = require_permission(request.user, company_id, "projects.task.status")
        body = request.data.get("body")
        mentions = request.data.get("mentions") or []
        data = add_task_comment(membership.company, task_id, request.user, body, mentions)
        return Response(data, status=201)


class TimesheetListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = require_permission(request.user, company_id, "projects.view")
        params = request.query_params
        data = list_timesheets(
            membership.company,
            request.user,
            person_id=params.get("person_id"),
            project_id=params.get("project_id"),
            work_date=params.get("work_date"),
            status=params.get("status"),
        )
        return Response(data)

    def post(self, request, company_id):
        membership = require_permission(request.user, company_id, "projects.timesheet.log")
        data = log_time_entry(membership.company, request.user, request.data)
        return Response(data, status=201)


class TimesheetTimerView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, company_id):
        membership = require_permission(request.user, company_id, "projects.timesheet.log")
        data = start_stop_timer(membership.company, request.user, request.data)
        return Response(data)


class TimesheetSubmitView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, company_id):
        membership = require_permission(request.user, company_id, "projects.timesheet.log")
        entry_ids = request.data.get("entry_ids") or []
        data = submit_timesheets(membership.company, request.user, entry_ids)
        return Response(data)


class TimesheetDecisionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, company_id, entry_id):
        membership = require_permission(request.user, company_id, "projects.timesheet.approve")
        action = request.data.get("action")
        reason = request.data.get("reason", "")
        data = decide_timesheet(membership.company, request.user, entry_id, action, reason)
        return Response(data)


class ProjectsOverviewDashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = require_permission(request.user, company_id, "projects.view")
        data = get_overview_dashboard(membership.company, request.user)
        return Response(data)


class TeamWorkloadView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = require_permission(request.user, company_id, "projects.view")
        data = get_team_workload(membership.company, request.user)
        return Response(data)


class ProjectsReportsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = require_permission(request.user, company_id, "projects.reports.view")
        data = get_reports_summary(membership.company, request.user)
        return Response(data)


class ProjectSettingsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, company_id):
        membership = require_permission(request.user, company_id, "projects.view")
        ensure_projects_installed(membership.company)
        st = get_or_create_settings(membership.company)
        return Response({
            "project_code_prefix": st.project_code_prefix,
            "task_code_prefix": st.task_code_prefix,
            "default_billable": st.default_billable,
            "timesheet_requires_approval": st.timesheet_requires_approval,
            "allow_standalone_tasks": st.allow_standalone_tasks,
        })

    def patch(self, request, company_id):
        membership = require_permission(request.user, company_id, "projects.admin")
        ensure_projects_installed(membership.company)
        st = get_or_create_settings(membership.company)
        if "project_code_prefix" in request.data:
            st.project_code_prefix = (request.data["project_code_prefix"] or "PRJ")[:16]
        if "task_code_prefix" in request.data:
            st.task_code_prefix = (request.data["task_code_prefix"] or "TSK")[:16]
        if "default_billable" in request.data:
            st.default_billable = bool(request.data["default_billable"])
        if "timesheet_requires_approval" in request.data:
            st.timesheet_requires_approval = bool(request.data["timesheet_requires_approval"])
        if "allow_standalone_tasks" in request.data:
            st.allow_standalone_tasks = bool(request.data["allow_standalone_tasks"])
        st.save()
        return Response({
            "project_code_prefix": st.project_code_prefix,
            "task_code_prefix": st.task_code_prefix,
            "default_billable": st.default_billable,
            "timesheet_requires_approval": st.timesheet_requires_approval,
            "allow_standalone_tasks": st.allow_standalone_tasks,
        })
