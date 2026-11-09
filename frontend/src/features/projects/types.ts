export type ProjectsNavTab =
  | "overview"
  | "my_work"
  | "projects"
  | "tasks"
  | "my_team"
  | "calendar"
  | "timesheets"
  | "reports"
  | "settings";

export type ProjectStatus = "planning" | "active" | "on_hold" | "completed" | "cancelled" | "archived";
export type ProjectPriority = "low" | "medium" | "high" | "urgent";
export type TaskStatus = "backlog" | "todo" | "in_progress" | "in_review" | "blocked" | "completed" | "cancelled";
export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type TimesheetStatus = "draft" | "submitted" | "approved" | "rejected";

export interface ProjectMemberItem {
  id: string;
  person_id: string;
  name: string;
  email: string;
  role: string;
  role_label: string;
  joined_at: string;
  allocation_percentage?: number;
  person?: { name: string; email?: string };
}

export interface ProjectDepartmentItem {
  id: string;
  name: string;
  code: string;
  is_primary: boolean;
}

export interface ProjectMilestoneItem {
  id: string;
  title: string;
  description: string;
  due_date: string | null;
  status: "planned" | "in_progress" | "achieved" | "missed";
  achieved_at: string | null;
}

export interface PersonRef {
  id: string;
  name: string;
}

export interface ProjectSummary {
  id: string;
  code: string;
  name: string;
  description: string;
  status: ProjectStatus;
  status_label: string;
  priority: ProjectPriority;
  priority_label: string;
  owner_person: string | PersonRef | null;
  project_manager: string | PersonRef | null;
  start_date: string | null;
  due_date: string | null;
  progress_percentage: number;
  tasks_total: number;
  tasks_completed: number;
  is_billable: boolean;
  created_at: string;
}

export interface ProjectDetail extends ProjectSummary {
  budget_amount: string;
  currency: string;
  completed_at: string | null;
  members: ProjectMemberItem[];
  departments: ProjectDepartmentItem[];
  milestones: ProjectMilestoneItem[];
  task_counts_by_status: Record<string, number>;
  project?: ProjectSummary;
  tasks?: TaskSummary[];
  activity?: Array<{ id: string; actor_name: string; summary: string; created_at: string }>;
}

export interface TaskSummary {
  id: string;
  code: string;
  title: string;
  status: TaskStatus;
  status_label: string;
  priority: TaskPriority;
  priority_label: string;
  project: { id: string; name: string; code: string } | null;
  assignee: { id: string; name: string } | null;
  start_date: string | null;
  due_date: string | null;
  estimated_hours: string;
  actual_hours: string;
  subtasks_count: number;
  comments_count: number;
  created_at: string;
}

export interface TaskCommentItem {
  id: string;
  content: string;
  body?: string;
  author_name: string;
  created_at: string;
  mentions?: string[];
}

export interface TaskAttachmentItem {
  id: string;
  file_name: string;
  file_url: string;
  file_size: number;
  uploaded_by: string;
  uploaded_at: string;
}

export interface TaskActivityItem {
  id: string;
  actor_name: string;
  summary: string;
  action?: string;
  field_name?: string;
  old_value?: string;
  new_value?: string;
  created_at: string;
}

export interface TaskDetail extends TaskSummary {
  description: string;
  reviewer: { id: string; name: string } | null;
  milestone: { id: string; title: string } | null;
  assignees: Array<{ person_id: string; name: string; email: string; is_primary: boolean }>;
  subtasks: Array<{ id: string; code: string; title: string; status: TaskStatus; status_label: string; assignee_name: string | null }>;
  comments: TaskCommentItem[];
  attachments: TaskAttachmentItem[];
  activities: TaskActivityItem[];
  task?: TaskDetail;
}

export interface TimesheetEntry {
  id: string;
  person: { id: string; name: string };
  project: { id: string; name: string; code: string } | null;
  task: { id: string; title: string; code: string } | null;
  work_date: string;
  duration_minutes: number;
  hours: number;
  description: string;
  is_billable: boolean;
  status: TimesheetStatus;
  status_label: string;
  timer_active: boolean;
  rejection_reason: string;
  created_at: string;
}

export interface ProjectsOverviewKPIs {
  total_projects: number;
  active_projects: number;
  completed_projects: number;
  total_tasks: number;
  completed_tasks: number;
  overdue_tasks: number;
  due_today_tasks: number;
  weekly_hours_logged: number;
  pending_timesheets_approval?: number;
}

export interface ProjectsOverviewData {
  kpis: ProjectsOverviewKPIs;
  my_tasks: Array<{
    id: string;
    code: string;
    title: string;
    project_name: string;
    due_date: string | null;
    priority: TaskPriority;
    status: TaskStatus;
  }>;
  recent_projects: ProjectSummary[];
}

export interface TeamWorkloadMember {
  person_id: string;
  name: string;
  department: string;
  designation: string;
  active_tasks_count: number;
  overdue_tasks_count: number;
  weekly_hours: number;
}

export interface ProjectsReportsData {
  projects_progress: Array<{
    name: string;
    code: string;
    status: string;
    total_tasks: number;
    completed_tasks: number;
    progress_percentage: number;
  }>;
  task_distribution: Record<string, number>;
  timesheet_totals: {
    billable_hours: number;
    non_billable_hours: number;
    total_hours: number;
  };
}

export interface ProjectSettingsData {
  project_code_prefix: string;
  task_code_prefix: string;
  default_billable: boolean;
  timesheet_requires_approval: boolean;
  allow_standalone_tasks: boolean;
}

export type TeamMemberWorkload = TeamWorkloadMember;
export type ProjectSettings = ProjectSettingsData;
export type ProjectsOverviewDashboard = ProjectsOverviewData;

