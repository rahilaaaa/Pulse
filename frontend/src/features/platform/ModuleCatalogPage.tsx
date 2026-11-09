import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../../shared/api/client";
import type { PlatformModuleRow } from "../../shared/api/types";
import { Breadcrumbs } from "../../shared/ui/Breadcrumbs";
import { Button } from "../../shared/ui/Button";
import { DataTable } from "../../shared/ui/DataTable";
import { SelectField, TextField } from "../../shared/ui/Fields";
import { EmptyState, ErrorState, LoadingState } from "../../shared/ui/States";

export function ModuleCatalogPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [availability, setAvailability] = useState("");

  const modulesQuery = useQuery({
    queryKey: ["platform-modules-catalog"],
    queryFn: () => api<{ results: PlatformModuleRow[]; count: number }>("/api/v1/platform/modules/"),
  });

  const toggleAvailabilityMutation = useMutation({
    mutationFn: ({ slug, available }: { slug: string; available: boolean }) =>
      api<PlatformModuleRow>(`/api/v1/platform/modules/${slug}/`, {
        method: "PATCH",
        body: JSON.stringify({ installation_available: available }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-modules-catalog"] });
      queryClient.invalidateQueries({ queryKey: ["platform-overview"] });
    },
  });

  const filtered = useMemo(() => {
    const list = modulesQuery.data?.results || [];
    return list.filter((m) => {
      if (search) {
        const q = search.toLowerCase();
        if (!m.display_name.toLowerCase().includes(q) && !m.slug.toLowerCase().includes(q)) {
          return false;
        }
      }
      if (category && m.category !== category) {
        return false;
      }
      if (availability === "available" && !m.installation_available) {
        return false;
      }
      if (availability === "unavailable" && m.installation_available) {
        return false;
      }
      return true;
    });
  }, [availability, category, modulesQuery.data?.results, search]);

  const totalInstalls = modulesQuery.data?.results.reduce((acc, m) => acc + (m.installed_companies_count || 0), 0) ?? 0;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Breadcrumbs items={["Platform", "Module Catalog"]} />
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-pulse-ink">Module Catalog</h1>
          <p className="mt-0.5 text-xs text-pulse-muted">
            Manage global availability, inspect dependencies, and view adoption across all tenant companies.
          </p>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-pulse-border bg-pulse-surface p-4 shadow-2xs">
          <p className="text-[11px] font-medium uppercase text-pulse-muted">Catalog modules</p>
          <p className="mt-1 text-2xl font-bold text-pulse-ink">{modulesQuery.data?.count || 0}</p>
          <p className="mt-1 text-xs text-pulse-muted">Registered extensible features</p>
        </div>
        <div className="rounded-lg border border-pulse-border bg-pulse-surface p-4 shadow-2xs">
          <p className="text-[11px] font-medium uppercase text-pulse-muted">Total installations</p>
          <p className="mt-1 text-2xl font-bold text-pulse-ink">{totalInstalls}</p>
          <p className="mt-1 text-xs text-pulse-muted">Active in customer tenants</p>
        </div>
        <div className="rounded-lg border border-pulse-border bg-pulse-surface p-4 shadow-2xs">
          <p className="text-[11px] font-medium uppercase text-pulse-muted">Available for install</p>
          <p className="mt-1 text-2xl font-bold text-teal-600 dark:text-teal-400">
            {modulesQuery.data?.results.filter((m) => m.installation_available).length || 0}
          </p>
          <p className="mt-1 text-xs text-pulse-muted">Active for tenant provisioning</p>
        </div>
        <div className="rounded-lg border border-pulse-border bg-pulse-surface p-4 shadow-2xs">
          <p className="text-[11px] font-medium uppercase text-pulse-muted">Coming soon / restricted</p>
          <p className="mt-1 text-2xl font-bold text-pulse-muted">
            {modulesQuery.data?.results.filter((m) => !m.installation_available).length || 0}
          </p>
          <p className="mt-1 text-xs text-pulse-muted">Unavailable for new installs</p>
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="rounded-lg border border-pulse-border bg-pulse-surface p-4 shadow-2xs">
        <div className="grid gap-3 sm:grid-cols-3">
          <TextField
            label="Search Module"
            name="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name or slug..."
          />
          <SelectField label="Category" name="cat" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            <option value="Operations">Operations</option>
            <option value="Commercial">Commercial</option>
            <option value="Core">Core</option>
          </SelectField>
          <SelectField
            label="Installation Availability"
            name="avail"
            value={availability}
            onChange={(e) => setAvailability(e.target.value)}
          >
            <option value="">All statuses</option>
            <option value="available">Available for new installs</option>
            <option value="unavailable">Unavailable / restricted</option>
          </SelectField>
        </div>
      </div>

      {modulesQuery.isLoading ? <LoadingState label="Loading module catalog" /> : null}

      {modulesQuery.error ? (
        <ErrorState
          title="Module catalog could not be loaded"
          body={modulesQuery.error instanceof ApiError ? modulesQuery.error.message : "API returned an error."}
          action={
            <Button type="button" variant="secondary" onClick={() => modulesQuery.refetch()}>
              Try again
            </Button>
          }
        />
      ) : null}

      {filtered.length === 0 && !modulesQuery.isLoading ? (
        <EmptyState title="No modules found" body="No modules match the filter selection." />
      ) : null}

      {filtered.length > 0 ? (
        <DataTable columns={["Module", "Category", "Version", "Global Availability", "Active Tenants", "Actions"]}>
          {filtered.map((mod) => (
            <tr key={mod.slug} className="hover:bg-pulse-hover/50 transition text-xs">
              <td className="px-4 py-3">
                <Link to={`/platform/modules/${mod.slug}`} className="font-semibold text-teal-700 dark:text-teal-400 hover:underline">
                  {mod.display_name}
                </Link>
                <p className="font-mono text-[11px] text-pulse-muted">{mod.slug}</p>
                <p className="text-[11px] text-pulse-muted mt-0.5 line-clamp-1">{mod.description}</p>
              </td>

              <td className="px-4 py-3 text-pulse-ink font-medium">{mod.category}</td>

              <td className="px-4 py-3 font-mono text-pulse-muted">v{mod.version}</td>

              <td className="px-4 py-3">
                {mod.installation_available ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Available for install
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-pulse-muted border border-pulse-border">
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                    Unavailable
                  </span>
                )}
              </td>

              <td className="px-4 py-3 font-semibold text-pulse-ink">
                {mod.installed_companies_count} {mod.installed_companies_count === 1 ? "tenant" : "tenants"}
              </td>

              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <Link
                    to={`/platform/modules/${mod.slug}`}
                    className="rounded border border-pulse-border bg-pulse-surface px-2.5 py-1 text-[11px] font-medium text-pulse-ink hover:bg-pulse-hover"
                  >
                    Inspect
                  </Link>

                  <button
                    type="button"
                    disabled={toggleAvailabilityMutation.isPending}
                    onClick={() =>
                      toggleAvailabilityMutation.mutate({
                        slug: mod.slug,
                        available: !mod.installation_available,
                      })
                    }
                    className={`rounded px-2.5 py-1 text-[11px] font-medium transition ${
                      mod.installation_available
                        ? "border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 hover:bg-amber-100"
                        : "border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 hover:bg-teal-100"
                    }`}
                  >
                    {mod.installation_available ? "Make unavailable" : "Make available"}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </DataTable>
      ) : null}
    </section>
  );
}

