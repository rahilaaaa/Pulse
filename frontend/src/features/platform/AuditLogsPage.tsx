import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { api, ApiError } from "../../shared/api/client";
import type { PlatformAuditRow } from "../../shared/api/types";
import { Breadcrumbs } from "../../shared/ui/Breadcrumbs";
import { Button } from "../../shared/ui/Button";
import { DataTable } from "../../shared/ui/DataTable";
import { SelectField, TextField } from "../../shared/ui/Fields";
import { Modal } from "../../shared/ui/Modal";
import { Pagination } from "../../shared/ui/Pagination";
import { EmptyState, ErrorState, LoadingState } from "../../shared/ui/States";

export function AuditLogsPage() {
  const [search, setSearch] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [actionCategory, setActionCategory] = useState("");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [page, setPage] = useState(1);

  const [inspectRow, setInspectRow] = useState<PlatformAuditRow | null>(null);

  const queryString = useMemo(() => {
    const qp = new URLSearchParams({ page: String(page), page_size: "25" });
    if (submittedSearch) qp.set("q", submittedSearch);
    if (actionCategory) qp.set("action", actionCategory);
    if (createdFrom) qp.set("created_from", createdFrom);
    if (createdTo) qp.set("created_to", createdTo);
    return qp.toString();
  }, [actionCategory, createdFrom, createdTo, page, submittedSearch]);

  const auditQuery = useQuery({
    queryKey: ["platform-audit-logs", queryString],
    queryFn: () =>
      api<{ results: PlatformAuditRow[]; count: number; page: number; page_count: number }>(
        `/api/v1/platform/audit-logs/?${queryString}`
      ),
  });

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Breadcrumbs items={["Platform", "Audit Logs"]} />
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-pulse-ink">Platform Audit Logs</h1>
          <p className="mt-0.5 text-xs text-pulse-muted">
            Append-only, immutable record of all platform operations, tenant lifecycle updates, and permission grants.
          </p>
        </div>
      </div>

      {/* Filter Toolbar */}
      <form
        className="rounded-lg border border-pulse-border bg-pulse-surface p-4 shadow-2xs space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setSubmittedSearch(search.trim());
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <TextField
            label="Search"
            name="q"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Action, actor, or company..."
          />

          <SelectField
            label="Action Category"
            name="cat"
            value={actionCategory}
            onChange={(e) => {
              setActionCategory(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All actions</option>
            <option value="company.">Company events (company.*)</option>
            <option value="platform.">Platform events (platform.*)</option>
            <option value="subscription.">Billing events (subscription.*)</option>
            <option value="module.">Module events (module.*)</option>
          </SelectField>

          <TextField
            label="From Date"
            name="from"
            type="date"
            value={createdFrom}
            onChange={(e) => {
              setCreatedFrom(e.target.value);
              setPage(1);
            }}
          />

          <TextField
            label="To Date"
            name="to"
            type="date"
            value={createdTo}
            onChange={(e) => {
              setCreatedTo(e.target.value);
              setPage(1);
            }}
          />
        </div>

        <div className="flex justify-between items-center pt-2 border-t border-pulse-border/60">
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setSubmittedSearch("");
              setActionCategory("");
              setCreatedFrom("");
              setCreatedTo("");
              setPage(1);
            }}
            className="text-xs text-pulse-muted hover:text-rose-600 transition"
          >
            Clear filters
          </button>
          <Button type="submit">Filter audit records</Button>
        </div>
      </form>

      {auditQuery.isLoading ? <LoadingState label="Loading audit logs" /> : null}

      {auditQuery.error ? (
        <ErrorState
          title="Audit logs could not be loaded"
          body={auditQuery.error instanceof ApiError ? auditQuery.error.message : "API returned an error."}
          action={
            <Button type="button" variant="secondary" onClick={() => auditQuery.refetch()}>
              Try again
            </Button>
          }
        />
      ) : null}

      {auditQuery.data && auditQuery.data.count === 0 ? (
        <EmptyState title="No audit logs found" body="No recorded events match the selected criteria." />
      ) : null}

      {auditQuery.data && auditQuery.data.results.length > 0 ? (
        <div className="space-y-4">
          <DataTable columns={["Recorded", "Action", "Actor", "Target Company", "Object Type", "Request ID", "Diff"]}>
            {auditQuery.data.results.map((log) => (
              <tr key={log.id} className="hover:bg-pulse-hover/50 transition text-xs">
                <td className="px-4 py-3 text-pulse-muted whitespace-nowrap">
                  {new Date(log.created_at).toLocaleString([], { dateStyle: "short", timeStyle: "medium" })}
                </td>

                <td className="px-4 py-3 font-mono font-semibold text-pulse-ink">
                  <span className="rounded bg-pulse-canvas border border-pulse-border px-1.5 py-0.5">
                    {log.action}
                  </span>
                </td>

                <td className="px-4 py-3">
                  <p className="font-medium text-pulse-ink">{log.actor_email}</p>
                  <p className="text-[10px] text-pulse-muted">{log.actor_name}</p>
                </td>

                <td className="px-4 py-3">
                  {log.company_name ? (
                    <span className="font-medium text-teal-700 dark:text-teal-400">{log.company_name}</span>
                  ) : (
                    <span className="rounded bg-teal-50 dark:bg-teal-950/60 px-1.5 py-0.5 text-[10px] text-teal-700 dark:text-teal-300">
                      Platform System
                    </span>
                  )}
                </td>

                <td className="px-4 py-3 capitalize text-pulse-muted">{log.object_type}</td>

                <td className="px-4 py-3 font-mono text-[11px] text-pulse-muted">
                  {log.request_id ? `${log.request_id.slice(0, 8)}…` : "—"}
                </td>

                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setInspectRow(log)}
                    className="rounded border border-pulse-border px-2 py-1 text-[11px] font-medium text-pulse-ink hover:bg-pulse-hover"
                  >
                    View payload
                  </button>
                </td>
              </tr>
            ))}
          </DataTable>

          <Pagination page={auditQuery.data.page} pageCount={auditQuery.data.page_count} onPageChange={setPage} />
        </div>
      ) : null}

      {/* INSPECT PAYLOAD MODAL */}
      <Modal
        open={Boolean(inspectRow)}
        onClose={() => setInspectRow(null)}
        title={`Audit Event: ${inspectRow?.action}`}
        description="Immutable administrative state transition recorded by the platform engine."
      >
        {inspectRow ? (
          <div className="space-y-4 text-xs">
            <dl className="grid gap-2 sm:grid-cols-2 rounded-md bg-pulse-canvas p-3 border border-pulse-border/60">
              <div>
                <dt className="text-[10px] uppercase text-pulse-muted">Action</dt>
                <dd className="font-mono font-semibold text-pulse-ink">{inspectRow.action}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase text-pulse-muted">Timestamp</dt>
                <dd className="text-pulse-ink">{new Date(inspectRow.created_at).toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase text-pulse-muted">Actor</dt>
                <dd className="text-pulse-ink">
                  {inspectRow.actor_email} ({inspectRow.actor_name})
                </dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase text-pulse-muted">Target Company</dt>
                <dd className="text-pulse-ink">{inspectRow.company_name || "Platform Global"}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase text-pulse-muted">IP Address</dt>
                <dd className="font-mono text-pulse-muted">{inspectRow.ip_address || "Internal"}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase text-pulse-muted">Request ID</dt>
                <dd className="font-mono text-pulse-muted">{inspectRow.request_id || "None"}</dd>
              </div>
            </dl>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-[11px] font-semibold text-pulse-ink mb-1">State Before:</p>
                <pre className="h-44 overflow-auto rounded bg-slate-900 p-2 text-[11px] text-slate-100 font-mono">
                  {inspectRow.before ? JSON.stringify(inspectRow.before, null, 2) : "None (Created)"}
                </pre>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-pulse-ink mb-1">State After:</p>
                <pre className="h-44 overflow-auto rounded bg-slate-900 p-2 text-[11px] text-slate-100 font-mono">
                  {inspectRow.after ? JSON.stringify(inspectRow.after, null, 2) : "None (Removed)"}
                </pre>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-pulse-border/60">
              <Button type="button" variant="secondary" onClick={() => setInspectRow(null)}>
                Close
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </section>
  );
}
