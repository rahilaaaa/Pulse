import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { api } from "../../shared/api/client";
import { Button } from "../../shared/ui/Button";
import { LoadingState } from "../../shared/ui/States";
import { relativeTime } from "./format";
import type { WorkspacePayload } from "./types";

type AuditRow = {
  id: string;
  created_at: string;
  actor_id: string;
  actor_name: string;
  action: string;
  action_label: string;
  mechanism: string;
  target: string;
  result: string;
};

type AuditPayload = {
  count: number;
  results: AuditRow[];
  actors: Array<{ id: string; name: string }>;
};

const selectClass = "rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 outline-none focus:border-teal-700";

function stamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const day = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${day} · ${relativeTime(value)}`;
}

function csvCell(value: string) {
  return `"${value.replaceAll("\"", "\"\"")}"`;
}

export function AuditPage() {
  const workspace = useOutletContext<WorkspacePayload>();
  const companyId = workspace.company.id;
  const [query, setQuery] = useState("");
  const [days, setDays] = useState("90");
  const [actor, setActor] = useState("");
  const [mechanism, setMechanism] = useState("");
  const audit = useQuery({
    queryKey: ["company-audit", companyId, query, days, actor, mechanism],
    queryFn: () => {
      const params = new URLSearchParams({ days });
      if (query.trim()) params.set("q", query.trim());
      if (actor) params.set("actor", actor);
      if (mechanism) params.set("mechanism", mechanism);
      return api<AuditPayload>(`/api/v1/companies/${companyId}/audit/?${params.toString()}`);
    },
  });

  function exportCsv() {
    const rows = audit.data?.results ?? [];
    const header = ["Date / time", "Actor", "Action", "Mechanism", "Target", "Result"];
    const lines = [header, ...rows.map((row) => [stamp(row.created_at), row.actor_name, row.action_label, row.mechanism, row.target, "Success"])];
    const blob = new Blob([lines.map((line) => line.map(csvCell).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "audit-log.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  const rows = audit.data?.results ?? [];
  const count = audit.data?.count ?? 0;
  if (audit.isError) {
    return <p className="text-sm text-slate-600 dark:text-slate-300">The audit log could not be loaded.</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">Audit Log</h1>
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-600 dark:text-slate-300">
              <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="7" width="10" height="7" rx="1.5" /><path d="M5 7V5a3 3 0 0 1 6 0v2" /></svg>
              Immutable
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Every significant action across Pulse and installed modules. Records can't be edited or deleted.</p>
        </div>
        <Button type="button" variant="secondary" disabled={rows.length === 0} onClick={exportCsv}>
          <svg viewBox="0 0 16 16" className="mr-1.5 h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M8 2v8M5 7l3 3 3-3" /><path d="M3 12.5h10" /></svg>
          Export CSV
        </Button>
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-700 px-3 py-3">
          <label className="relative min-w-48 flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="8.5" cy="8.5" r="5" /><path d="m12.5 12.5 4 4" /></svg>
            </span>
            <input className="w-full rounded-lg border border-slate-200 dark:border-slate-700 py-2 pl-9 pr-3 text-sm outline-none focus:border-teal-700" placeholder="Search action or target" aria-label="Search action or target" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <select className={selectClass} aria-label="Date range" value={days} onChange={(event) => setDays(event.target.value)}>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="365">Last year</option>
            <option value="all">All time</option>
          </select>
          <select className={selectClass} aria-label="Actor" value={actor} onChange={(event) => setActor(event.target.value)}>
            <option value="">Any actor</option>
            {(audit.data?.actors ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <select className={selectClass} aria-label="Mechanism" value={mechanism} onChange={(event) => setMechanism(event.target.value)}>
            <option value="">Any mechanism</option>
            <option value="web">Web app</option>
            <option value="system">System</option>
          </select>
          <span className="ml-auto text-sm text-slate-500 dark:text-slate-400">{audit.isLoading ? "Loading…" : `${count} ${count === 1 ? "record" : "records"}`}</span>
        </div>
        {audit.isLoading && !audit.data ? <div className="p-6"><LoadingState label="Loading audit log" /></div> : rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">No audit records match these filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Date / time</th>
                  <th className="px-4 py-3 font-medium">Actor</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                  <th className="px-4 py-3 font-medium">Mechanism</th>
                  <th className="px-4 py-3 font-medium">Target</th>
                  <th className="px-4 py-3 font-medium">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-300">{stamp(row.created_at)}</td>
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{row.actor_name}</td>
                    <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">{row.action_label}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{row.mechanism}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{row.target}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        Success
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
