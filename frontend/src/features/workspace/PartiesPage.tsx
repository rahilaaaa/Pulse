import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOutletContext } from "react-router-dom";
import { api } from "../../shared/api/client";
import { Button } from "../../shared/ui/Button";
import { EmptyState, LoadingState } from "../../shared/ui/States";
import type { WorkspacePayload } from "./types";

type PartyRow = { id: string; kind: string; display_name: string; email: string; phone: string; status: string };

export function PartiesPage() {
  const workspace = useOutletContext<WorkspacePayload>();
  const companyId = workspace.company.id;
  const queryClient = useQueryClient();
  const parties = useQuery({
    queryKey: ["parties", companyId],
    queryFn: () => api<{ results: PartyRow[] }>(`/api/v1/companies/${companyId}/parties/`),
  });
  const create = useMutation({
    mutationFn: (values: { display_name: string; kind: string; email: string }) =>
      api(`/api/v1/companies/${companyId}/parties/`, { method: "POST", body: JSON.stringify(values) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["parties", companyId] });
    },
  });
  if (parties.isLoading) return <LoadingState label="Loading parties" />;
  if (parties.isError) return <EmptyState title="Parties unavailable" body="You need parties.view to open this page." />;
  const rows = parties.data?.results ?? [];
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Parties</h1>
      {workspace.permissions.includes("parties.manage") ? (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            create.mutate({
              display_name: String(form.get("display_name") || ""),
              kind: String(form.get("kind") || "organization"),
              email: String(form.get("email") || ""),
            });
            event.currentTarget.reset();
          }}
        >
          <label className="text-sm">Name<input className="mt-1 block rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2" name="display_name" required /></label>
          <label className="text-sm">Kind
            <select className="mt-1 block rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2" name="kind" defaultValue="organization">
              <option value="organization">Organization</option>
              <option value="person">Person</option>
            </select>
          </label>
          <label className="text-sm">Email<input className="mt-1 block rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2" name="email" type="email" /></label>
          <Button type="submit" disabled={create.isPending}>Add party</Button>
        </form>
      ) : null}
      {rows.length === 0 ? <EmptyState title="No parties yet" body="External customers and suppliers appear here." /> : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.id} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 text-sm">
              <p className="font-medium">{row.display_name}</p>
              <p className="text-slate-500 dark:text-slate-400">{row.kind} · {row.status}{row.email ? ` · ${row.email}` : ""}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
