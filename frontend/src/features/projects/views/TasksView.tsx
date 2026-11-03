import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../../shared/api/client";
import { LoadingState } from "../../../shared/ui/States";
import type {
  TaskSummary,
  TaskDetail,
  TaskStatus,
  TaskPriority,
  ProjectSummary,
} from "../types";

interface TasksViewProps {
  companyId: string;
  permissions: string[];
  initialTaskId?: string | null;
  onClearInitialTaskId?: () => void;
  onOpenLogTimeForTask: (taskId: string, projectId?: string) => void;
}

type ViewMode = "list" | "kanban" | "calendar" | "gantt";

const KANBAN_COLUMNS: { status: TaskStatus; label: string; color: string }[] = [
  { status: "backlog", label: "Backlog", color: "border-slate-300" },
  { status: "todo", label: "To Do", color: "border-blue-400" },
  { status: "in_progress", label: "In Progress", color: "border-amber-400" },
  { status: "in_review", label: "In Review", color: "border-purple-400" },
  { status: "completed", label: "Done", color: "border-emerald-500" },
];

export function TasksView({
  companyId,
  permissions,
  initialTaskId,
  onClearInitialTaskId,
  onOpenLogTimeForTask,
}: TasksViewProps) {
  const queryClient = useQueryClient();
  const canManage = permissions.includes("projects.task.manage");
  const canUpdateStatus = permissions.includes("projects.task.status");

  const [viewMode, setViewMode] = useState<ViewMode>("kanban");
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(initialTaskId || null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Queries
  const tasksQuery = useQuery({
    queryKey: ["projects-all-tasks", companyId],
    queryFn: () => api<{ results: TaskSummary[] }>(`/api/v1/companies/${companyId}/projects/tasks/`),
  });

  const projectsQuery = useQuery({
    queryKey: ["projects-list", companyId],
    queryFn: () => api<{ results: ProjectSummary[] }>(`/api/v1/companies/${companyId}/projects/projects/`),
  });

  const peopleQuery = useQuery({
    queryKey: ["company-people-options", companyId],
    queryFn: () => api<{ results: Array<{ id: string; first_name: string; last_name: string }> }>(
      `/api/v1/companies/${companyId}/people/`
    ),
  });

  // Task Detail Query
  const detailQuery = useQuery({
    queryKey: ["project-task-detail", companyId, selectedTaskId],
    queryFn: () => api<TaskDetail>(`/api/v1/companies/${companyId}/projects/tasks/${selectedTaskId}/`),
    enabled: Boolean(selectedTaskId),
  });

  // Mutations
  const updateStatusMutation = useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: TaskStatus }) =>
      api(`/api/v1/companies/${companyId}/projects/tasks/${taskId}/`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["projects-all-tasks", companyId] });
      await queryClient.invalidateQueries({ queryKey: ["project-task-detail", companyId, selectedTaskId] });
      await queryClient.invalidateQueries({ queryKey: ["projects-dashboard", companyId] });
    },
  });

  // Create Task Form State
  const [title, setTitle] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [assigneeId, setAssigneeId] = useState("");
  const [reviewerId, setReviewerId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [estimatedHours, setEstimatedHours] = useState("4.00");
  const [createError, setCreateError] = useState("");

  const createTaskMutation = useMutation({
    mutationFn: () =>
      api(`/api/v1/companies/${companyId}/projects/tasks/`, {
        method: "POST",
        body: JSON.stringify({
          title,
          code: code || undefined,
          description,
          project_id: projectId || undefined,
          priority,
          assignee_id: assigneeId || undefined,
          reviewer_id: reviewerId || undefined,
          start_date: startDate || undefined,
          due_date: dueDate || undefined,
          estimated_hours: estimatedHours,
        }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["projects-all-tasks", companyId] });
      await queryClient.invalidateQueries({ queryKey: ["projects-dashboard", companyId] });
      setShowCreateModal(false);
      resetCreateForm();
    },
    onError: (err: unknown) => {
      setCreateError(err instanceof ApiError ? err.message : "Failed to create task");
    },
  });

  const resetCreateForm = () => {
    setTitle("");
    setCode("");
    setDescription("");
    setProjectId("");
    setPriority("medium");
    setAssigneeId("");
    setReviewerId("");
    setStartDate("");
    setDueDate("");
    setEstimatedHours("4.00");
    setCreateError("");
  };

  // Add Comment Form State
  const [commentContent, setCommentContent] = useState("");
  const addCommentMutation = useMutation({
    mutationFn: () =>
      api(`/api/v1/companies/${companyId}/projects/tasks/${selectedTaskId}/comments/`, {
        method: "POST",
        body: JSON.stringify({ content: commentContent }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["project-task-detail", companyId, selectedTaskId] });
      setCommentContent("");
    },
  });

  // Add Subtask
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const addSubtaskMutation = useMutation({
    mutationFn: () =>
      api(`/api/v1/companies/${companyId}/projects/tasks/`, {
        method: "POST",
        body: JSON.stringify({
          title: subtaskTitle,
          parent_task_id: selectedTaskId,
          project_id: detailQuery.data?.project?.id,
          priority: "medium",
        }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["project-task-detail", companyId, selectedTaskId] });
      await queryClient.invalidateQueries({ queryKey: ["projects-all-tasks", companyId] });
      setSubtaskTitle("");
    },
  });

  const allTasks = tasksQuery.data?.results || [];
  const projects = projectsQuery.data?.results || [];
  const people = peopleQuery.data?.results || [];

  const filteredTasks = useMemo(() => {
    return allTasks.filter((t) => {
      if (projectFilter !== "all") {
        if (!t.project && projectFilter !== "standalone") return false;
        if (t.project && t.project.id !== projectFilter) return false;
      }
      if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const mTitle = t.title.toLowerCase().includes(q);
        const mCode = t.code.toLowerCase().includes(q);
        const mAssignee = t.assignee?.name.toLowerCase().includes(q);
        const mProj = t.project?.name.toLowerCase().includes(q);
        return mTitle || mCode || mAssignee || mProj;
      }
      return true;
    });
  }, [allTasks, projectFilter, priorityFilter, statusFilter, search]);

  if (tasksQuery.isLoading) {
    return <LoadingState label="Loading work management board..." />;
  }

  const priorityColors: Record<string, string> = {
    urgent: "bg-rose-100 text-rose-800 border-rose-200",
    high: "bg-amber-100 text-amber-800 border-amber-200",
    medium: "bg-blue-100 text-blue-800 border-blue-200",
    low: "bg-slate-100 text-slate-700 border-slate-200",
  };

  const statusBadgeColors: Record<string, string> = {
    backlog: "bg-slate-100 text-slate-800",
    todo: "bg-blue-50 text-blue-700",
    in_progress: "bg-amber-50 text-amber-800",
    in_review: "bg-purple-50 text-purple-700",
    completed: "bg-emerald-50 text-emerald-800",
    blocked: "bg-rose-50 text-rose-800",
    cancelled: "bg-gray-100 text-gray-500",
  };

  return (
    <div className="space-y-5">
      {/* View Switcher & Action Bar */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        {/* Left: View Tabs */}
        <div className="flex items-center gap-1 rounded-lg border border-pulse-border bg-pulse-surface p-1 self-start">
          <button
            type="button"
            onClick={() => setViewMode("kanban")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              viewMode === "kanban"
                ? "bg-white text-pulse-ink shadow-sm"
                : "text-pulse-muted hover:text-pulse-ink"
            }`}
          >
            Kanban Board
          </button>
          <button
            type="button"
            onClick={() => setViewMode("list")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              viewMode === "list"
                ? "bg-white text-pulse-ink shadow-sm"
                : "text-pulse-muted hover:text-pulse-ink"
            }`}
          >
            List View
          </button>
          <button
            type="button"
            onClick={() => setViewMode("calendar")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              viewMode === "calendar"
                ? "bg-white text-pulse-ink shadow-sm"
                : "text-pulse-muted hover:text-pulse-ink"
            }`}
          >
            Calendar
          </button>
          <button
            type="button"
            onClick={() => setViewMode("gantt")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              viewMode === "gantt"
                ? "bg-white text-pulse-ink shadow-sm"
                : "text-pulse-muted hover:text-pulse-ink"
            }`}
          >
            Timeline / Gantt
          </button>
        </div>

        {/* Right: Filters and New Task */}
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="Search tasks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-44 rounded-md border border-pulse-border bg-white px-3 py-1.5 text-xs focus:border-teal-600 focus:outline-none"
          />

          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="rounded-md border border-pulse-border bg-white px-2.5 py-1.5 text-xs focus:border-teal-600 focus:outline-none"
          >
            <option value="all">All Projects</option>
            <option value="standalone">Standalone (No Project)</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} - {p.name}
              </option>
            ))}
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="rounded-md border border-pulse-border bg-white px-2.5 py-1.5 text-xs focus:border-teal-600 focus:outline-none"
          >
            <option value="all">All Priorities</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border border-pulse-border bg-white px-2.5 py-1.5 text-xs focus:border-teal-600 focus:outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="backlog">Backlog</option>
            <option value="todo">To Do</option>
            <option value="in_progress">In Progress</option>
            <option value="in_review">In Review</option>
            <option value="completed">Completed</option>
          </select>

          {canManage && (
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center justify-center rounded-md bg-[#0D9488] px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-[#0f766e]"
            >
              + New Task
            </button>
          )}
        </div>
      </div>

      {/* 1. KANBAN BOARD VIEW */}
      {viewMode === "kanban" && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 overflow-x-auto min-h-[600px] pb-4">
          {KANBAN_COLUMNS.map((col) => {
            const tasksInCol = filteredTasks.filter((t) => t.status === col.status);
            return (
              <div
                key={col.status}
                className="flex flex-col rounded-xl border border-pulse-border bg-pulse-surface p-3 min-w-[240px]"
              >
                {/* Column Header */}
                <div className={`flex items-center justify-between border-b-2 ${col.color} pb-2 mb-3`}>
                  <span className="text-xs font-bold text-pulse-ink uppercase tracking-wider">
                    {col.label}
                  </span>
                  <span className="rounded-full bg-pulse-hover px-2 py-0.5 text-[11px] font-bold text-pulse-muted">
                    {tasksInCol.length}
                  </span>
                </div>

                {/* Cards in Column */}
                <div className="flex-1 space-y-2.5 overflow-y-auto">
                  {tasksInCol.map((task) => (
                    <div
                      key={task.id}
                      onClick={() => setSelectedTaskId(task.id)}
                      className="group cursor-pointer rounded-lg border border-pulse-border bg-white p-3 shadow-sm hover:shadow-md hover:border-teal-500 transition space-y-2"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-mono text-[11px] font-bold text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded border border-teal-200">
                          {task.code}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                            priorityColors[task.priority] || "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {task.priority.toUpperCase()}
                        </span>
                      </div>

                      <h4 className="text-xs font-bold text-pulse-ink group-hover:text-teal-700 line-clamp-2">
                        {task.title}
                      </h4>

                      {task.project && (
                        <div className="text-[10px] font-medium text-pulse-muted truncate">
                          📁 {task.project.code} · {task.project.name}
                        </div>
                      )}

                      <div className="pt-2 border-t border-pulse-border flex items-center justify-between text-[11px] text-pulse-muted">
                        <span className="font-medium text-pulse-ink truncate max-w-[120px]">
                          👤 {task.assignee?.name || "Unassigned"}
                        </span>
                        {task.due_date && (
                          <span className="text-[10px] text-gray-500">
                            📅 {task.due_date}
                          </span>
                        )}
                      </div>

                      {/* Quick Move Selector */}
                      {canUpdateStatus && (
                        <div
                          className="pt-1 flex items-center justify-end"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <select
                            value={task.status}
                            onChange={(e) =>
                              updateStatusMutation.mutate({
                                taskId: task.id,
                                status: e.target.value as TaskStatus,
                              })
                            }
                            className="text-[10px] font-semibold rounded border border-pulse-border bg-pulse-surface px-1.5 py-0.5 text-pulse-muted hover:text-pulse-ink"
                          >
                            <option value="backlog">Backlog</option>
                            <option value="todo">To Do</option>
                            <option value="in_progress">In Progress</option>
                            <option value="in_review">In Review</option>
                            <option value="completed">Done</option>
                          </select>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 2. LIST VIEW */}
      {viewMode === "list" && (
        <div className="rounded-xl border border-pulse-border bg-white overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-pulse-border bg-pulse-surface text-pulse-muted uppercase tracking-wider font-semibold">
                <tr>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Task Title</th>
                  <th className="px-4 py-3">Project</th>
                  <th className="px-4 py-3">Assignee</th>
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Due Date</th>
                  <th className="px-4 py-3 text-right">Hours</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pulse-border">
                {filteredTasks.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-pulse-muted">
                      No tasks matching criteria.
                    </td>
                  </tr>
                ) : (
                  filteredTasks.map((t) => (
                    <tr
                      key={t.id}
                      onClick={() => setSelectedTaskId(t.id)}
                      className="hover:bg-pulse-surface cursor-pointer transition"
                    >
                      <td className="px-4 py-3 font-mono font-bold text-teal-700">{t.code}</td>
                      <td className="px-4 py-3 font-semibold text-pulse-ink">{t.title}</td>
                      <td className="px-4 py-3 text-pulse-muted">
                        {t.project ? `${t.project.code} · ${t.project.name}` : "— Standalone —"}
                      </td>
                      <td className="px-4 py-3 text-pulse-ink">{t.assignee?.name || "Unassigned"}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                            priorityColors[t.priority] || "bg-gray-100"
                          }`}
                        >
                          {t.priority.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <select
                          value={t.status}
                          disabled={!canUpdateStatus}
                          onChange={(e) =>
                            updateStatusMutation.mutate({
                              taskId: t.id,
                              status: e.target.value as TaskStatus,
                            })
                          }
                          className={`text-[11px] font-semibold rounded px-2 py-0.5 border border-pulse-border ${
                            statusBadgeColors[t.status] || "bg-gray-50"
                          }`}
                        >
                          <option value="backlog">Backlog</option>
                          <option value="todo">To Do</option>
                          <option value="in_progress">In Progress</option>
                          <option value="in_review">In Review</option>
                          <option value="completed">Completed</option>
                          <option value="blocked">Blocked</option>
                        </select>
                      </td>
                      <td className="px-4 py-3 text-pulse-muted">{t.due_date || "—"}</td>
                      <td className="px-4 py-3 text-right font-mono text-pulse-muted">
                        {t.actual_hours}h / {t.estimated_hours}h
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. CALENDAR VIEW */}
      {viewMode === "calendar" && (
        <div className="rounded-xl border border-pulse-border bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-pulse-ink">Task Deadlines & Schedule</h3>
            <span className="text-xs text-pulse-muted">Tasks arranged by target due date</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {filteredTasks
              .filter((t) => Boolean(t.due_date))
              .sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""))
              .map((t) => (
                <div
                  key={t.id}
                  onClick={() => setSelectedTaskId(t.id)}
                  className="cursor-pointer rounded-lg border border-pulse-border p-3 hover:border-teal-500 bg-pulse-surface transition"
                >
                  <div className="flex items-center justify-between text-[11px] font-bold text-teal-800">
                    <span>📅 {t.due_date}</span>
                    <span className="font-mono">{t.code}</span>
                  </div>
                  <h4 className="mt-1 text-xs font-bold text-pulse-ink line-clamp-1">{t.title}</h4>
                  <div className="mt-2 text-[11px] text-pulse-muted flex items-center justify-between">
                    <span>{t.assignee?.name || "Unassigned"}</span>
                    <span className="capitalize">{t.status.replace("_", " ")}</span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* 4. GANTT / TIMELINE VIEW */}
      {viewMode === "gantt" && (
        <div className="rounded-xl border border-pulse-border bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-pulse-ink">Task Execution Timeline</h3>
              <p className="text-xs text-pulse-muted">Visual start to due date schedules with effort tracking.</p>
            </div>
          </div>

          <div className="space-y-3">
            {filteredTasks.slice(0, 15).map((t) => {
              const est = parseFloat(t.estimated_hours) || 1;
              const act = parseFloat(t.actual_hours) || 0;
              const pct = Math.min(100, Math.round((act / est) * 100));

              return (
                <div
                  key={t.id}
                  onClick={() => setSelectedTaskId(t.id)}
                  className="cursor-pointer p-3 rounded-lg border border-pulse-border hover:border-teal-500 transition bg-pulse-surface flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="w-64">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] font-bold text-teal-700">{t.code}</span>
                      <span className="text-xs font-bold text-pulse-ink truncate">{t.title}</span>
                    </div>
                    <div className="text-[11px] text-pulse-muted mt-0.5">
                      {t.project ? t.project.name : "Standalone"} · {t.assignee?.name || "Unassigned"}
                    </div>
                  </div>

                  <div className="flex-1 max-w-md">
                    <div className="flex items-center justify-between text-[11px] text-pulse-muted mb-1">
                      <span>{t.start_date || "Not set"} &rarr; {t.due_date || "Not set"}</span>
                      <span className="font-mono">{t.actual_hours}h / {t.estimated_hours}h ({pct}%)</span>
                    </div>
                    <div className="w-full bg-pulse-border rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-2 rounded-full ${pct >= 100 ? "bg-amber-500" : "bg-[#0D9488]"}`}
                        style={{ width: `${Math.max(5, pct)}%` }}
                      />
                    </div>
                  </div>

                  <div className="w-24 text-right">
                    <span className="rounded bg-pulse-hover px-2 py-0.5 text-[10px] font-bold capitalize">
                      {t.status.replace("_", " ")}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* CREATE TASK MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-xl bg-white shadow-2xl border border-pulse-border max-h-[90vh] flex flex-col overflow-hidden">
            <div className="border-b border-pulse-border p-5 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-pulse-ink">Create New Task</h2>
                <p className="text-xs text-pulse-muted">Assign work to team members with clear deadlines.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowCreateModal(false);
                  resetCreateForm();
                }}
                className="text-pulse-muted hover:text-pulse-ink text-xl font-bold"
              >
                &times;
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                createTaskMutation.mutate();
              }}
              className="p-6 space-y-4 overflow-y-auto flex-1"
            >
              {createError && (
                <div className="rounded-md border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800">
                  {createError}
                </div>
              )}

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-pulse-ink mb-1">Task Title *</label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Implement OAuth2 client credentials grant"
                    className="w-full rounded-md border border-pulse-border px-3 py-2 text-xs focus:border-teal-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-pulse-ink mb-1">Task Code</label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="Auto (TSK-001)"
                    className="w-full rounded-md border border-pulse-border px-3 py-2 text-xs uppercase focus:border-teal-600 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-pulse-ink mb-1">Project Association</label>
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="w-full rounded-md border border-pulse-border px-3 py-2 text-xs focus:border-teal-600 focus:outline-none"
                >
                  <option value="">Standalone Task (No Project)</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} - {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-pulse-ink mb-1">Description & Acceptance Criteria</label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Specific requirements, edge cases, and definition of done..."
                  className="w-full rounded-md border border-pulse-border px-3 py-2 text-xs focus:border-teal-600 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-pulse-ink mb-1">Primary Assignee</label>
                  <select
                    value={assigneeId}
                    onChange={(e) => setAssigneeId(e.target.value)}
                    className="w-full rounded-md border border-pulse-border px-3 py-2 text-xs focus:border-teal-600 focus:outline-none"
                  >
                    <option value="">Select Assignee</option>
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.first_name} {p.last_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-pulse-ink mb-1">Reviewer / Approver</label>
                  <select
                    value={reviewerId}
                    onChange={(e) => setReviewerId(e.target.value)}
                    className="w-full rounded-md border border-pulse-border px-3 py-2 text-xs focus:border-teal-600 focus:outline-none"
                  >
                    <option value="">Select Reviewer</option>
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.first_name} {p.last_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-pulse-ink mb-1">Priority</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as TaskPriority)}
                    className="w-full rounded-md border border-pulse-border px-3 py-2 text-xs focus:border-teal-600 focus:outline-none"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-pulse-ink mb-1">Start Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full rounded-md border border-pulse-border px-3 py-2 text-xs focus:border-teal-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-pulse-ink mb-1">Due Date</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full rounded-md border border-pulse-border px-3 py-2 text-xs focus:border-teal-600 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-pulse-ink mb-1">Estimated Hours</label>
                <input
                  type="number"
                  step="0.5"
                  value={estimatedHours}
                  onChange={(e) => setEstimatedHours(e.target.value)}
                  className="w-32 rounded-md border border-pulse-border px-3 py-2 text-xs focus:border-teal-600 focus:outline-none"
                />
              </div>

              <div className="border-t border-pulse-border pt-4 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    resetCreateForm();
                  }}
                  className="rounded-md border border-pulse-border px-4 py-2 text-xs font-semibold text-pulse-muted hover:text-pulse-ink"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createTaskMutation.isPending}
                  className="rounded-md bg-[#0D9488] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0f766e] disabled:opacity-50"
                >
                  {createTaskMutation.isPending ? "Creating..." : "Create Task"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TASK DETAILS DRAWER */}
      {selectedTaskId && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/40">
          <div className="w-full max-w-2xl h-full bg-white shadow-2xl flex flex-col overflow-hidden animate-slide-left">
            {detailQuery.isLoading || !detailQuery.data ? (
              <div className="p-12">
                <LoadingState label="Loading task details..." />
              </div>
            ) : (
              <div className="flex flex-col h-full">
                {/* Header */}
                <div className="border-b border-pulse-border p-6 bg-pulse-surface flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                        {detailQuery.data.code}
                      </span>
                      {detailQuery.data.project && (
                        <span className="text-xs font-medium text-pulse-muted">
                          📁 {detailQuery.data.project.name}
                        </span>
                      )}
                    </div>
                    <h2 className="text-lg font-bold text-pulse-ink">{detailQuery.data.title}</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTaskId(null);
                      if (onClearInitialTaskId) onClearInitialTaskId();
                    }}
                    className="text-pulse-muted hover:text-pulse-ink text-2xl font-bold"
                  >
                    &times;
                  </button>
                </div>

                {/* Status and Action Ribbon */}
                <div className="bg-pulse-surface px-6 py-3 border-b border-pulse-border flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-pulse-muted font-medium">Status:</span>
                    <select
                      value={detailQuery.data.status}
                      disabled={!canUpdateStatus}
                      onChange={(e) =>
                        updateStatusMutation.mutate({
                          taskId: detailQuery.data.id,
                          status: e.target.value as TaskStatus,
                        })
                      }
                      className="font-semibold rounded border border-pulse-border bg-white px-2.5 py-1 text-pulse-ink"
                    >
                      <option value="backlog">Backlog</option>
                      <option value="todo">To Do</option>
                      <option value="in_progress">In Progress</option>
                      <option value="in_review">In Review</option>
                      <option value="completed">Completed</option>
                      <option value="blocked">Blocked</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      onOpenLogTimeForTask(
                        detailQuery.data.id,
                        detailQuery.data.project?.id
                      )
                    }
                    className="rounded bg-teal-700 px-3 py-1 font-semibold text-white hover:bg-teal-800"
                  >
                    ⏱ Log Time on Task
                  </button>
                </div>

                {/* Body Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  {/* Metadata Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 rounded-lg bg-pulse-surface p-4 text-xs">
                    <div>
                      <span className="text-pulse-muted block">Assignee</span>
                      <strong className="text-pulse-ink">
                        {detailQuery.data.assignee?.name || "Unassigned"}
                      </strong>
                    </div>
                    <div>
                      <span className="text-pulse-muted block">Reviewer</span>
                      <strong className="text-pulse-ink">
                        {detailQuery.data.reviewer?.name || "None"}
                      </strong>
                    </div>
                    <div>
                      <span className="text-pulse-muted block">Due Date</span>
                      <strong className="text-pulse-ink">
                        {detailQuery.data.due_date || "No deadline"}
                      </strong>
                    </div>
                    <div>
                      <span className="text-pulse-muted block">Hours Logged</span>
                      <strong className="text-pulse-ink">
                        {detailQuery.data.actual_hours}h / {detailQuery.data.estimated_hours}h
                      </strong>
                    </div>
                  </div>

                  {/* Description */}
                  <div>
                    <h3 className="text-xs font-bold text-pulse-ink uppercase tracking-wider mb-2">
                      Description
                    </h3>
                    <p className="text-xs text-pulse-ink whitespace-pre-wrap leading-relaxed rounded-md border border-pulse-border p-3 bg-white">
                      {detailQuery.data.description || "No description provided."}
                    </p>
                  </div>

                  {/* Subtasks Section */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold text-pulse-ink uppercase tracking-wider">
                      Subtasks Checklist ({detailQuery.data.subtasks.length})
                    </h3>
                    <div className="space-y-1.5">
                      {detailQuery.data.subtasks.map((st) => (
                        <div
                          key={st.id}
                          className="flex items-center justify-between rounded border border-pulse-border p-2 text-xs bg-white"
                        >
                          <span
                            className={
                              st.status === "completed"
                                ? "line-through text-pulse-muted"
                                : "font-medium text-pulse-ink"
                            }
                          >
                            {st.code} · {st.title}
                          </span>
                          <span className="text-[10px] uppercase font-semibold text-teal-700">
                            {st.status}
                          </span>
                        </div>
                      ))}

                      <div className="flex items-center gap-2 pt-1">
                        <input
                          type="text"
                          placeholder="Add a subtask..."
                          value={subtaskTitle}
                          onChange={(e) => setSubtaskTitle(e.target.value)}
                          className="flex-1 rounded border border-pulse-border px-3 py-1.5 text-xs focus:outline-none"
                        />
                        <button
                          type="button"
                          disabled={!subtaskTitle.trim() || addSubtaskMutation.isPending}
                          onClick={() => addSubtaskMutation.mutate()}
                          className="rounded bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Collaboration & Comments */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold text-pulse-ink uppercase tracking-wider">
                      Comments & Collaboration ({detailQuery.data.comments.length})
                    </h3>

                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {detailQuery.data.comments.map((c) => (
                        <div key={c.id} className="rounded-md border border-pulse-border p-3 bg-white text-xs">
                          <div className="flex items-center justify-between font-semibold text-pulse-ink mb-1">
                            <span>{c.author_name}</span>
                            <span className="text-[10px] text-gray-400 font-normal">
                              {new Date(c.created_at).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-pulse-ink leading-relaxed">{c.content}</p>
                        </div>
                      ))}
                    </div>

                    <div className="space-y-2">
                      <textarea
                        rows={2}
                        placeholder="Add a comment... (Type @ to mention teammates)"
                        value={commentContent}
                        onChange={(e) => setCommentContent(e.target.value)}
                        className="w-full rounded-md border border-pulse-border p-2.5 text-xs focus:outline-none"
                      />
                      <button
                        type="button"
                        disabled={!commentContent.trim() || addCommentMutation.isPending}
                        onClick={() => addCommentMutation.mutate()}
                        className="rounded bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
                      >
                        Post Comment
                      </button>
                    </div>
                  </div>

                  {/* Audit / Activity Stream */}
                  <div className="border-t border-pulse-border pt-4 space-y-2">
                    <h3 className="text-[11px] font-bold text-pulse-muted uppercase tracking-wider">
                      Activity History
                    </h3>
                    <div className="space-y-1 text-[11px] text-pulse-muted">
                      {detailQuery.data.activities.map((a) => (
                        <div key={a.id} className="flex items-center gap-2">
                          <span className="font-semibold text-pulse-ink">{a.actor_name}:</span>
                          <span>{a.summary}</span>
                          <span className="ml-auto text-gray-400">
                            {new Date(a.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
