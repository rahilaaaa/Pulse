import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, ApiError } from "../../../shared/api/client";
import { Button } from "../../../shared/ui/Button";
import type { Employment, OffboardingTaskRow, OnboardingTaskRow } from "../types";

const panelClass = "rounded-lg border border-pulse-border bg-pulse-surface p-4 shadow-sm";

function errorText(error: unknown) {
  return error instanceof ApiError ? error.message : "The request could not be completed.";
}

interface OnboardingViewProps {
  companyId: string;
  permissions: string[];
  employments: Employment[];
  selectedEmploymentId: string;
}

export function OnboardingView({
  companyId,
  permissions,
  employments,
  selectedEmploymentId,
}: OnboardingViewProps) {
  const queryClient = useQueryClient();
  const can = (code: string) => permissions.includes(code);
  const root = `/api/v1/companies/${companyId}/hrms`;

  const canManage = can("hrms.admin.view") || can("hrms.employee.manage");

  type SubTab = "my_tasks" | "all_onboarding" | "all_offboarding";
  const [activeTab, setActiveTab] = useState<SubTab>(canManage ? "all_onboarding" : "my_tasks");

  const [feedback, setFeedback] = useState<string | null>(null);

  // New task modals
  const [showNewTaskModal, setShowNewTaskModal] = useState(false);
  const [isOffboarding, setIsOffboarding] = useState(false);
  const [targetEmpId, setTargetEmpId] = useState(selectedEmploymentId || (employments[0]?.id ?? ""));
  const [taskTitle, setTaskTitle] = useState("");
  const [taskCategory, setTaskCategory] = useState("document");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [taskNotes, setTaskNotes] = useState("");

  // Queries
  const myTasks = useQuery({
    queryKey: ["hrms-my-onboarding-tasks", companyId, selectedEmploymentId],
    queryFn: () => api<{ results: OnboardingTaskRow[] }>(`${root}/onboarding-tasks/?employment_id=${selectedEmploymentId}`),
    enabled: Boolean(selectedEmploymentId),
  });

  const allOnboarding = useQuery({
    queryKey: ["hrms-all-onboarding-tasks", companyId],
    queryFn: () => api<{ results: OnboardingTaskRow[] }>(`${root}/onboarding-tasks/`),
    enabled: canManage,
  });

  const allOffboarding = useQuery({
    queryKey: ["hrms-all-offboarding-tasks", companyId],
    queryFn: () => api<{ results: OffboardingTaskRow[] }>(`${root}/offboarding-tasks/`),
    enabled: canManage,
  });

  // Mutations
  const updateOnboardingTask = useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: string }) =>
      api(`${root}/onboarding-tasks/${taskId}/`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: async () => {
      setFeedback("Task status updated.");
      await queryClient.invalidateQueries({ queryKey: ["hrms-my-onboarding-tasks", companyId] });
      await queryClient.invalidateQueries({ queryKey: ["hrms-all-onboarding-tasks", companyId] });
      await queryClient.invalidateQueries({ queryKey: ["hrms-dashboard", companyId] });
    },
    onError: (err) => setFeedback(errorText(err)),
  });

  const updateOffboardingTask = useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: string }) =>
      api(`${root}/offboarding-tasks/${taskId}/`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: async () => {
      setFeedback("Task status updated.");
      await queryClient.invalidateQueries({ queryKey: ["hrms-all-offboarding-tasks", companyId] });
      await queryClient.invalidateQueries({ queryKey: ["hrms-dashboard", companyId] });
    },
    onError: (err) => setFeedback(errorText(err)),
  });

  const createTask = useMutation({
    mutationFn: () => {
      const endpoint = isOffboarding ? `${root}/offboarding-tasks/` : `${root}/onboarding-tasks/`;
      return api(endpoint, {
        method: "POST",
        body: JSON.stringify({
          employment_id: targetEmpId,
          title: taskTitle,
          category: taskCategory,
          due_date: taskDueDate || null,
          notes: taskNotes,
        }),
      });
    },
    onSuccess: async () => {
      setFeedback("Lifecycle checklist task created.");
      setShowNewTaskModal(false);
      setTaskTitle("");
      setTaskNotes("");
      setTaskDueDate("");
      await queryClient.invalidateQueries({ queryKey: ["hrms-my-onboarding-tasks", companyId] });
      await queryClient.invalidateQueries({ queryKey: ["hrms-all-onboarding-tasks", companyId] });
      await queryClient.invalidateQueries({ queryKey: ["hrms-all-offboarding-tasks", companyId] });
      await queryClient.invalidateQueries({ queryKey: ["hrms-dashboard", companyId] });
    },
    onError: (err) => setFeedback(errorText(err)),
  });

  const myTaskList = myTasks.data?.results ?? [];
  const onboardingList = allOnboarding.data?.results ?? [];
  const offboardingList = allOffboarding.data?.results ?? [];

  return (
    <div className="space-y-4">
      {/* Feedback Alert */}
      {feedback && (
        <div className="flex items-center justify-between rounded-lg border border-teal-200 bg-teal-50 p-3 text-xs text-teal-800 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-200">
          <span>{feedback}</span>
          <button type="button" onClick={() => setFeedback(null)} className="font-semibold underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Header and Controls */}
      <section className={panelClass}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-pulse-ink">Employee Lifecycle & Onboarding</h2>
            <p className="text-xs text-pulse-muted">
              Checklist tasks, orientation items, asset tracking, and offboarding clearance.
            </p>
          </div>
          {canManage && (
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => { setIsOffboarding(false); setShowNewTaskModal(true); }}>
                + Add Onboarding Task
              </Button>
              <Button size="sm" variant="secondary" onClick={() => { setIsOffboarding(true); setShowNewTaskModal(true); }}>
                + Add Offboarding Task
              </Button>
            </div>
          )}
        </div>

        {/* Sub-Tabs */}
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-pulse-border pt-3 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab("my_tasks")}
            className={`rounded-md px-3 py-1.5 font-semibold transition ${
              activeTab === "my_tasks"
                ? "bg-pulse-accent text-white shadow-sm"
                : "bg-pulse-hover text-pulse-muted hover:text-pulse-ink"
            }`}
          >
            My Assigned Tasks ({myTaskList.filter((t) => t.status !== "completed").length})
          </button>

          {canManage && (
            <>
              <button
                type="button"
                onClick={() => setActiveTab("all_onboarding")}
                className={`rounded-md px-3 py-1.5 font-semibold transition ${
                  activeTab === "all_onboarding"
                    ? "bg-pulse-accent text-white shadow-sm"
                    : "bg-pulse-hover text-pulse-muted hover:text-pulse-ink"
                }`}
              >
                All Onboarding Tasks ({onboardingList.filter((t) => t.status !== "completed").length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("all_offboarding")}
                className={`rounded-md px-3 py-1.5 font-semibold transition ${
                  activeTab === "all_offboarding"
                    ? "bg-pulse-accent text-white shadow-sm"
                    : "bg-pulse-hover text-pulse-muted hover:text-pulse-ink"
                }`}
              >
                All Offboarding Tasks ({offboardingList.filter((t) => t.status !== "completed").length})
              </button>
            </>
          )}
        </div>
      </section>

      {/* SUB-TAB 1: My Personal Assigned Tasks */}
      {activeTab === "my_tasks" && (
        <section className={panelClass}>
          <h3 className="text-base font-bold text-pulse-ink mb-3">My Onboarding Checklist</h3>
          {myTaskList.length === 0 ? (
            <div className="py-8 text-center text-xs text-pulse-muted">
              ✨ You have completed all assigned onboarding checklist tasks!
            </div>
          ) : (
            <div className="space-y-2.5">
              {myTaskList.map((task) => (
                <div
                  key={task.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-pulse-border bg-pulse-hover/30 p-3 text-xs"
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={task.status === "completed"}
                      onChange={(e) =>
                        updateOnboardingTask.mutate({
                          taskId: task.id,
                          status: e.target.checked ? "completed" : "in_progress",
                        })
                      }
                      className="mt-1 h-4 w-4 rounded border-pulse-border text-pulse-accent focus:ring-pulse-accent cursor-pointer"
                    />
                    <div>
                      <p
                        className={`font-semibold text-sm ${
                          task.status === "completed" ? "line-through text-pulse-muted" : "text-pulse-ink"
                        }`}
                      >
                        {task.title}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 text-pulse-muted">
                        <span className="capitalize">{task.category}</span>
                        {task.due_date && <span>· Due: {task.due_date}</span>}
                      </div>
                      {task.notes && <p className="mt-1 text-[11px] text-pulse-muted">{task.notes}</p>}
                    </div>
                  </div>

                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      task.status === "completed"
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                        : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                    }`}
                  >
                    {task.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* SUB-TAB 2: Company-wide Onboarding Pipeline */}
      {activeTab === "all_onboarding" && (
        <section className={`${panelClass} overflow-hidden p-0`}>
          <div className="p-4 border-b border-pulse-border">
            <h3 className="text-base font-bold text-pulse-ink">Company Onboarding Tasks Pipeline</h3>
          </div>
          {onboardingList.length === 0 ? (
            <div className="p-8 text-center text-xs text-pulse-muted">
              No active onboarding tasks recorded.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-pulse-border bg-pulse-hover/50 text-pulse-muted">
                    <th className="px-4 py-3 font-semibold">Employee</th>
                    <th className="px-4 py-3 font-semibold">Task Title</th>
                    <th className="px-4 py-3 font-semibold">Category</th>
                    <th className="px-4 py-3 font-semibold">Due Date</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-pulse-border">
                  {onboardingList.map((t) => (
                    <tr key={t.id} className="hover:bg-pulse-hover/60">
                      <td className="px-4 py-3 font-semibold text-pulse-ink">{t.employee_name}</td>
                      <td className="px-4 py-3 font-medium text-pulse-ink">{t.title}</td>
                      <td className="px-4 py-3 capitalize text-pulse-muted">{t.category}</td>
                      <td className="px-4 py-3 font-mono text-pulse-muted">{t.due_date || "—"}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            t.status === "completed"
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                              : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                          }`}
                        >
                          {t.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {t.status !== "completed" ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => updateOnboardingTask.mutate({ taskId: t.id, status: "completed" })}
                          >
                            Mark Done
                          </Button>
                        ) : (
                          <span className="text-emerald-600 font-semibold text-[11px]">✓ Done</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* SUB-TAB 3: Company-wide Offboarding Pipeline */}
      {activeTab === "all_offboarding" && (
        <section className={`${panelClass} overflow-hidden p-0`}>
          <div className="p-4 border-b border-pulse-border">
            <h3 className="text-base font-bold text-pulse-ink">Company Offboarding Clearance Pipeline</h3>
          </div>
          {offboardingList.length === 0 ? (
            <div className="p-8 text-center text-xs text-pulse-muted">
              No active offboarding clearance tasks recorded.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-pulse-border bg-pulse-hover/50 text-pulse-muted">
                    <th className="px-4 py-3 font-semibold">Employee</th>
                    <th className="px-4 py-3 font-semibold">Task Title</th>
                    <th className="px-4 py-3 font-semibold">Category</th>
                    <th className="px-4 py-3 font-semibold">Due Date</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-pulse-border">
                  {offboardingList.map((t) => (
                    <tr key={t.id} className="hover:bg-pulse-hover/60">
                      <td className="px-4 py-3 font-semibold text-pulse-ink">{t.employee_name}</td>
                      <td className="px-4 py-3 font-medium text-pulse-ink">{t.title}</td>
                      <td className="px-4 py-3 capitalize text-pulse-muted">{t.category}</td>
                      <td className="px-4 py-3 font-mono text-pulse-muted">{t.due_date || "—"}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            t.status === "completed"
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                              : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                          }`}
                        >
                          {t.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {t.status !== "completed" ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => updateOffboardingTask.mutate({ taskId: t.id, status: "completed" })}
                          >
                            Clear Task
                          </Button>
                        ) : (
                          <span className="text-emerald-600 font-semibold text-[11px]">✓ Cleared</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* New Task Modal */}
      {showNewTaskModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg border border-pulse-border bg-pulse-surface p-5 shadow-xl space-y-3">
            <h3 className="text-base font-bold text-pulse-ink">
              Add {isOffboarding ? "Offboarding" : "Onboarding"} Task
            </h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createTask.mutate();
              }}
              className="space-y-3 text-xs"
            >
              <label className="block">
                <span className="font-semibold text-pulse-ink">Employee *</span>
                <select
                  required
                  value={targetEmpId}
                  onChange={(e) => setTargetEmpId(e.target.value)}
                  className="mt-1 block w-full rounded border border-pulse-border bg-pulse-surface px-2.5 py-1.5 text-xs text-pulse-ink"
                >
                  {employments.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.person_name} ({e.job_title})
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="font-semibold text-pulse-ink">Task Title *</span>
                <input
                  type="text"
                  required
                  placeholder="e.g. Complete IT setup & laptop sign-off"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  className="mt-1 block w-full rounded border border-pulse-border bg-pulse-surface px-2.5 py-1.5 text-xs text-pulse-ink"
                />
              </label>

              <label className="block">
                <span className="font-semibold text-pulse-ink">Category</span>
                <select
                  value={taskCategory}
                  onChange={(e) => setTaskCategory(e.target.value)}
                  className="mt-1 block w-full rounded border border-pulse-border bg-pulse-surface px-2.5 py-1.5 text-xs text-pulse-ink"
                >
                  <option value="document">Documentation / Identity</option>
                  <option value="it_setup">IT Equipment & Credentials</option>
                  <option value="orientation">Orientation & Training</option>
                  <option value="policy">Policy Acceptance</option>
                  <option value="general">General</option>
                </select>
              </label>

              <label className="block">
                <span className="font-semibold text-pulse-ink">Due Date</span>
                <input
                  type="date"
                  value={taskDueDate}
                  onChange={(e) => setTaskDueDate(e.target.value)}
                  className="mt-1 block w-full rounded border border-pulse-border bg-pulse-surface px-2.5 py-1.5 text-xs text-pulse-ink"
                />
              </label>

              <div className="flex justify-end gap-2 pt-2 border-t border-pulse-border">
                <Button variant="secondary" type="button" onClick={() => setShowNewTaskModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createTask.isPending}>
                  Create Task
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
