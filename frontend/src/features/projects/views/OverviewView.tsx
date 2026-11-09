import { useQuery } from "@tanstack/react-query";
import { api } from "../../../shared/api/client";
import { LoadingState } from "../../../shared/ui/States";
import type { ProjectsNavTab, ProjectsOverviewData } from "../types";

interface OverviewViewProps {
  companyId: string;
  permissions: string[];
  onNavigateTab: (tab: ProjectsNavTab) => void;
  onOpenNewProject?: () => void;
  onOpenNewTask?: () => void;
  onOpenLogTime?: () => void;
  onOpenTaskDetail?: (taskId: string) => void;
}

export function OverviewView({
  companyId,
  permissions,
  onNavigateTab,
  onOpenNewProject,
  onOpenNewTask,
  onOpenLogTime,
  onOpenTaskDetail,
}: OverviewViewProps) {
  const can = (code: string) => permissions.includes(code);

  const dashboardQuery = useQuery({
    queryKey: ["projects-dashboard", companyId],
    queryFn: () => api<ProjectsOverviewData>(`/api/v1/companies/${companyId}/projects/dashboard/`),
  });

  if (dashboardQuery.isLoading || !dashboardQuery.data) {
    return <LoadingState label="Loading project operations..." />;
  }

  const { kpis, my_tasks, recent_projects } = dashboardQuery.data;

  return (
    <div className="space-y-6">
      {/* Quick Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-pulse-border bg-gradient-to-r from-teal-500/10 via-emerald-500/5 to-transparent p-4">
        <div>
          <h2 className="text-base font-bold text-pulse-ink">Project Work Hub</h2>
          <p className="text-xs text-pulse-muted">
            Track deliverables, assign tasks to people directory, and log project work effort.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {can("projects.manage") && (
            <button
              type="button"
              onClick={onOpenNewProject}
              className="rounded-lg bg-pulse-accent px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:opacity-90 transition flex items-center gap-1.5"
            >
              <span>+ New Project</span>
            </button>
          )}

          {can("projects.task.manage") && (
            <button
              type="button"
              onClick={onOpenNewTask}
              className="rounded-lg border border-pulse-border bg-pulse-surface px-3 py-1.5 text-xs font-semibold text-pulse-ink hover:bg-pulse-hover transition flex items-center gap-1.5"
            >
              <span>+ Add Task</span>
            </button>
          )}

          {can("projects.timesheet.log") && (
            <button
              type="button"
              onClick={onOpenLogTime}
              className="rounded-lg border border-pulse-border bg-pulse-surface px-3 py-1.5 text-xs font-semibold text-pulse-ink hover:bg-pulse-hover transition flex items-center gap-1.5"
            >
              <span>⏱ Log Hours</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {/* Active Projects */}
        <div
          onClick={() => onNavigateTab("projects")}
          className="rounded-xl border border-pulse-border bg-pulse-surface p-4 shadow-sm hover:border-pulse-accent/50 cursor-pointer transition"
        >
          <p className="text-[11px] font-bold uppercase tracking-wider text-pulse-muted">Active Projects</p>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-pulse-ink">{kpis.active_projects}</span>
            <span className="text-xs text-pulse-muted">of {kpis.total_projects} total</span>
          </div>
        </div>

        {/* Total Tasks */}
        <div
          onClick={() => onNavigateTab("tasks")}
          className="rounded-xl border border-pulse-border bg-pulse-surface p-4 shadow-sm hover:border-pulse-accent/50 cursor-pointer transition"
        >
          <p className="text-[11px] font-bold uppercase tracking-wider text-pulse-muted">Open Tasks</p>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-teal-700 dark:text-teal-400">
              {kpis.total_tasks - kpis.completed_tasks}
            </span>
            <span className="text-xs text-pulse-muted">{kpis.completed_tasks} done</span>
          </div>
        </div>

        {/* Due Today */}
        <div
          onClick={() => onNavigateTab("my_work")}
          className="rounded-xl border border-pulse-border bg-pulse-surface p-4 shadow-sm hover:border-pulse-accent/50 cursor-pointer transition"
        >
          <p className="text-[11px] font-bold uppercase tracking-wider text-pulse-muted">Due Today</p>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-amber-600">{kpis.due_today_tasks}</span>
            <span className="text-xs text-pulse-muted">deadlines</span>
          </div>
        </div>

        {/* Overdue */}
        <div
          onClick={() => onNavigateTab("tasks")}
          className="rounded-xl border border-pulse-border bg-pulse-surface p-4 shadow-sm hover:border-rose-400/50 cursor-pointer transition"
        >
          <p className="text-[11px] font-bold uppercase tracking-wider text-rose-600">Overdue Tasks</p>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-rose-600">{kpis.overdue_tasks}</span>
            <span className="text-xs text-rose-500 font-medium">Action needed</span>
          </div>
        </div>

        {/* Weekly Hours Logged */}
        <div
          onClick={() => onNavigateTab("timesheets")}
          className="rounded-xl border border-pulse-border bg-pulse-surface p-4 shadow-sm hover:border-pulse-accent/50 cursor-pointer transition"
        >
          <p className="text-[11px] font-bold uppercase tracking-wider text-pulse-muted">Week Work Hours</p>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-black text-pulse-ink">{kpis.weekly_hours_logged}h</span>
            <span className="text-xs text-pulse-muted">Timesheet effort</span>
          </div>
        </div>
      </div>

      {/* Main Grid: My Work Focus + Project Health Table */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* My Work Today Column */}
        <div className="rounded-xl border border-pulse-border bg-pulse-surface p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-pulse-border pb-3">
            <div>
              <h3 className="text-sm font-bold text-pulse-ink">My Work Focus</h3>
              <p className="text-[11px] text-pulse-muted">Assigned to you</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab("my_work")}
              className="text-xs font-semibold text-pulse-accent hover:underline"
            >
              View all &rarr;
            </button>
          </div>

          {my_tasks.length === 0 ? (
            <div className="py-8 text-center text-xs text-pulse-muted">
              ✓ All caught up! No urgent tasks currently assigned to you.
            </div>
          ) : (
            <div className="space-y-2.5">
              {my_tasks.map((task) => (
                <div
                  key={task.id}
                  onClick={() => onOpenTaskDetail ? onOpenTaskDetail(task.id) : onNavigateTab("tasks")}
                  className="rounded-lg border border-pulse-border bg-pulse-bg p-3 hover:border-pulse-accent/60 cursor-pointer transition"
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-mono text-pulse-muted font-bold">{task.code}</span>
                    <span
                      className={`rounded px-1.5 py-0.2 text-[10px] font-bold uppercase ${
                        task.priority === "urgent"
                          ? "bg-rose-100 text-rose-800"
                          : task.priority === "high"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-pulse-hover text-pulse-muted"
                      }`}
                    >
                      {task.priority}
                    </span>
                  </div>
                  <h4 className="mt-1 text-xs font-bold text-pulse-ink line-clamp-1">{task.title}</h4>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-pulse-muted">
                    <span>{task.project_name}</span>
                    {task.due_date && <span>Due {task.due_date}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Project Health & Progress (2 Columns) */}
        <div className="rounded-xl border border-pulse-border bg-pulse-surface p-5 space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between border-b border-pulse-border pb-3">
            <div>
              <h3 className="text-sm font-bold text-pulse-ink">Active Projects Status</h3>
              <p className="text-[11px] text-pulse-muted">Progress velocity and deliverable deadlines</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab("projects")}
              className="text-xs font-semibold text-pulse-accent hover:underline"
            >
              All projects &rarr;
            </button>
          </div>

          {recent_projects.length === 0 ? (
            <div className="py-8 text-center text-xs text-pulse-muted">
              No active projects found. Click "+ New Project" to initialize your first initiative.
            </div>
          ) : (
            <div className="divide-y divide-pulse-border">
              {recent_projects.map((proj) => (
                <div
                  key={proj.id}
                  onClick={() => onNavigateTab("projects")}
                  className="py-3.5 first:pt-0 last:pb-0 flex flex-wrap items-center justify-between gap-4 hover:bg-pulse-hover/50 rounded-lg p-2 cursor-pointer transition"
                >
                  <div className="space-y-1 max-w-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-pulse-muted">{proj.code}</span>
                      <h4 className="text-xs font-bold text-pulse-ink">{proj.name}</h4>
                    </div>
                    <p className="text-[11px] text-pulse-muted line-clamp-1">
                      {proj.project_manager ? `PM: ${typeof proj.project_manager === "object" ? (proj.project_manager as any)?.name : proj.project_manager} · ` : ""}
                      {proj.due_date ? `Target: ${proj.due_date}` : "Ongoing"}
                    </p>
                  </div>

                  {/* Progress bar */}
                  <div className="w-48 space-y-1">
                    <div className="flex justify-between text-[11px] font-medium">
                      <span className="text-pulse-muted">{proj.tasks_completed}/{proj.tasks_total} tasks</span>
                      <span className="text-pulse-ink font-bold">{proj.progress_percentage}%</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-pulse-bg border border-pulse-border overflow-hidden">
                      <div
                        className="h-full bg-teal-600 rounded-full transition-all"
                        style={{ width: `${proj.progress_percentage}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
