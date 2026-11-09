import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOutletContext, useSearchParams, Link } from "react-router-dom";
import { api } from "../../shared/api/client";
import { LoadingState } from "../../shared/ui/States";
import { ProjectsNavigation } from "../projects/ProjectsNavigation";
import type { ProjectsNavTab, ProjectsOverviewDashboard } from "../projects/types";
import { OverviewView } from "../projects/views/OverviewView";
import { MyWorkView } from "../projects/views/MyWorkView";
import { ProjectsView } from "../projects/views/ProjectsView";
import { TasksView } from "../projects/views/TasksView";
import { MyTeamView } from "../projects/views/MyTeamView";
import { CalendarView } from "../projects/views/CalendarView";
import { TimesheetsView } from "../projects/views/TimesheetsView";
import { ReportsView } from "../projects/views/ReportsView";
import { SettingsView } from "../projects/views/SettingsView";
import type { WorkspacePayload } from "./types";

export function ProjectsPage() {
  const workspace = useOutletContext<WorkspacePayload>();
  const companyId = workspace.company.id;
  const permissions = workspace.permissions;
  const can = (code: string) => permissions.includes(code);

  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get("tab") as ProjectsNavTab | null;
  const activeTab: ProjectsNavTab = urlTab || "overview";

  const initialTaskId = searchParams.get("task_id");
  const initialProjectId = searchParams.get("project_id");

  const [selectedTaskIdForDetail, setSelectedTaskIdForDetail] = useState<string | null>(initialTaskId);
  const [logTimeTaskTarget, setLogTimeTaskTarget] = useState<{ taskId?: string; projectId?: string } | null>(null);

  const handleTabChange = (tab: ProjectsNavTab) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", tab);
      return next;
    });
  };

  // Overview dashboard query for KPI badges
  const dashboardQuery = useQuery({
    queryKey: ["projects-dashboard", companyId],
    queryFn: () => api<ProjectsOverviewDashboard>(`/api/v1/companies/${companyId}/projects/overview/`),
    retry: 1,
  });

  // Determine user role perspective
  let roleBadgeText = "Team Contributor";
  if (can("projects.admin")) {
    roleBadgeText = "Company Admin";
  } else if (can("projects.manage")) {
    roleBadgeText = "Project Manager";
  } else if (can("projects.timesheet.approve") || can("departments.view")) {
    roleBadgeText = "Team Lead / Dept Manager";
  }

  // Live badge counts
  const dbData = dashboardQuery.data;
  const badges = {
    my_work: dbData?.my_tasks?.length,
    tasks: dbData?.kpis?.overdue_tasks,
    timesheets: dbData?.kpis?.pending_timesheets_approval,
  };

  // Handlers for cross-view actions
  const handleOpenTaskDetail = (taskId: string) => {
    setSelectedTaskIdForDetail(taskId);
    if (activeTab !== "tasks") {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("tab", "tasks");
        next.set("task_id", taskId);
        return next;
      });
    }
  };

  const handleOpenLogTimeForTask = (taskId: string, projectId?: string) => {
    setLogTimeTaskTarget({ taskId, projectId });
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", "timesheets");
      next.set("task_id", taskId);
      if (projectId) next.set("project_id", projectId);
      return next;
    });
  };

  if (dashboardQuery.isLoading) {
    return <LoadingState label="Loading Project & Work Management workspace..." />;
  }

  // Graceful uninstalled module state
  if (dashboardQuery.isError) {
    return (
      <div className="rounded-xl border border-dashed border-pulse-border p-12 text-center bg-pulse-surface max-w-xl mx-auto my-12">
        <div className="w-12 h-12 rounded-full bg-teal-50 border border-teal-200 flex items-center justify-center mx-auto text-xl">
          📁
        </div>
        <h2 className="mt-4 text-base font-bold text-pulse-ink">Project & Work Management Not Installed</h2>
        <p className="mt-2 text-xs text-pulse-muted leading-relaxed">
          Install the Project & Work Management module to unlock projects, task tracking, kanban boards, milestones, live timesheets, and workload analytics.
        </p>
        <div className="mt-6">
          <Link
            to="/app/modules"
            className="inline-flex items-center justify-center rounded-md bg-[#0D9488] px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#0f766e]"
          >
            Go to Modules Marketplace
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-pulse-border pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-pulse-muted">
            Project & Work Management
          </p>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="text-2xl font-black tracking-tight text-pulse-ink">
              Projects & Tasks
            </h1>
            <span className="rounded-full bg-pulse-hover px-2.5 py-0.5 text-xs font-semibold text-pulse-muted">
              {workspace.company.display_name}
            </span>
          </div>
        </div>
      </header>

      {/* 9-Tab Navigation */}
      <ProjectsNavigation
        activeTab={activeTab}
        onTabChange={handleTabChange}
        permissions={permissions}
        badges={badges}
        roleBadgeText={roleBadgeText}
      />

      {/* Tab Views */}
      <main>
        {activeTab === "overview" && (
          <OverviewView
            companyId={companyId}
            permissions={permissions}
            onNavigateTab={handleTabChange}
            onOpenTaskDetail={handleOpenTaskDetail}
          />
        )}

        {activeTab === "my_work" && (
          <MyWorkView
            companyId={companyId}
            permissions={permissions}
            onOpenTaskDetail={handleOpenTaskDetail}
            onOpenLogTimeForTask={handleOpenLogTimeForTask}
          />
        )}

        {activeTab === "projects" && (
          <ProjectsView
            companyId={companyId}
            permissions={permissions}
            onOpenTaskDetail={handleOpenTaskDetail}
            onOpenCreateTaskForProject={(projectId) => {
              setSearchParams((prev) => {
                const next = new URLSearchParams(prev);
                next.set("tab", "tasks");
                next.set("project_id", projectId);
                return next;
              });
            }}
          />
        )}

        {activeTab === "tasks" && (
          <TasksView
            companyId={companyId}
            permissions={permissions}
            initialTaskId={selectedTaskIdForDetail}
            onClearInitialTaskId={() => setSelectedTaskIdForDetail(null)}
            onOpenLogTimeForTask={handleOpenLogTimeForTask}
          />
        )}

        {activeTab === "my_team" && (
          <MyTeamView companyId={companyId} permissions={permissions} />
        )}

        {activeTab === "calendar" && (
          <CalendarView
            companyId={companyId}
            onOpenTaskDetail={handleOpenTaskDetail}
          />
        )}

        {activeTab === "timesheets" && (
          <TimesheetsView
            companyId={companyId}
            permissions={permissions}
            initialTaskId={logTimeTaskTarget?.taskId || initialTaskId}
            initialProjectId={logTimeTaskTarget?.projectId || initialProjectId}
          />
        )}

        {activeTab === "reports" && (
          <ReportsView companyId={companyId} permissions={permissions} />
        )}

        {activeTab === "settings" && (
          <SettingsView companyId={companyId} permissions={permissions} />
        )}
      </main>
    </div>
  );
}
