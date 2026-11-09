import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../../shared/api/client";
import type { PlatformHealthData } from "../../shared/api/types";
import { Breadcrumbs } from "../../shared/ui/Breadcrumbs";
import { Button } from "../../shared/ui/Button";
import { ErrorState, LoadingState } from "../../shared/ui/States";

export function PlatformHealthPage() {
  const healthQuery = useQuery({
    queryKey: ["platform-health-overview"],
    queryFn: () => api<PlatformHealthData>("/api/v1/platform/operations/health/"),
    refetchInterval: 30000,
  });

  const data = healthQuery.data;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Breadcrumbs items={["Platform", "Operations", "Health"]} />
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-pulse-ink">Platform Health & Operations</h1>
          <p className="mt-0.5 text-xs text-pulse-muted">
            Live database connectivity, query response latency, application build version, and runtime diagnostics.
          </p>
        </div>
        <Button type="button" variant="secondary" onClick={() => healthQuery.refetch()}>
          Refresh status
        </Button>
      </div>

      {healthQuery.isLoading ? <LoadingState label="Inspecting platform runtime diagnostics" /> : null}

      {healthQuery.error ? (
        <ErrorState
          title="Health check failed"
          body={healthQuery.error instanceof ApiError ? healthQuery.error.message : "Service check failed."}
          action={
            <Button type="button" variant="secondary" onClick={() => healthQuery.refetch()}>
              Try again
            </Button>
          }
        />
      ) : null}

      {data ? (
        <div className="space-y-5">
          {/* Status banner */}
          <div
            className={`rounded-lg p-4 border flex items-center justify-between ${
              data.status === "healthy"
                ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200"
                : "bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <span
                className={`h-3 w-3 rounded-full ${
                  data.status === "healthy" ? "bg-emerald-500 animate-pulse" : "bg-rose-500"
                }`}
              />
              <div>
                <p className="text-sm font-bold uppercase tracking-wide">
                  System Status: {data.status === "healthy" ? "All Systems Operational" : "Degraded Performance"}
                </p>
                <p className="text-[11px] opacity-90">Last verified: {new Date(data.timestamp).toLocaleTimeString()}</p>
              </div>
            </div>
            <span className="font-mono text-xs font-semibold">Pulse ERP v{data.app_version}</span>
          </div>

          {/* Subsystem Health Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Database Engine */}
            <div className="rounded-lg border border-pulse-border bg-pulse-surface p-5 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wider text-pulse-muted">Database Engine</h2>
                <span className="rounded bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                  Connected
                </span>
              </div>
              <div>
                <p className="text-xl font-bold text-pulse-ink capitalize">{data.database.engine}</p>
                <p className="text-xs text-pulse-muted mt-1">
                  Query Latency: <span className="font-mono font-semibold text-pulse-ink">{data.database.latency_ms} ms</span>
                </p>
              </div>
            </div>

            {/* Tenant Workspaces */}
            <div className="rounded-lg border border-pulse-border bg-pulse-surface p-5 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wider text-pulse-muted">Tenant Workspaces</h2>
                <span className="rounded bg-teal-50 dark:bg-teal-950/60 px-2 py-0.5 text-[10px] font-semibold text-teal-700 dark:text-teal-300">
                  Active
                </span>
              </div>
              <div>
                <p className="text-xl font-bold text-pulse-ink">{data.operations.active_companies} Active</p>
                <p className="text-xs text-pulse-muted mt-1">
                  Out of {data.operations.total_companies} total registered companies
                </p>
              </div>
            </div>

            {/* Audit Pipeline */}
            <div className="rounded-lg border border-pulse-border bg-pulse-surface p-5 shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wider text-pulse-muted">Audit Activity (24h)</h2>
                <span className="rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-pulse-ink">
                  Healthy
                </span>
              </div>
              <div>
                <p className="text-xl font-bold text-pulse-ink">{data.operations.audits_last_24h} Events</p>
                <p className="text-xs text-pulse-muted mt-1">Processed and recorded to immutable log</p>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

