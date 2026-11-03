import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../../shared/api/client";
import { Button } from "../../../shared/ui/Button";

const panelClass = "rounded-lg border border-pulse-border bg-pulse-surface p-4 shadow-sm";
const labelClass = "text-xs font-semibold uppercase tracking-wider text-pulse-muted";

interface ReportsViewProps {
  companyId: string;
}

export function ReportsView({ companyId }: ReportsViewProps) {
  const root = `/api/v1/companies/${companyId}/hrms`;
  const [reportType, setReportType] = useState<"attendance" | "headcount" | "leaves">("attendance");

  const today = new Date();
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [startsOn, setStartsOn] = useState(thirtyDaysAgo);
  const [endsOn, setEndsOn] = useState(today.toISOString().slice(0, 10));

  const report = useQuery({
    queryKey: ["hrms-report", companyId, reportType, startsOn, endsOn],
    queryFn: () =>
      api<any>(`${root}/reports/?type=${reportType}&starts_on=${startsOn}&ends_on=${endsOn}`),
  });

  const data = report.data;

  // Export CSV
  const handleExportCSV = () => {
    if (!data) return;
    let csvContent = "";
    if (reportType === "attendance" && data.records) {
      csvContent = "data:text/csv;charset=utf-8,Employee,Date,Status,Minutes Worked\n";
      data.records.forEach((r: any) => {
        csvContent += `"${r.employee_name}","${r.work_date}","${r.status}","${r.minutes_worked || 0}"\n`;
      });
    } else if (reportType === "leaves" && data.records) {
      csvContent = "data:text/csv;charset=utf-8,Employee,Policy,Allocated Days,Used Days,Remaining Days\n";
      data.records.forEach((r: any) => {
        csvContent += `"${r.employee_name}","${r.policy_name}","${r.allocated_days}","${r.used_days}","${r.remaining_days}"\n`;
      });
    } else if (reportType === "headcount" && data.by_status) {
      csvContent = "data:text/csv;charset=utf-8,Status,Count\n";
      Object.entries(data.by_status).forEach(([k, v]) => {
        csvContent += `"${k}","${v}"\n`;
      });
    }
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `hrms_${reportType}_report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-4">
      {/* Header and Filter Bar */}
      <section className={panelClass}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-pulse-ink">HR Analytics & Reports</h2>
            <p className="text-xs text-pulse-muted">
              Exportable audit records for workforce attendance, headcount distribution, and time-off utilization.
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={handleExportCSV} disabled={!data}>
            Export to CSV
          </Button>
        </div>

        {/* Type selector and date pickers */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-pulse-border pt-3">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => setReportType("attendance")}
              className={`rounded-md px-3 py-1.5 font-semibold transition ${
                reportType === "attendance"
                  ? "bg-pulse-accent text-white shadow-sm"
                  : "bg-pulse-hover text-pulse-muted hover:text-pulse-ink"
              }`}
            >
              Attendance Summary
            </button>
            <button
              type="button"
              onClick={() => setReportType("headcount")}
              className={`rounded-md px-3 py-1.5 font-semibold transition ${
                reportType === "headcount"
                  ? "bg-pulse-accent text-white shadow-sm"
                  : "bg-pulse-hover text-pulse-muted hover:text-pulse-ink"
              }`}
            >
              Headcount & Status
            </button>
            <button
              type="button"
              onClick={() => setReportType("leaves")}
              className={`rounded-md px-3 py-1.5 font-semibold transition ${
                reportType === "leaves"
                  ? "bg-pulse-accent text-white shadow-sm"
                  : "bg-pulse-hover text-pulse-muted hover:text-pulse-ink"
              }`}
            >
              Leave Utilization
            </button>
          </div>

          {reportType === "attendance" && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-pulse-muted">From:</span>
              <input
                type="date"
                value={startsOn}
                onChange={(e) => setStartsOn(e.target.value)}
                className="rounded border border-pulse-border bg-pulse-surface px-2 py-1 text-xs text-pulse-ink"
              />
              <span className="text-pulse-muted">To:</span>
              <input
                type="date"
                value={endsOn}
                onChange={(e) => setEndsOn(e.target.value)}
                className="rounded border border-pulse-border bg-pulse-surface px-2 py-1 text-xs text-pulse-ink"
              />
            </div>
          )}
        </div>
      </section>

      {/* Report Content */}
      {reportType === "attendance" && data && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-4">
            <div className={panelClass}>
              <span className={labelClass}>Total Days Logged</span>
              <p className="mt-1 text-2xl font-bold text-pulse-ink">{data.summary?.total_records ?? 0}</p>
            </div>
            <div className={panelClass}>
              <span className={labelClass}>Present Entries</span>
              <p className="mt-1 text-2xl font-bold text-emerald-600">{data.summary?.present ?? 0}</p>
            </div>
            <div className={panelClass}>
              <span className={labelClass}>Late Entries</span>
              <p className="mt-1 text-2xl font-bold text-amber-500">{data.summary?.late ?? 0}</p>
            </div>
            <div className={panelClass}>
              <span className={labelClass}>Absent Entries</span>
              <p className="mt-1 text-2xl font-bold text-rose-600">{data.summary?.absent ?? 0}</p>
            </div>
          </div>

          <section className={`${panelClass} overflow-hidden p-0`}>
            <div className="p-4 border-b border-pulse-border">
              <h3 className="text-sm font-bold text-pulse-ink">Detailed Attendance Records</h3>
            </div>
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-pulse-hover/90 backdrop-blur border-b border-pulse-border">
                  <tr className="text-pulse-muted">
                    <th className="px-4 py-2.5 font-semibold">Employee</th>
                    <th className="px-4 py-2.5 font-semibold">Date</th>
                    <th className="px-4 py-2.5 font-semibold">Status</th>
                    <th className="px-4 py-2.5 font-semibold">Minutes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-pulse-border">
                  {(data.records ?? []).map((r: any, idx: number) => (
                    <tr key={idx} className="hover:bg-pulse-hover/50">
                      <td className="px-4 py-2.5 font-medium text-pulse-ink">{r.employee_name}</td>
                      <td className="px-4 py-2.5 font-mono text-pulse-muted">{r.work_date}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold capitalize ${
                            r.status === "present"
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                              : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-pulse-muted">{r.minutes_worked || 0}m</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {reportType === "headcount" && data && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className={panelClass}>
              <span className={labelClass}>Total Headcount</span>
              <p className="mt-1 text-3xl font-extrabold text-pulse-ink">{data.total ?? 0}</p>
            </div>
            {Object.entries(data.by_status ?? {}).map(([status, count]) => (
              <div key={status} className={panelClass}>
                <span className={labelClass}>{status.replace("_", " ")}</span>
                <p className="mt-1 text-2xl font-bold text-pulse-ink">{String(count)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {reportType === "leaves" && data && (
        <section className={`${panelClass} overflow-hidden p-0`}>
          <div className="p-4 border-b border-pulse-border">
            <h3 className="text-sm font-bold text-pulse-ink">Employee Leave Balances & Utilization ({data.year})</h3>
          </div>
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-pulse-hover/90 backdrop-blur border-b border-pulse-border">
                <tr className="text-pulse-muted">
                  <th className="px-4 py-2.5 font-semibold">Employee</th>
                  <th className="px-4 py-2.5 font-semibold">Leave Policy</th>
                  <th className="px-4 py-2.5 font-semibold">Allocated</th>
                  <th className="px-4 py-2.5 font-semibold">Used</th>
                  <th className="px-4 py-2.5 font-semibold">Remaining</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pulse-border">
                {(data.records ?? []).map((r: any, idx: number) => (
                  <tr key={idx} className="hover:bg-pulse-hover/50">
                    <td className="px-4 py-2.5 font-medium text-pulse-ink">{r.employee_name}</td>
                    <td className="px-4 py-2.5 text-pulse-muted">{r.policy_name}</td>
                    <td className="px-4 py-2.5 font-mono text-pulse-ink">{r.allocated_days}</td>
                    <td className="px-4 py-2.5 font-mono text-pulse-muted">{r.used_days}</td>
                    <td className="px-4 py-2.5 font-mono font-bold text-emerald-600">{r.remaining_days}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

