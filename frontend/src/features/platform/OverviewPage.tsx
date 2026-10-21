import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, ApiError } from "../../shared/api/client";
import type { PlatformOverview } from "../../shared/api/types";
import { Breadcrumbs } from "../../shared/ui/Breadcrumbs";
import { Button } from "../../shared/ui/Button";
import { ErrorState, LoadingState } from "../../shared/ui/States";

export function OverviewPage() {
  const overview = useQuery({
    queryKey: ["platform-overview"],
    queryFn: () => api<PlatformOverview>("/api/v1/platform/overview/"),
  });

  return (
    <section className="space-y-5">
      <Breadcrumbs items={["Platform", "Overview"]} />
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Overview</h1>
        <p className="mt-1 text-sm text-slate-600">Counts are calculated from the database when this page loads.</p>
      </div>
      {overview.isLoading ? <LoadingState label="Loading overview" /> : null}
      {overview.error ? (
        <ErrorState
          title="Overview could not be loaded"
          body={overview.error instanceof ApiError ? overview.error.message : "The platform API returned an error."}
          action={
            <Button type="button" variant="secondary" onClick={() => overview.refetch()}>
              Try again
            </Button>
          }
        />
      ) : null}
      {overview.data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Companies" value={overview.data.companies.total} to="/platform/companies" />
          <Metric label="Active users" value={overview.data.users.active} detail={`${overview.data.users.total} total`} to="/platform/users?account_status=active" />
          <Metric label="Authenticator enabled" value={overview.data.users.mfa_enabled} to="/platform/users?mfa=enabled" />
          <Metric label="Active memberships" value={overview.data.active_memberships} to="/platform/companies" />
          {Object.entries(overview.data.companies.by_status).map(([status, count]) => (
            <Metric key={status} label={`Companies ${status}`} value={count} to={`/platform/companies?status=${status}`} />
          ))}
          <Metric label="Platform grants" value={overview.data.platform_grants} to="/platform/users" />
        </div>
      ) : null}
    </section>
  );
}

function Metric({ label, value, detail, to }: { label: string; value: number; detail?: string; to: string }) {
  return (
    <Link to={to} className="rounded-lg border border-slate-200 bg-white px-4 py-5 transition hover:border-teal-700 hover:bg-teal-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-900">{value}</p>
      {detail ? <p className="mt-1 text-xs text-slate-500">{detail}</p> : null}
    </Link>
  );
}
