import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOutletContext } from "react-router-dom";
import { api } from "../../shared/api/client";
import { Button } from "../../shared/ui/Button";
import { EmptyState, LoadingState } from "../../shared/ui/States";
import type { WorkspacePayload } from "./types";

type LeaveRow = {
  id: string;
  person: string;
  policy: string;
  status: string;
  starts_on: string;
  ends_on: string;
  reason: string;
  days?: number;
};

type BalanceRow = {
  id: string;
  person: string;
  policy: string;
  year: number;
  allocated_days: number;
  used_days: number;
  remaining_days: number;
};

export function LeavePage() {
  const workspace = useOutletContext<WorkspacePayload>();
  const companyId = workspace.company.id;
  const queryClient = useQueryClient();
  const leave = useQuery({
    queryKey: ["leave", companyId],
    queryFn: () => api<{ results: LeaveRow[] }>(`/api/v1/companies/${companyId}/hrms/leave-requests/`),
  });
  const balances = useQuery({
    queryKey: ["leave-balances", companyId],
    queryFn: () => api<{ results: BalanceRow[] }>(`/api/v1/companies/${companyId}/hrms/leave-balances/`),
  });
  const requestLeave = useMutation({
    mutationFn: (values: { starts_on: string; ends_on: string; reason: string }) =>
      api(`/api/v1/companies/${companyId}/hrms/leave-requests/`, { method: "POST", body: JSON.stringify(values) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["leave", companyId] });
      await queryClient.invalidateQueries({ queryKey: ["leave-balances", companyId] });
    },
  });
  const decide = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api(`/api/v1/companies/${companyId}/hrms/leave-requests/${id}/decision/`, { method: "POST", body: JSON.stringify({ status }) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["leave", companyId] });
      await queryClient.invalidateQueries({ queryKey: ["leave-balances", companyId] });
    },
  });
  if (leave.isLoading) {
    return <LoadingState label="Loading leave" />;
  }
  if (leave.isError) {
    return <EmptyState title="HRMS is not available" body="Install HRMS before opening leave requests." />;
  }
  const rows = leave.data?.results ?? [];
  const balanceRows = balances.data?.results ?? [];
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">HRMS leave</h1>
      {balanceRows.length > 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 text-sm">
          <h2 className="font-medium text-slate-900 dark:text-slate-100">Balances</h2>
          <ul className="mt-2 space-y-1 text-slate-600 dark:text-slate-300">
            {balanceRows.map((row) => (
              <li key={row.id}>
                {row.person} · {row.policy} ({row.year}): {row.remaining_days} of {row.allocated_days} remaining
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {workspace.permissions.includes("hrms.leave.request") ? (
        <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          requestLeave.mutate({
            starts_on: String(form.get("starts_on") || ""),
            ends_on: String(form.get("ends_on") || ""),
            reason: String(form.get("reason") || ""),
          });
          event.currentTarget.reset();
        }}>
          <label className="text-sm">From<input className="mt-1 block rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2" type="date" name="starts_on" required /></label>
          <label className="text-sm">To<input className="mt-1 block rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2" type="date" name="ends_on" required /></label>
          <label className="text-sm">Reason<input className="mt-1 block rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2" name="reason" /></label>
          <Button type="submit" disabled={requestLeave.isPending}>Request leave</Button>
        </form>
      ) : null}
      {rows.length === 0 ? <EmptyState title="No leave requests" body="Requests appear here after someone with leave access submits one." /> : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.id} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 text-sm">
              <p className="font-medium">{row.person} · {row.policy}</p>
              <p className="text-slate-500 dark:text-slate-400">{row.starts_on} to {row.ends_on} · {row.status}{row.days ? ` · ${row.days} day(s)` : ""}</p>
              {workspace.permissions.includes("hrms.leave.decide") && row.status === "pending" ? (
                <div className="mt-3 flex gap-2">
                  <Button type="button" onClick={() => decide.mutate({ id: row.id, status: "approved" })}>Approve</Button>
                  <Button variant="secondary" type="button" onClick={() => decide.mutate({ id: row.id, status: "rejected" })}>Reject</Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
