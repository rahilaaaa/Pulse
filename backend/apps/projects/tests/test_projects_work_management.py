from datetime import date
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.authorization.company import bootstrap_company_access
from apps.billing.models import BillingPlan, BillingPlanPrice, Subscription, SubscriptionStatus
from apps.identity.models import User
from apps.modules_registry.models import CompanyModuleInstallation, InstallationStatus, ModuleDefinition
from apps.organization.models import Department, Person, PersonStatus
from apps.projects.models import (
    MemberRole,
    MilestoneStatus,
    Project,
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
    TaskComment,
    TaskPriority,
    TaskStatus,
    TimesheetStatus,
)
from apps.tenants.models import Company, CompanyMembership, CompanyNotification, CompanyStatus, MembershipStatus

PASSWORD = "a-long-passphrase"


class ProjectWorkManagementTests(TestCase):
    def setUp(self):
        self.owner, self.company = self._open_company("pwm-co", "owner@pwm.test")
        self.module = ModuleDefinition.objects.get(slug="projects")
        CompanyModuleInstallation.objects.create(
            company=self.company,
            module=self.module,
            status=InstallationStatus.INSTALLED,
            installed_version=self.module.version,
            installed_at=timezone.now(),
            installed_by=self.owner,
        )

        # Create Engineering and Design Departments
        self.eng_dept = Department.objects.create(
            company=self.company,
            name="Engineering",
            key="eng",
        )
        self.design_dept = Department.objects.create(
            company=self.company,
            name="Product Design",
            key="des",
        )

        # Create two team members
        self.alice_user, self.alice_person = self._add_member("alice@pwm.test", "Alice", "Engineer", self.eng_dept)
        self.bob_user, self.bob_person = self._add_member("bob@pwm.test", "Bob", "Designer", self.design_dept)

        self.client = APIClient()
        self.client.force_login(self.owner)
        self.base_url = f"/api/v1/companies/{self.company.id}/projects"

    def _open_company(self, slug, email):
        owner = User.objects.create_user(email=email, password=PASSWORD, first_name="Ada", last_name="Owner")
        owner.email_verified_at = timezone.now()
        owner.save(update_fields=["email_verified_at", "updated_at"])
        company = Company.objects.create(
            slug=slug, legal_name=slug, display_name=slug, status=CompanyStatus.ACTIVE, created_by=owner
        )
        person = Person.objects.create(
            company=company,
            first_name="Ada",
            last_name="Owner",
            work_email=email,
            status=PersonStatus.ACTIVE,
        )
        CompanyMembership.objects.create(
            company=company, user=owner, person=person, status=MembershipStatus.ACTIVE, joined_at=timezone.now()
        )
        bootstrap_company_access(company, owner)
        plan = BillingPlan.objects.get(code="growth")
        price = BillingPlanPrice.objects.filter(plan=plan, billing_interval="year", currency="INR").order_by("-effective_from").first()
        Subscription.objects.create(
            company=company,
            plan=plan,
            plan_price=price,
            billing_interval="year",
            currency="INR",
            status=SubscriptionStatus.ACTIVE,
        )
        return owner, company

    def _add_member(self, email, first_name, last_name, dept):
        user = User.objects.create_user(email=email, password=PASSWORD, first_name=first_name, last_name=last_name)
        user.email_verified_at = timezone.now()
        user.save(update_fields=["email_verified_at", "updated_at"])
        person = Person.objects.create(
            company=self.company,
            first_name=first_name,
            last_name=last_name,
            work_email=email,
            department=dept,
            status=PersonStatus.ACTIVE,
        )
        membership = CompanyMembership.objects.create(
            company=self.company,
            user=user,
            person=person,
            status=MembershipStatus.ACTIVE,
            joined_at=timezone.now(),
        )
        bootstrap_company_access(self.company, user)
        return user, person

    def test_1_project_creation_and_code_generation(self):
        """Create project with automatic code, dates, budget, owner, and manager."""
        payload = {
            "name": "Cloud Platform Modernization",
            "description": "Migrate core microservices to serverless architecture.",
            "priority": "high",
            "project_manager_id": str(self.alice_person.id),
            "start_date": "2026-11-01",
            "due_date": "2027-04-30",
            "budget_amount": 500000,
        }
        res = self.client.post(f"{self.base_url}/", data=payload, format="json")
        self.assertEqual(res.status_code, 201)
        data = res.json()
        self.assertEqual(data["name"], "Cloud Platform Modernization")
        self.assertTrue(data["code"].startswith("PRJ-"))
        self.assertEqual(data["priority"], "high")
        self.assertEqual(data["project_manager"]["name"], "Alice Engineer")

        # Verify Alice is automatically added as a project manager member
        self.assertTrue(any(m["person_id"] == str(self.alice_person.id) and m["role"] == "manager" for m in data["members"]))

    def test_2_cross_department_participation(self):
        """Project supports participation from multiple departments."""
        payload = {
            "name": "Omnichannel Redesign",
            "department_ids": [str(self.eng_dept.id), str(self.design_dept.id)],
            "member_person_ids": [str(self.bob_person.id)],
        }
        res = self.client.post(f"{self.base_url}/", data=payload, format="json")
        self.assertEqual(res.status_code, 201)
        data = res.json()
        depts = [d["name"] for d in data["departments"]]
        self.assertIn("Engineering", depts)
        self.assertIn("Product Design", depts)

    def test_3_project_milestones(self):
        """Milestones can be created and tracked for a project."""
        project = Project.objects.create(company=self.company, name="Mobile App V2", code="PRJ-101")
        ms_payload = {
            "title": "Alpha Release & Internal Testing",
            "due_date": "2026-12-15",
            "description": "Feature freeze and regression suite pass.",
        }
        res = self.client.post(f"{self.base_url}/{project.id}/milestones/", data=ms_payload, format="json")
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.json()["title"], "Alpha Release & Internal Testing")
        self.assertEqual(res.json()["status"], "planned")

    def test_4_task_creation_project_and_standalone(self):
        """Create both project-associated tasks and standalone work items."""
        project = Project.objects.create(company=self.company, name="Security Audit", code="PRJ-201")

        # Project task
        task_res = self.client.post(
            f"{self.base_url}/tasks/",
            data={
                "project_id": str(project.id),
                "title": "Conduct Penetration Testing",
                "priority": "urgent",
                "assignee_id": str(self.alice_person.id),
                "estimated_hours": 16.5,
            },
            format="json",
        )
        self.assertEqual(task_res.status_code, 201)
        t_data = task_res.json()
        self.assertEqual(t_data["title"], "Conduct Penetration Testing")
        self.assertTrue(t_data["code"].startswith("TSK-"))
        self.assertEqual(t_data["project"]["name"], "Security Audit")

        # Standalone task (no project)
        standalone_res = self.client.post(
            f"{self.base_url}/tasks/",
            data={
                "title": "Quarterly IT Equipment Audit",
                "priority": "medium",
                "assignee_id": str(self.bob_person.id),
            },
            format="json",
        )
        self.assertEqual(standalone_res.status_code, 201)
        self.assertIsNone(standalone_res.json()["project"])

    def test_5_task_multiple_assignees(self):
        """Task supports primary assignee plus additional co-assignees."""
        task_res = self.client.post(
            f"{self.base_url}/tasks/",
            data={
                "title": "Multi-team Architecture Review",
                "assignee_id": str(self.alice_person.id),
                "additional_assignee_ids": [str(self.bob_person.id)],
            },
            format="json",
        )
        self.assertEqual(task_res.status_code, 201)
        data = task_res.json()
        assignee_names = [a["name"] for a in data["assignees"]]
        self.assertIn("Alice Engineer", assignee_names)
        self.assertIn("Bob Designer", assignee_names)

    def test_6_task_status_transition_and_activity_audit(self):
        """Status transitions log activity audit records."""
        task = ProjectTask.objects.create(
            company=self.company,
            title="Design Database Schema",
            code="TSK-100",
            status=TaskStatus.TODO,
            assignee=self.alice_person,
        )

        # Transition status to In Progress
        patch_res = self.client.patch(
            f"{self.base_url}/tasks/{task.id}/",
            data={"status": "in_progress"},
            format="json",
        )
        self.assertEqual(patch_res.status_code, 200)
        self.assertEqual(patch_res.json()["status"], "in_progress")

        # Verify activity log
        log = TaskActivityLog.objects.filter(task=task, action="status_changed").first()
        self.assertIsNotNone(log)
        self.assertEqual(log.old_value, "todo")
        self.assertEqual(log.new_value, "in_progress")

        # Transition to Completed
        patch_res2 = self.client.patch(
            f"{self.base_url}/tasks/{task.id}/",
            data={"status": "completed"},
            format="json",
        )
        self.assertEqual(patch_res2.status_code, 200)
        task.refresh_from_db()
        self.assertEqual(task.status, TaskStatus.COMPLETED)
        self.assertIsNotNone(task.completed_at)

    def test_7_task_comments_and_notifications(self):
        """Comments can be posted and dispatch notifications."""
        task = ProjectTask.objects.create(
            company=self.company,
            title="Refactor API Gateway",
            code="TSK-200",
            assignee=self.alice_person,
        )
        comment_res = self.client.post(
            f"{self.base_url}/tasks/{task.id}/comments/",
            data={
                "body": "PR has been approved and staged in staging environment.",
                "mentions": [str(self.alice_person.id)],
            },
            format="json",
        )
        self.assertEqual(comment_res.status_code, 201)
        self.assertEqual(TaskComment.objects.filter(task=task).count(), 1)

    def test_8_timesheets_logging_and_approval(self):
        """Log project work hours, submit timesheets, and approve."""
        project = Project.objects.create(company=self.company, name="Website Revamp", code="PRJ-300")
        task = ProjectTask.objects.create(company=self.company, project=project, title="Hero section animations")

        # Alice logs 120 minutes (2 hours)
        alice_client = APIClient()
        alice_client.force_login(self.alice_user)

        log_res = alice_client.post(
            f"{self.base_url}/timesheets/",
            data={
                "project_id": str(project.id),
                "task_id": str(task.id),
                "work_date": "2026-11-01",
                "duration_minutes": 120,
                "description": "Built interactive hero SVG canvas.",
            },
            format="json",
        )
        self.assertEqual(log_res.status_code, 201)
        entry_id = log_res.json()["id"]

        # Verify task actual hours were updated
        task.refresh_from_db()
        self.assertEqual(task.actual_hours, 2.0)

        # Alice submits timesheet
        submit_res = alice_client.post(
            f"{self.base_url}/timesheets/submit/",
            data={"entry_ids": [entry_id]},
            format="json",
        )
        self.assertEqual(submit_res.status_code, 200)
        self.assertEqual(submit_res.json()["submitted_count"], 1)

        # Owner approves timesheet
        decide_res = self.client.post(
            f"{self.base_url}/timesheets/{entry_id}/decision/",
            data={"action": "approve"},
            format="json",
        )
        self.assertEqual(decide_res.status_code, 200)
        self.assertEqual(decide_res.json()["status"], "approved")

    def test_9_overview_dashboard_metrics(self):
        """Overview dashboard aggregates active projects, overdue tasks, and weekly hours."""
        res = self.client.get(f"{self.base_url}/dashboard/")
        self.assertEqual(res.status_code, 200)
        kpis = res.json()["kpis"]
        self.assertIn("total_projects", kpis)
        self.assertIn("active_projects", kpis)
        self.assertIn("total_tasks", kpis)
        self.assertIn("weekly_hours_logged", kpis)

    def test_10_team_workload_and_reports(self):
        """Team workload and reporting endpoints return structured metrics."""
        workload_res = self.client.get(f"{self.base_url}/team-workload/")
        self.assertEqual(workload_res.status_code, 200)
        self.assertTrue(len(workload_res.json()["results"]) >= 2)

        reports_res = self.client.get(f"{self.base_url}/reports/")
        self.assertEqual(reports_res.status_code, 200)
        self.assertIn("projects_progress", reports_res.json())
        self.assertIn("task_distribution", reports_res.json())
        self.assertIn("timesheet_totals", reports_res.json())

    def test_11_module_settings(self):
        """Settings can be viewed and updated by administrators."""
        get_res = self.client.get(f"{self.base_url}/settings/")
        self.assertEqual(get_res.status_code, 200)
        self.assertEqual(get_res.json()["project_code_prefix"], "PRJ")

        patch_res = self.client.patch(
            f"{self.base_url}/settings/",
            data={"project_code_prefix": "PROJ", "default_billable": False},
            format="json",
        )
        self.assertEqual(patch_res.status_code, 200)
        self.assertEqual(patch_res.json()["project_code_prefix"], "PROJ")
        self.assertFalse(patch_res.json()["default_billable"])
