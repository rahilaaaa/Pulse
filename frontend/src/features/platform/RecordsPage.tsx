import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../../shared/api/client";
import type { RecordList } from "../../shared/api/types";
import { Breadcrumbs } from "../../shared/ui/Breadcrumbs";
import { Button } from "../../shared/ui/Button";
import { EmptyState, ErrorState, LoadingState } from "../../shared/ui/States";

export function RecordsPage({ title, path }: { title: string; path: string }) {
  const records = useQuery({
    queryKey: ["platform-records", path],
    queryFn: () => api<RecordList>(path),
  });

  return (
    <section className="space-y-5">
      <Breadcrumbs items={["Platform", title]} />
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
        <p className="mt-1 text-sm text-slate-600">This list is loaded from the platform API. It does not include sample rows.</p>
      </div>
      {records.isLoading ? <LoadingState label={`Loading ${title.toLowerCase()}`} /> : null}
      {records.error ? (
        <ErrorState
          title={`${title} could not be loaded`}
          body={records.error instanceof ApiError ? records.error.message : "The platform API returned an error."}
          action={
            <Button type="button" variant="secondary" onClick={() => records.refetch()}>
              Try again
            </Button>
          }
        />
      ) : null}
      {records.data && records.data.count === 0 ? (
        <EmptyState title="No records" body="The database has no rows for this section." />
      ) : null}
    </section>
  );
}
