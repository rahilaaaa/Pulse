import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOutletContext } from "react-router-dom";
import { api, ApiError } from "../../shared/api/client";
import { Button } from "../../shared/ui/Button";
import { EmptyState, LoadingState } from "../../shared/ui/States";
import type { WorkspacePayload } from "./types";

type ModuleCard = {
  slug: string;
  name: string;
  description: string;
  version: string;
  installation_available: boolean;
  eligible: boolean;
  status: string;
  installed: boolean;
  last_error: string;
  coming_soon: boolean;
};

export function ModulesPage() {
  const workspace = useOutletContext<WorkspacePayload>();
  const companyId = workspace.company.id;
  const queryClient = useQueryClient();
  const canInstall = workspace.permissions.includes("modules.install");
  const canUninstall = workspace.permissions.includes("modules.uninstall");
  const modules = useQuery({
    queryKey: ["company-modules", companyId],
    queryFn: () => api<{ results: ModuleCard[] }>(`/api/v1/companies/${companyId}/modules/`),
  });
  const install = useMutation({
    mutationFn: (slug: string) => api(`/api/v1/companies/${companyId}/modules/${slug}/install/`, { method: "POST" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["company-modules", companyId] });
      await queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
  });
  const uninstall = useMutation({
    mutationFn: (slug: string) => api(`/api/v1/companies/${companyId}/modules/${slug}/uninstall/`, { method: "POST" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["company-modules", companyId] });
      await queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
  });
  if (modules.isLoading || !modules.data) {
    return <LoadingState label="Loading modules" />;
  }
  const installed = modules.data.results.filter((item) => item.installed);
  const marketplace = modules.data.results.filter((item) => !item.installed);
  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Installed modules</h1>
        {installed.length === 0 ? <div className="mt-4"><EmptyState title="No modules installed" body="HRMS can be installed from the marketplace when the plan includes it." /></div> : (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {installed.map((item) => (
              <article key={item.slug} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
                <h2 className="font-semibold text-slate-900 dark:text-slate-100">{item.name}</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{item.description}</p>
                <p className="mt-3 text-sm font-medium text-teal-800">Installed · v{item.version}</p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {item.slug === "hrms" ? <a className="text-sm font-semibold text-teal-800" href="/app/hrms">Open HRMS</a> : null}
                  {item.slug === "projects" ? <a className="text-sm font-semibold text-teal-800" href="/app/projects">Open Projects</a> : null}
                  {item.slug === "crm" ? <a className="text-sm font-semibold text-teal-800" href="/app/crm">Open CRM</a> : null}
                  {item.slug === "commerce" ? <a className="text-sm font-semibold text-teal-800" href="/app/commerce">Open Commerce</a> : null}
                  {canUninstall ? (
                    <Button variant="secondary" type="button" disabled={uninstall.isPending} onClick={() => uninstall.mutate(item.slug)}>
                      Uninstall
                    </Button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      <section id="marketplace">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Module marketplace</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {marketplace.map((item) => (
            <article key={item.slug} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100">{item.name}</h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{item.description}</p>
              <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{item.coming_soon ? "Coming soon" : item.eligible ? "Included in the current plan" : "Not included in the current plan"}</p>
              {item.last_error ? <p className="mt-2 text-sm text-rose-700">{item.last_error}</p> : null}
              {canInstall && item.installation_available && item.eligible ? (
                <Button className="mt-4" type="button" disabled={install.isPending} onClick={() => install.mutate(item.slug)}>Install</Button>
              ) : null}
            </article>
          ))}
        </div>
        {install.error instanceof ApiError ? <p className="mt-3 text-sm text-rose-700">{install.error.message}</p> : null}
        {uninstall.error instanceof ApiError ? <p className="mt-3 text-sm text-rose-700">{uninstall.error.message}</p> : null}
      </section>
    </div>
  );
}
