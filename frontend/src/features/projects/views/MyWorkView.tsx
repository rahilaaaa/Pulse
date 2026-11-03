import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../shared/api/client";
import { LoadingState } from "../../../shared/ui/States";
import type { TaskStatus, TaskSummary } from "../types";

interface MyWorkViewProps {
  companyId: string;
  permissions: string[];
  onOpenTaskDetail: (taskId: string) => void;
  onOpenLogTimeForTask: (taskId: string, projectId?: string) => void;
}

type MyWorkFilter = "assigned" | "due_today" | "overdue" | "in_progress" | "completed";

export function MyWorkView({
  companyId,
  permissions: _permissions,
  onOpenTaskDetail,
  onOpenLogTimeForTask,
}: MyWorkViewProps) {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<MyWorkFilter>("assigned");
  const [search, setSearch] = useState("");

  const tasksQuery = useQuery({
    queryKey: ["projects-my-work", companyId],
    queryFn: () => api<{ results: TaskSummary[] }>(`/api/v1/companies/${companyId}/projects/tasks/?scope=my_work`),
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: TaskStatus }) =>
      api(`/api/v1/companies/${companyId}/projects/tasks/${taskId}/`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["projects-my-work", companyId] });
      await queryClient.invalidateQueries({ queryKey: ["projects-dashboard", companyId] });
      await queryClient.invalidateQueries({ queryKey: ["projects-tasks", companyId] });
    },
  });

  if (tasksQuery.isLoading || !tasksQuery.data) {
    return <LoadingState label="Loading your personal work queue..." />;
  }

  const allTasks = tasksQuery.data.results;
  const today = new Date().toISOString().slice(0, 10);

  const filteredTasks = allTasks.filter((t) => {
    // Status filters
    if (filter === "completed" && t.status !== "completed") return false;
    if (filter !== "completed" && t.status === "completed") return false;
    if (filter === "due_today" && t.due_date !== today) return false;
    if (filter === "overdue" && (!t.due_date || t.due_date >= today)) return false;
    if (filter === "in_progress" && t.status !== "in_progress") return false;

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      const match =
        t.title.toLowerCase().includes(q) ||
        t.code.toLowerCase().includes(q) ||
        (t.project?.name || "").toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header & Filter Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-pulse-border pb-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFilter("assigned")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              filter === "assigned"
                ? "bg-pulse-accent text-white shadow-sm"
                : "bg-pulse-surface text-pulse-muted hover:bg-pulse-hover hover:text-pulse-ink"
            }`}
          >
            Assigned to Me ({allTasks.filter((t) => t.status !== "completed").length})
          </button>
          <button
            type="button"
            onClick={() => setFilter("due_today")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              filter === "due_today"
                ? "bg-pulse-accent text-white shadow-sm"
                : "bg-pulse-surface text-pulse-muted hover:bg-pulse-hover hover:text-pulse-ink"
            }`}
          >
            Due Today ({allTasks.filter((t) => t.due_date === today && t.status !== "completed").length})
          </button>
          <button
            type="button"
            onClick={() => setFilter("overdue")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              filter === "overdue"
                ? "bg-rose-600 text-white shadow-sm"
                : "bg-pulse-surface text-pulse-muted hover:bg-pulse-hover hover:text-pulse-ink"
            }`}
          >
            Overdue ({allTasks.filter((t) => t.due_date && t.due_date < today && t.status !== "completed").length})
          </button>
          <button
            type="button"
            onClick={() => setFilter("in_progress")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              filter === "in_progress"
                ? "bg-pulse-accent text-white shadow-sm"
                : "bg-pulse-surface text-pulse-muted hover:bg-pulse-hover hover:text-pulse-ink"
            }`}
          >
            In Progress
          </button>
          <button
            type="button"
            onClick={() => setFilter("completed")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              filter === "completed"
                ? "bg-pulse-accent text-white shadow-sm"
                : "bg-pulse-surface text-pulse-muted hover:bg-pulse-hover hover:text-pulse-ink"
            }`}
          >
            Completed ({allTasks.filter((t) => t.status === "completed").length})
          </button>
        </div>

        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter my tasks..."
          className="rounded-lg border border-pulse-border bg-pulse-surface px-3 py-1.5 text-xs text-pulse-ink placeholder-pulse-muted focus:border-pulse-accent focus:outline-none"
        />
      </div>

      {/* Task Rows List */}
      {filteredTasks.length === 0 ? (
        <div className="rounded-xl border border-pulse-border bg-pulse-surface p-10 text-center text-xs text-pulse-muted">
          No tasks found matching current filter.
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredTasks.map((t) => {
            const isOverdue = t.due_date && t.due_date < today && t.status !== "completed";
            return (
              <div
                key={t.id}
                onClick={() => onOpenTaskDetail(t.id)}
                className="group flex flex-wrap items-center justify-between gap-4 rounded-xl border border-pulse-border bg-pulse-surface p-4 shadow-sm hover:border-pulse-accent/60 cursor-pointer transition"
              >
                {/* Left: Code, Title, Project, Dates */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-pulse-muted">{t.code}</span>
                    <h4 className="text-sm font-bold text-pulse-ink group-hover:text-pulse-accent transition">
                      {t.title}
                    </h4>
                    <span
                      className={`rounded px-1.5 py-0.2 text-[10px] font-bold uppercase ${
                        t.priority === "urgent"
                          ? "bg-rose-100 text-rose-800"
                          : t.priority === "high"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-pulse-hover text-pulse-muted"
                      }`}
                    >
                      {t.priority}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-pulse-muted">
                    <span>Initiative: <strong className="text-pulse-ink">{t.project?.name || "Standalone Work"}</strong></span>
                    {t.due_date && (
                      <span className={isOverdue ? "text-rose-600 font-bold" : ""}>
                        Due: {t.due_date} {isOverdue && "(Overdue)"}
                      </span>
                    )}
                    {Number(t.estimated_hours) > 0 && (
                      <span>Est: {t.estimated_hours}h</span>
                    )}
                    {Number(t.actual_hours) > 0 && (
                      <span className="text-teal-700">Logged: {t.actual_hours}h</span>
                    )}
                  </div>
                </div>

                {/* Right: Inline Quick Status Select + Log Time */}
                <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                  <select
                    value={t.status}
                    onChange={(e) => updateStatusMutation.mutate({ taskId: t.id, status: e.target.value as TaskStatus })}
                    className="rounded-lg border border-pulse-border bg-pulse-bg px-2.5 py-1 text-xs font-semibold text-pulse-ink focus:border-pulse-accent focus:outline-none"
                  >
                    <option value="todo">To Do</option>
                    <option value="in_progress">In Progress</option>
                    <option value="in_review">In Review</option>
                    <option value="blocked">Blocked</option>
                    <option value="completed">Completed</option>
                  </select>

                  <button
                    type="button"
                    onClick={() => onOpenLogTimeForTask(t.id, t.project?.id)}
                    className="rounded-lg border border-pulse-border bg-pulse-surface px-2.5 py-1 text-xs font-semibold text-pulse-accent hover:bg-pulse-hover transition flex items-center gap-1"
                  >
                    <span>⏱ Log</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
