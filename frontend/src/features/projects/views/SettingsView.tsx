import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../../shared/api/client";
import { LoadingState } from "../../../shared/ui/States";
import type { ProjectSettings } from "../types";

interface SettingsViewProps {
  companyId: string;
  permissions: string[];
}

export function SettingsView({ companyId, permissions }: SettingsViewProps) {
  const queryClient = useQueryClient();
  const canAdmin = permissions.includes("projects.admin");

  const settingsQuery = useQuery({
    queryKey: ["projects-settings", companyId],
    queryFn: () => api<ProjectSettings>(`/api/v1/companies/${companyId}/projects/settings/`),
  });

  const [projectPrefix, setProjectPrefix] = useState("PRJ");
  const [taskPrefix, setTaskPrefix] = useState("TSK");
  const [defaultBillable, setDefaultBillable] = useState(true);
  const [timesheetApproval, setTimesheetApproval] = useState(true);
  const [standaloneTasks, setStandaloneTasks] = useState(true);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (settingsQuery.data) {
      setProjectPrefix(settingsQuery.data.project_code_prefix);
      setTaskPrefix(settingsQuery.data.task_code_prefix);
      setDefaultBillable(settingsQuery.data.default_billable);
      setTimesheetApproval(settingsQuery.data.timesheet_requires_approval);
      setStandaloneTasks(settingsQuery.data.allow_standalone_tasks);
    }
  }, [settingsQuery.data]);

  const updateSettingsMutation = useMutation({
    mutationFn: () =>
      api(`/api/v1/companies/${companyId}/projects/settings/`, {
        method: "PATCH",
        body: JSON.stringify({
          project_code_prefix: projectPrefix,
          task_code_prefix: taskPrefix,
          default_billable: defaultBillable,
          timesheet_requires_approval: timesheetApproval,
          allow_standalone_tasks: standaloneTasks,
        }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["projects-settings", companyId] });
      setSavedSuccess(true);
      setErrorMsg("");
      setTimeout(() => setSavedSuccess(false), 3000);
    },
    onError: (err: unknown) => {
      setErrorMsg(err instanceof ApiError ? err.message : "Failed to update project settings");
    },
  });

  if (settingsQuery.isLoading) {
    return <LoadingState label="Loading project settings..." />;
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="border-b border-pulse-border pb-4">
        <h2 className="text-base font-bold text-pulse-ink">Project & Work Configuration</h2>
        <p className="text-xs text-pulse-muted">
          Configure project identifiers, auto-numbering prefixes, default billable behavior, and timesheet workflows.
        </p>
      </div>

      {savedSuccess && (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-800 font-semibold">
          ✓ Project settings updated successfully.
        </div>
      )}

      {errorMsg && (
        <div className="rounded-md border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800">
          {errorMsg}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          updateSettingsMutation.mutate();
        }}
        className="space-y-5 rounded-xl border border-pulse-border bg-white p-6 shadow-sm"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-pulse-ink mb-1">
              Project Code Prefix
            </label>
            <input
              type="text"
              required
              disabled={!canAdmin}
              value={projectPrefix}
              onChange={(e) => setProjectPrefix(e.target.value.toUpperCase())}
              className="w-full rounded border border-pulse-border px-3 py-2 text-xs font-mono uppercase focus:border-teal-600 focus:outline-none"
            />
            <p className="text-[11px] text-pulse-muted mt-1">Generates codes like PRJ-001, PRJ-002</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-pulse-ink mb-1">
              Task Code Prefix
            </label>
            <input
              type="text"
              required
              disabled={!canAdmin}
              value={taskPrefix}
              onChange={(e) => setTaskPrefix(e.target.value.toUpperCase())}
              className="w-full rounded border border-pulse-border px-3 py-2 text-xs font-mono uppercase focus:border-teal-600 focus:outline-none"
            />
            <p className="text-[11px] text-pulse-muted mt-1">Generates codes like TSK-001, TSK-002</p>
          </div>
        </div>

        <div className="pt-3 border-t border-pulse-border space-y-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              disabled={!canAdmin}
              checked={defaultBillable}
              onChange={(e) => setDefaultBillable(e.target.checked)}
              className="mt-0.5 rounded text-teal-600 focus:ring-teal-500"
            />
            <div>
              <span className="text-xs font-semibold text-pulse-ink block">Default to Billable</span>
              <span className="text-[11px] text-pulse-muted">
                Automatically mark new projects and logged time entries as billable.
              </span>
            </div>
          </label>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              disabled={!canAdmin}
              checked={timesheetApproval}
              onChange={(e) => setTimesheetApproval(e.target.checked)}
              className="mt-0.5 rounded text-teal-600 focus:ring-teal-500"
            />
            <div>
              <span className="text-xs font-semibold text-pulse-ink block">
                Timesheet Approval Required
              </span>
              <span className="text-[11px] text-pulse-muted">
                Require managers or project owners to approve logged hours before they are finalized.
              </span>
            </div>
          </label>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              disabled={!canAdmin}
              checked={standaloneTasks}
              onChange={(e) => setStandaloneTasks(e.target.checked)}
              className="mt-0.5 rounded text-teal-600 focus:ring-teal-500"
            />
            <div>
              <span className="text-xs font-semibold text-pulse-ink block">
                Allow Standalone Tasks
              </span>
              <span className="text-[11px] text-pulse-muted">
                Enable employees to create tasks that are not associated with a specific project.
              </span>
            </div>
          </label>
        </div>

        {canAdmin && (
          <div className="pt-4 border-t border-pulse-border flex justify-end">
            <button
              type="submit"
              disabled={updateSettingsMutation.isPending}
              className="rounded bg-[#0D9488] px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#0f766e] disabled:opacity-50"
            >
              {updateSettingsMutation.isPending ? "Saving..." : "Save Settings"}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}

