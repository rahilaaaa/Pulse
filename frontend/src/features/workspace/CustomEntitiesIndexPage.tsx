import { useQuery } from "@tanstack/react-query";
import { Link, useOutletContext } from "react-router-dom";
import { api, ApiError } from "../../shared/api/client";
import { EmptyState, ErrorState, LoadingState } from "../../shared/ui/States";
import type { WorkspacePayload } from "./types";

type EntityRow = {
  id: string;
  key: string;
  name: string;
  description: string;
};

export function CustomEntitiesIndexPage() {
  const workspace = useOutletContext<WorkspacePayload>();
  const companyId = workspace.company.id;
  const entities = useQuery({
    queryKey: ["custom-entities", companyId],
    queryFn: () => api<{ results: EntityRow[] }>(`/api/v1/companies/${companyId}/custom-entities/`),
    enabled: Boolean(companyId),
  });

  if (entities.isLoading) return <LoadingState label="Loading custom entities" />;
  if (entities.isError) {
    return (
      <ErrorState
  title="Custom records unavailable"
  body={entities.error instanceof ApiError ? entities.error.message : "Could not load entities."}
/>
    );
  }

  const rows = entities.data?.results ?? [];

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-pulse-ink">Custom Records</h1>
        <p className="mt-1 text-sm text-pulse-muted">
          Browse company-defined entities.{" "}
          <Link to="/app/settings?section=custom-entities" className="text-pulse-accent hover:underline">
            Manage definitions in Configuration
          </Link>
          .
        </p>
      </div>
      {rows.length === 0 ? (
        <EmptyState
  title="No custom entities yet"
  body="Create an entity under Configuration → Custom Entities, then return here to manage records."
/>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                to={`/app/custom-entities/${row.id}`}
                className="block rounded-xl border border-pulse-border bg-pulse-surface p-4 shadow-sm transition hover:border-pulse-accent/40"
              >
                <p className="font-semibold text-pulse-ink">{row.name}</p>
                <p className="mt-1 font-mono text-xs text-pulse-muted">{row.key}</p>
                <p className="mt-2 text-sm text-pulse-muted">{row.description || "Open records"}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
