import { useQuery } from "@tanstack/react-query";
import { api } from "../../../shared/api/client";
import { LoadingState } from "../../../shared/ui/States";

interface ReportsViewProps {
  companyId: string;
  permissions: string[];
}

interface ReportsData {
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

export function ReportsView({ companyId }: ReportsViewProps) {
  const reportsQuery = useQuery({
    queryKey: ["projects-reports-summary", companyId],
    queryFn: () => api<ReportsData>(`/api/v1/companies/${companyId}/projects/reports/summary/`),
  });

  if (reportsQuery.isLoading || !reportsQuery.data) {
    return <LoadingState label="Calculating work metrics & generating reports..." />;
  }

  const { projects_progress, task_distribution, timesheet_totals } = reportsQuery.data;
  const billableRatio =
    timesheet_totals.total_hours > 0
      ? Math.round((timesheet_totals.billable_hours / timesheet_totals.total_hours) * 100)
      : 0;

  const totalTasks = Object.values(task_distribution).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="rounded-xl border border-pulse-border bg-white p-5 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-pulse-muted">Total Hours</span>
          <div className="mt-1 text-2xl font-black text-pulse-ink">{timesheet_totals.total_hours}h</div>
          <span className="text-[11px] text-pulse-muted">Across all projects</span>
        </div>

        <div className="rounded-xl border border-pulse-border bg-white p-5 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Billable Hours</span>
          <div className="mt-1 text-2xl font-black text-emerald-800">{timesheet_totals.billable_hours}h</div>
          <span className="text-[11px] font-bold text-emerald-600">{billableRatio}% of total logged</span>
        </div>

        <div className="rounded-xl border border-pulse-border bg-white p-5 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-pulse-muted">Non-Billable</span>
          <div className="mt-1 text-2xl font-black text-pulse-ink">{timesheet_totals.non_billable_hours}h</div>
          <span className="text-[11px] text-pulse-muted">Internal / R&D time</span>
        </div>

        <div className="rounded-xl border border-pulse-border bg-white p-5 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-teal-700">Active Tasks</span>
          <div className="mt-1 text-2xl font-black text-teal-900">{totalTasks}</div>
          <span className="text-[11px] text-pulse-muted">In current company backlog</span>
        </div>
      </div>

      {/* Task Distribution & Status Breakdown */}
      <div className="rounded-xl border border-pulse-border bg-white p-6 shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-pulse-ink">Task Status Distribution</h3>
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
          {Object.entries(task_distribution).map(([status, count]) => (
            <div key={status} className="rounded-lg bg-pulse-surface p-3 text-center border border-pulse-border">
              <div className="text-xl font-black text-pulse-ink">{count}</div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-pulse-muted mt-0.5">
                {status.replace("_", " ")}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Project Completion Velocity */}
      <div className="rounded-xl border border-pulse-border bg-white p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-pulse-ink">Project Completion Progress</h3>
            <p className="text-xs text-pulse-muted">Tracking deliverables and completion velocity per project.</p>
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded border border-pulse-border px-3 py-1 text-xs font-semibold hover:bg-pulse-surface"
          >
            🖨 Export / Print
          </button>
        </div>

        <div className="space-y-4">
          {projects_progress.map((p) => (
            <div key={p.code} className="space-y-1.5 p-3 rounded-lg border border-pulse-border bg-pulse-surface">
              <div className="flex items-center justify-between text-xs">
                <div>
                  <span className="font-mono font-bold text-teal-700 mr-2">{p.code}</span>
                  <strong className="text-pulse-ink">{p.name}</strong>
                  <span className="ml-2 text-[10px] uppercase font-semibold text-pulse-muted">({p.status})</span>
                </div>
                <div className="text-pulse-muted font-medium">
                  {p.completed_tasks} of {p.total_tasks} tasks ({p.progress_percentage}%)
                </div>
              </div>
              <div className="w-full bg-pulse-border rounded-full h-2 overflow-hidden">
                <div
                  className="bg-[#0D9488] h-2 rounded-full transition-all"
                  style={{ width: `${Math.min(100, Math.max(0, p.progress_percentage))}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

