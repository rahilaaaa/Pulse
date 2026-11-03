import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../shared/api/client";
import { LoadingState } from "../../../shared/ui/States";
import type {
  TimesheetEntry,
  TimesheetStatus,
  ProjectSummary,
  TaskSummary,
} from "../types";

interface TimesheetsViewProps {
  companyId: string;
  permissions: string[];
  initialTaskId?: string | null;
  initialProjectId?: string | null;
}

export function TimesheetsView({
  companyId,
  permissions,
  initialTaskId,
  initialProjectId,
}: TimesheetsViewProps) {
  const queryClient = useQueryClient();
  const canApprove = permissions.includes("projects.timesheet.approve");
  const canLog = permissions.includes("projects.timesheet.log");

  const [scopeFilter, setScopeFilter] = useState<"my" | "team">("my");
  const [selectedEntryIds, setSelectedEntryIds] = useState<string[]>([]);
  const [showLogModal, setShowLogModal] = useState(Boolean(initialTaskId));

  // Queries
  const timesheetsQuery = useQuery({
    queryKey: ["projects-timesheets", companyId, scopeFilter],
    queryFn: () =>
      api<{ results: TimesheetEntry[] }>(
        `/api/v1/companies/${companyId}/projects/timesheets/?scope=${scopeFilter}`
      ),
  });

  const projectsQuery = useQuery({
    queryKey: ["projects-list", companyId],
    queryFn: () => api<{ results: ProjectSummary[] }>(`/api/v1/companies/${companyId}/projects/projects/`),
  });

  const tasksQuery = useQuery({
    queryKey: ["projects-all-tasks", companyId],
    queryFn: () => api<{ results: TaskSummary[] }>(`/api/v1/companies/${companyId}/projects/tasks/`),
  });

  // Active Timer state
  const activeTimerEntry = timesheetsQuery.data?.results.find((e) => e.timer_active);
  const [timerSeconds, setTimerSeconds] = useState(0);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (activeTimerEntry) {
      interval = setInterval(() => {
        setTimerSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      setTimerSeconds(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activeTimerEntry]);

  // Manual Log Form State
  const [formProjectId, setFormProjectId] = useState(initialProjectId || "");
  const [formTaskId, setFormTaskId] = useState(initialTaskId || "");
  const [formHours, setFormHours] = useState("1.0");
  const [formWorkDate, setFormWorkDate] = useState(new Date().toISOString().slice(0, 10));
  const [formNotes, setFormNotes] = useState("");
  const [formBillable, setFormBillable] = useState(true);

  // Mutations
  const logTimeMutation = useMutation({
    mutationFn: () =>
      api(`/api/v1/companies/${companyId}/projects/timesheets/`, {
        method: "POST",
        body: JSON.stringify({
          project_id: formProjectId || undefined,
          task_id: formTaskId || undefined,
          duration_minutes: Math.round(parseFloat(formHours || "0") * 60),
          work_date: formWorkDate,
          description: formNotes,
          is_billable: formBillable,
        }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["projects-timesheets", companyId] });
      await queryClient.invalidateQueries({ queryKey: ["projects-all-tasks", companyId] });
      await queryClient.invalidateQueries({ queryKey: ["projects-dashboard", companyId] });
      setShowLogModal(false);
      setFormNotes("");
    },
  });

  const toggleTimerMutation = useMutation({
    mutationFn: ({ entryId, projectId, taskId }: { entryId?: string; projectId?: string; taskId?: string }) =>
      api(`/api/v1/companies/${companyId}/projects/timer/`, {
        method: "POST",
        body: JSON.stringify({ entry_id: entryId, project_id: projectId, task_id: taskId }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["projects-timesheets", companyId] });
    },
  });

  const submitTimesheetsMutation = useMutation({
    mutationFn: () =>
      api(`/api/v1/companies/${companyId}/projects/timesheets/submit/`, {
        method: "POST",
        body: JSON.stringify({ entry_ids: selectedEntryIds }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["projects-timesheets", companyId] });
      setSelectedEntryIds([]);
    },
  });

  const decideTimesheetMutation = useMutation({
    mutationFn: ({ entryId, action }: { entryId: string; action: "approve" | "reject" }) =>
      api(`/api/v1/companies/${companyId}/projects/timesheets/${entryId}/decide/`, {
        method: "POST",
        body: JSON.stringify({ action }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["projects-timesheets", companyId] });
      await queryClient.invalidateQueries({ queryKey: ["projects-dashboard", companyId] });
    },
  });

  if (timesheetsQuery.isLoading || !timesheetsQuery.data) {
    return <LoadingState label="Loading project effort & timesheets..." />;
  }

  const entries = timesheetsQuery.data.results;
  const projects = projectsQuery.data?.results || [];
  const tasks = tasksQuery.data?.results || [];

  const draftEntryIds = entries.filter((e) => e.status === "draft").map((e) => e.id);

  const statusColors: Record<TimesheetStatus, string> = {
    draft: "bg-slate-100 text-slate-800",
    submitted: "bg-blue-100 text-blue-800",
    approved: "bg-emerald-100 text-emerald-800",
    rejected: "bg-rose-100 text-rose-800",
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Live Timer Widget */}
      <div className="rounded-xl border border-pulse-border bg-white p-5 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-pulse-ink">Project Time Tracking</h2>
          <p className="text-xs text-pulse-muted">
            Strictly measures project and task effort. Kept fully auditable and separate from attendance records.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {activeTimerEntry ? (
            <div className="flex items-center gap-3 rounded-lg border border-teal-500 bg-teal-50 px-4 py-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-teal-500"></span>
              </span>
              <div className="text-xs">
                <div className="font-bold text-teal-900 font-mono">
                  {Math.floor(timerSeconds / 60)}m {timerSeconds % 60}s
                </div>
                <div className="text-[10px] text-teal-700 truncate max-w-[150px]">
                  {activeTimerEntry.task?.title || activeTimerEntry.project?.name || "Timer Active"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => toggleTimerMutation.mutate({ entryId: activeTimerEntry.id })}
                className="rounded bg-rose-600 px-3 py-1 text-xs font-bold text-white hover:bg-rose-700"
              >
                Stop Timer
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => toggleTimerMutation.mutate({})}
              className="rounded-md border border-teal-600 bg-white px-3.5 py-2 text-xs font-bold text-teal-700 hover:bg-teal-50"
            >
              ▶ Start Live Timer
            </button>
          )}

          {canLog && (
            <button
              type="button"
              onClick={() => setShowLogModal(true)}
              className="rounded-md bg-[#0D9488] px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#0f766e]"
            >
              + Log Manual Hours
            </button>
          )}
        </div>
      </div>

      {/* Scope Selector & Batch Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-pulse-border bg-pulse-surface p-1">
          <button
            type="button"
            onClick={() => setScopeFilter("my")}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
              scopeFilter === "my" ? "bg-white text-pulse-ink shadow-sm" : "text-pulse-muted"
            }`}
          >
            My Timesheets
          </button>
          {canApprove && (
            <button
              type="button"
              onClick={() => setScopeFilter("team")}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                scopeFilter === "team" ? "bg-white text-pulse-ink shadow-sm" : "text-pulse-muted"
              }`}
            >
              Approval Queue (Team)
            </button>
          )}
        </div>

        {scopeFilter === "my" && selectedEntryIds.length > 0 && (
          <button
            type="button"
            onClick={() => submitTimesheetsMutation.mutate()}
            disabled={submitTimesheetsMutation.isPending}
            className="rounded-md bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
          >
            Submit {selectedEntryIds.length} Entries for Approval
          </button>
        )}
      </div>

      {/* Timesheets List Table */}
      <div className="rounded-xl border border-pulse-border bg-white overflow-hidden shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-pulse-border bg-pulse-surface text-pulse-muted uppercase tracking-wider font-semibold">
            <tr>
              {scopeFilter === "my" && (
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={
                      draftEntryIds.length > 0 && selectedEntryIds.length === draftEntryIds.length
                    }
                    onChange={(e) => {
                      if (e.target.checked) setSelectedEntryIds(draftEntryIds);
                      else setSelectedEntryIds([]);
                    }}
                    className="rounded text-teal-600"
                  />
                </th>
              )}
              {scopeFilter === "team" && <th className="px-4 py-3">Team Member</th>}
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Project / Task</th>
              <th className="px-4 py-3">Notes</th>
              <th className="px-4 py-3">Duration</th>
              <th className="px-4 py-3">Billable</th>
              <th className="px-4 py-3">Status</th>
              {scopeFilter === "team" && <th className="px-4 py-3 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-pulse-border">
            {entries.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-pulse-muted">
                  No timesheet entries found for this scope.
                </td>
              </tr>
            ) : (
              entries.map((entry) => {
                const isSelected = selectedEntryIds.includes(entry.id);
                return (
                  <tr key={entry.id} className="hover:bg-pulse-surface transition">
                    {scopeFilter === "my" && (
                      <td className="px-4 py-3">
                        {entry.status === "draft" && (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              if (e.target.checked) setSelectedEntryIds([...selectedEntryIds, entry.id]);
                              else setSelectedEntryIds(selectedEntryIds.filter((x) => x !== entry.id));
                            }}
                            className="rounded text-teal-600"
                          />
                        )}
                      </td>
                    )}
                    {scopeFilter === "team" && (
                      <td className="px-4 py-3 font-semibold text-pulse-ink">{entry.person.name}</td>
                    )}
                    <td className="px-4 py-3 font-medium text-pulse-ink">{entry.work_date}</td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-pulse-ink">
                        {entry.project ? entry.project.name : "General Project"}
                      </div>
                      {entry.task && (
                        <div className="text-[11px] text-pulse-muted font-mono">{entry.task.title}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-pulse-muted max-w-xs truncate">
                      {entry.description || "—"}
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-teal-700">
                      {entry.hours} hrs ({entry.duration_minutes}m)
                    </td>
                    <td className="px-4 py-3">
                      {entry.is_billable ? (
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                          Billable
                        </span>
                      ) : (
                        <span className="text-[10px] text-gray-500">Non-billable</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                          statusColors[entry.status]
                        }`}
                      >
                        {entry.status}
                      </span>
                    </td>
                    {scopeFilter === "team" && (
                      <td className="px-4 py-3 text-right space-x-2">
                        {entry.status === "submitted" && (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                decideTimesheetMutation.mutate({ entryId: entry.id, action: "approve" })
                              }
                              className="rounded bg-emerald-600 px-2 py-1 text-[11px] font-bold text-white hover:bg-emerald-700"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                decideTimesheetMutation.mutate({ entryId: entry.id, action: "reject" })
                              }
                              className="rounded border border-rose-300 bg-rose-50 px-2 py-1 text-[11px] font-bold text-rose-700 hover:bg-rose-100"
                            >
                              Reject
                            </button>
                          </>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* LOG TIME MODAL */}
      {showLogModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-2xl border border-pulse-border p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-pulse-border pb-3">
              <h3 className="text-base font-bold text-pulse-ink">Log Work Time</h3>
              <button
                type="button"
                onClick={() => setShowLogModal(false)}
                className="text-pulse-muted hover:text-pulse-ink text-xl font-bold"
              >
                &times;
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                logTimeMutation.mutate();
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold text-pulse-ink mb-1">Project</label>
                <select
                  value={formProjectId}
                  onChange={(e) => setFormProjectId(e.target.value)}
                  className="w-full rounded border border-pulse-border px-3 py-2 text-xs"
                >
                  <option value="">Select Project</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} - {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-pulse-ink mb-1">Task (Optional)</label>
                <select
                  value={formTaskId}
                  onChange={(e) => setFormTaskId(e.target.value)}
                  className="w-full rounded border border-pulse-border px-3 py-2 text-xs"
                >
                  <option value="">Select Task</option>
                  {tasks
                    .filter((t) => !formProjectId || t.project?.id === formProjectId)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.code} - {t.title}
                      </option>
                    ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-pulse-ink mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={formWorkDate}
                    onChange={(e) => setFormWorkDate(e.target.value)}
                    className="w-full rounded border border-pulse-border px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-pulse-ink mb-1">Hours Spent</label>
                  <input
                    type="number"
                    step="0.25"
                    min="0.25"
                    max="24"
                    required
                    value={formHours}
                    onChange={(e) => setFormHours(e.target.value)}
                    className="w-full rounded border border-pulse-border px-3 py-2 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-pulse-ink mb-1">Notes / Description</label>
                <textarea
                  rows={3}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Summary of work completed..."
                  className="w-full rounded border border-pulse-border px-3 py-2 text-xs"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="log_billable"
                  checked={formBillable}
                  onChange={(e) => setFormBillable(e.target.checked)}
                  className="rounded text-teal-600"
                />
                <label htmlFor="log_billable" className="text-xs font-medium text-pulse-ink cursor-pointer">
                  Mark as billable effort
                </label>
              </div>

              <div className="border-t border-pulse-border pt-4 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowLogModal(false)}
                  className="rounded border border-pulse-border px-4 py-2 text-xs font-semibold text-pulse-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={logTimeMutation.isPending}
                  className="rounded bg-[#0D9488] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0f766e] disabled:opacity-50"
                >
                  {logTimeMutation.isPending ? "Logging..." : "Log Time"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
