import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOutletContext } from "react-router-dom";
import { api } from "../../shared/api/client";
import { Button } from "../../shared/ui/Button";
import { EmptyState, LoadingState } from "../../shared/ui/States";
import type { WorkspacePayload } from "./types";

type ProjectRow = { id: string; name: string; description: string; status: string; task_count: number };

export function ProjectsPage() {
  const workspace = useOutletContext<WorkspacePayload>();
  const companyId = workspace.company.id;
  const queryClient = useQueryClient();
  const projects = useQuery({
    queryKey: ["projects", companyId],
    queryFn: () => api<{ results: ProjectRow[] }>(`/api/v1/companies/${companyId}/projects/`),
  });
  const create = useMutation({
    mutationFn: (values: { name: string; description: string }) =>
      api(`/api/v1/companies/${companyId}/projects/`, { method: "POST", body: JSON.stringify(values) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["projects", companyId] });
    },
  });
  if (projects.isLoading) return <LoadingState label="Loading projects" />;
  if (projects.isError) return <EmptyState title="Projects unavailable" body="Install the Projects module to continue." />;
  const rows = projects.data?.results ?? [];
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Projects</h1>
      {workspace.permissions.includes("projects.manage") ? (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            create.mutate({
              name: String(form.get("name") || ""),
              description: String(form.get("description") || ""),
            });
            event.currentTarget.reset();
          }}
        >
          <label className="text-sm">Name<input className="mt-1 block rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2" name="name" required /></label>
          <label className="text-sm">Description<input className="mt-1 block rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2" name="description" /></label>
          <Button type="submit" disabled={create.isPending}>Create project</Button>
        </form>
      ) : null}
      {rows.length === 0 ? <EmptyState title="No projects" body="Create a project after installing the module." /> : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.id} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 text-sm">
              <p className="font-medium">{row.name}</p>
              <p className="text-slate-500 dark:text-slate-400">{row.status} · {row.task_count} task(s)</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
