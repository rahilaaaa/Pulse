import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOutletContext } from "react-router-dom";
import { api } from "../../shared/api/client";
import { Button } from "../../shared/ui/Button";
import { EmptyState, LoadingState } from "../../shared/ui/States";
import type { WorkspacePayload } from "./types";

type LeadRow = { id: string; title: string; status: string; email: string };
type AccountRow = { id: string; name: string; party: string };

export function CrmPage() {
  const workspace = useOutletContext<WorkspacePayload>();
  const companyId = workspace.company.id;
  const queryClient = useQueryClient();
  const leads = useQuery({
    queryKey: ["crm-leads", companyId],
    queryFn: () => api<{ results: LeadRow[] }>(`/api/v1/companies/${companyId}/crm/leads/`),
  });
  const accounts = useQuery({
    queryKey: ["crm-accounts", companyId],
    queryFn: () => api<{ results: AccountRow[] }>(`/api/v1/companies/${companyId}/crm/accounts/`),
  });
  const create = useMutation({
    mutationFn: (values: { title: string; email: string }) =>
      api(`/api/v1/companies/${companyId}/crm/leads/`, { method: "POST", body: JSON.stringify(values) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["crm-leads", companyId] });
    },
  });
  const convert = useMutation({
    mutationFn: (id: string) => api(`/api/v1/companies/${companyId}/crm/leads/${id}/convert/`, { method: "POST", body: "{}" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["crm-leads", companyId] });
      await queryClient.invalidateQueries({ queryKey: ["crm-accounts", companyId] });
      await queryClient.invalidateQueries({ queryKey: ["parties", companyId] });
    },
  });
  if (leads.isLoading) return <LoadingState label="Loading CRM" />;
  if (leads.isError) return <EmptyState title="CRM unavailable" body="Install the CRM module to continue." />;
  const leadRows = leads.data?.results ?? [];
  const accountRows = accounts.data?.results ?? [];
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">CRM</h1>
      {workspace.permissions.includes("crm.manage") ? (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            create.mutate({
              title: String(form.get("title") || ""),
              email: String(form.get("email") || ""),
            });
            event.currentTarget.reset();
          }}
        >
          <label className="text-sm">Lead<input className="mt-1 block rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2" name="title" required /></label>
          <label className="text-sm">Email<input className="mt-1 block rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2" name="email" type="email" /></label>
          <Button type="submit" disabled={create.isPending}>Add lead</Button>
        </form>
      ) : null}
      <section>
        <h2 className="text-lg font-medium">Leads</h2>
        {leadRows.length === 0 ? <EmptyState title="No leads" body="Create a lead to start the pipeline." /> : (
          <ul className="mt-3 space-y-3">
            {leadRows.map((row) => (
              <li key={row.id} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 text-sm">
                <p className="font-medium">{row.title}</p>
                <p className="text-slate-500 dark:text-slate-400">{row.status}{row.email ? ` · ${row.email}` : ""}</p>
                {workspace.permissions.includes("crm.manage") && row.status !== "converted" ? (
                  <Button className="mt-3" type="button" disabled={convert.isPending} onClick={() => convert.mutate(row.id)}>Convert</Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h2 className="text-lg font-medium">Accounts</h2>
        {accountRows.length === 0 ? <p className="mt-2 text-sm text-slate-500">Converted leads create accounts linked to Party.</p> : (
          <ul className="mt-3 space-y-3">
            {accountRows.map((row) => (
              <li key={row.id} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 text-sm">
                <p className="font-medium">{row.name}</p>
                <p className="text-slate-500 dark:text-slate-400">Party · {row.party}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
