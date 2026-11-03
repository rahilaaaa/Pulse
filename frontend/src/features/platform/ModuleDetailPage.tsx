import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { api, ApiError } from "../../shared/api/client";
import type { PlatformModuleDetail } from "../../shared/api/types";
import { Breadcrumbs } from "../../shared/ui/Breadcrumbs";
import { Button } from "../../shared/ui/Button";
import { DataTable } from "../../shared/ui/DataTable";
import { EmptyState, ErrorState, LoadingState } from "../../shared/ui/States";

export function ModuleDetailPage() {
  const { slug = "" } = useParams();
  const queryClient = useQueryClient();

  const moduleQuery = useQuery({
    queryKey: ["platform-module-detail", slug],
    queryFn: () => api<PlatformModuleDetail>(`/api/v1/platform/modules/${slug}/`),
    enabled: Boolean(slug),
  });

  const toggleAvailabilityMutation = useMutation({
    mutationFn: (available: boolean) =>
      api<PlatformModuleDetail>(`/api/v1/platform/modules/${slug}/`, {
        method: "PATCH",
        body: JSON.stringify({ installation_available: available }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-module-detail", slug] });
      queryClient.invalidateQueries({ queryKey: ["platform-modules-catalog"] });
      queryClient.invalidateQueries({ queryKey: ["platform-overview"] });
    },
  });

  if (moduleQuery.isLoading) {
    return <LoadingState label="Loading module specification" />;
  }

  if (moduleQuery.error || !moduleQuery.data) {
    return (
      <ErrorState
        title="Module could not be loaded"
        body={moduleQuery.error instanceof ApiError ? moduleQuery.error.message : "Module not found in catalog."}
        action={
          <Link to="/platform/modules">
            <Button variant="secondary" type="button">
              Back to catalog
            </Button>
          </Link>
        }
      />
    );
  }

  const mod = moduleQuery.data;

  return (
    <section className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-pulse-border/60 pb-5">
        <div>
          <Breadcrumbs items={["Platform", "Module Catalog", mod.display_name]} />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-pulse-ink">{mod.display_name}</h1>
            <span className="font-mono text-xs rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-pulse-muted">
              {mod.slug}
            </span>
            <span className="rounded bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 px-2 py-0.5 text-xs font-semibold text-teal-700 dark:text-teal-300">
              v{mod.version}
            </span>
          </div>
          <p className="mt-1 text-xs text-pulse-muted">
            Category: <span className="font-medium text-pulse-ink">{mod.category}</span> · Adoption:{" "}
            <span className="font-semibold text-pulse-ink">{mod.installed_companies_count}</span> active tenant{" "}
            {mod.installed_companies_count === 1 ? "installation" : "installations"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={toggleAvailabilityMutation.isPending}
            onClick={() => toggleAvailabilityMutation.mutate(!mod.installation_available)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
              mod.installation_available
                ? "border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 hover:bg-amber-100"
                : "bg-teal-600 text-white hover:bg-teal-500"
            }`}
          >
            {mod.installation_available ? "Disable new installations" : "Enable for new installations"}
          </button>
          <Link to="/platform/modules">
            <Button variant="secondary" type="button">
              ← Catalog
            </Button>
          </Link>
        </div>
      </div>

      {/* Overview Panels */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Specifications & Problem Solved */}
        <div className="rounded-lg border border-pulse-border bg-pulse-surface p-4 shadow-2xs space-y-4">
          <h2 className="text-sm font-semibold text-pulse-ink">Module Specification & Capabilities</h2>
          <p className="text-xs text-pulse-ink leading-relaxed">{mod.description}</p>

          {mod.problem_solved ? (
            <div className="rounded-md bg-pulse-canvas p-3 border border-pulse-border/60">
              <p className="text-[11px] font-semibold text-pulse-muted uppercase tracking-wider">Problem Solved</p>
              <p className="mt-1 text-xs text-pulse-ink">{mod.problem_solved}</p>
            </div>
          ) : null}

          {mod.target_users ? (
            <div className="rounded-md bg-pulse-canvas p-3 border border-pulse-border/60">
              <p className="text-[11px] font-semibold text-pulse-muted uppercase tracking-wider">Target Users</p>
              <p className="mt-1 text-xs text-pulse-ink">{mod.target_users}</p>
            </div>
          ) : null}

          {/* Dependencies */}
          <div className="border-t border-pulse-border/60 pt-3">
            <p className="text-xs font-semibold text-pulse-ink mb-2">Platform Dependencies</p>
            {mod.dependencies.length === 0 ? (
              <p className="text-xs text-pulse-muted">No external dependencies required (Standalone module).</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {mod.dependencies.map((dep) => (
                  <span
                    key={dep.slug}
                    className="inline-flex items-center gap-1.5 rounded bg-slate-100 dark:bg-slate-800 px-2 py-1 text-xs text-pulse-ink border border-pulse-border"
                  >
                    <span className="font-mono text-teal-600 font-semibold">{dep.slug}</span>
                    <span className="text-pulse-muted">({dep.display_name})</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Feature Highlights */}
        <div className="rounded-lg border border-pulse-border bg-pulse-surface p-4 shadow-2xs space-y-4">
          <h2 className="text-sm font-semibold text-pulse-ink">Included Core Features</h2>
          {mod.features && mod.features.length > 0 ? (
            <div className="space-y-3">
              {mod.features.map((feat) => (
                <div key={feat.id} className="rounded-md border border-pulse-border/60 bg-pulse-canvas p-3 text-xs">
                  <p className="font-semibold text-pulse-ink">{feat.title}</p>
                  <p className="mt-0.5 text-pulse-muted text-[11px]">{feat.description}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-pulse-muted">No explicit feature manifest defined.</p>
          )}
        </div>
      </div>

      {/* Adopting Companies Table */}
      <div className="rounded-lg border border-pulse-border bg-pulse-surface p-4 shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-pulse-ink">Adopting Tenants</h2>
            <p className="text-xs text-pulse-muted">Customer companies currently running this module</p>
          </div>
          <span className="rounded bg-teal-50 dark:bg-teal-950/60 px-2 py-0.5 text-xs font-semibold text-teal-700 dark:text-teal-300">
            {mod.installed_companies.length} active
          </span>
        </div>

        {mod.installed_companies.length === 0 ? (
          <EmptyState
            title="No tenants using this module"
            body="This module has not yet been provisioned or installed into any active company tenant."
          />
        ) : (
          <DataTable columns={["Tenant Company", "Slug", "Installed Version", "Installed Date", "Actions"]}>
            {mod.installed_companies.map((c) => (
              <tr key={c.company_id} className="hover:bg-pulse-hover/50 transition text-xs">
                <td className="px-4 py-3 font-semibold text-pulse-ink">
                  <Link to={`/platform/companies/${c.company_id}`} className="text-teal-700 dark:text-teal-400 hover:underline">
                    {c.display_name}
                  </Link>
                </td>
                <td className="px-4 py-3 font-mono text-pulse-muted">{c.slug}</td>
                <td className="px-4 py-3 font-mono text-pulse-ink">v{c.installed_version}</td>
                <td className="px-4 py-3 text-pulse-muted">
                  {c.installed_at ? new Date(c.installed_at).toLocaleDateString() : "—"}
                </td>
                <td className="px-4 py-3">
                  <Link
                    to={`/platform/companies/${c.company_id}`}
                    className="rounded border border-pulse-border px-2 py-1 text-[11px] font-medium text-pulse-ink hover:bg-pulse-hover"
                  >
                    Inspect tenant
                  </Link>
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </div>
    </section>
  );
}

