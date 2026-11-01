import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../../shared/api/client";
import { Breadcrumbs } from "../../shared/ui/Breadcrumbs";
import { Button } from "../../shared/ui/Button";
import { DataTable } from "../../shared/ui/DataTable";
import { EmptyState, ErrorState, LoadingState } from "../../shared/ui/States";

type AuditRow = {
  id: string;
  action: string;
  object_type: string;
  created_at: string;
};

type AuditList = {
  results: AuditRow[];
  count: number;
};

export function AuditLogsPage() {
  const logs = useQuery({
    queryKey: ["platform-audit-logs"],
    queryFn: () => api<AuditList>("/api/v1/platform/audit-logs/"),
  });

  return (
    <section className="space-y-5">
      <Breadcrumbs items={["Platform", "Audit logs"]} />
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Audit logs</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Rows are written when an action is stored. This page does not add sample entries.</p>
      </div>
      {logs.isLoading ? <LoadingState label="Loading audit logs" /> : null}
      {logs.error ? (
        <ErrorState
          title="Audit logs could not be loaded"
          body={logs.error instanceof ApiError ? logs.error.message : "The platform API returned an error."}
          action={
            <Button type="button" variant="secondary" onClick={() => logs.refetch()}>
              Try again
            </Button>
          }
        />
      ) : null}
      {logs.data && logs.data.count === 0 ? <EmptyState title="No audit logs" body="Company creation and later recorded actions will appear here." /> : null}
      {logs.data && logs.data.results.length > 0 ? (
        <DataTable columns={["Action", "Object", "Recorded"]}>
          {logs.data.results.map((row) => (
            <tr key={row.id}>
              <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{row.action}</td>
              <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{row.object_type}</td>
              <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{new Date(row.created_at).toLocaleString()}</td>
            </tr>
          ))}
        </DataTable>
      ) : null}
    </section>
  );
}
