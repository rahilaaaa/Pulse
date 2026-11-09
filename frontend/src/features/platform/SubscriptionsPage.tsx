import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../../shared/api/client";
import type { PlatformSubscriptionRow } from "../../shared/api/types";
import { Breadcrumbs } from "../../shared/ui/Breadcrumbs";
import { Button } from "../../shared/ui/Button";
import { DataTable } from "../../shared/ui/DataTable";
import { SelectField, TextField } from "../../shared/ui/Fields";
import { Pagination } from "../../shared/ui/Pagination";
import { EmptyState, ErrorState, LoadingState } from "../../shared/ui/States";
import { StatusBadge } from "../../shared/ui/StatusBadge";

type OverviewData = {
  committed_mrr_minor: number;
  committed_arr_minor: number;
  mrr_residual_minor: number;
  mrr_at_risk_minor: number;
  currency: string;
  subscriptions_count: {
    total: number;
    active: number;
    trialing: number;
    past_due: number;
    canceled: number;
    expiring_in_30_days: number;
  };
};

export function SubscriptionsPage() {
  const [search, setSearch] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [status, setStatus] = useState("");
  const [planCode, setPlanCode] = useState("");
  const [interval, setInterval] = useState("");
  const [page, setPage] = useState(1);

  const overviewQuery = useQuery({
    queryKey: ["platform-billing-overview"],
    queryFn: () => api<OverviewData>("/api/v1/platform/billing/overview/"),
  });

  const queryString = useMemo(() => {
    const qp = new URLSearchParams({ page: String(page), page_size: "25" });
    if (submittedSearch) qp.set("q", submittedSearch);
    if (status) qp.set("status", status);
    if (planCode) qp.set("plan_code", planCode);
    if (interval) qp.set("interval", interval);
    return qp.toString();
  }, [interval, page, planCode, status, submittedSearch]);

  const listQuery = useQuery({
    queryKey: ["platform-subscriptions-list", queryString],
    queryFn: () =>
      api<{ results: PlatformSubscriptionRow[]; count: number; page: number; page_count: number }>(
        `/api/v1/platform/billing/subscriptions/?${queryString}`
      ),
  });

  const overview = overviewQuery.data;

  return (
    <section className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Breadcrumbs items={["Platform", "Subscriptions & Billing"]} />
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-pulse-ink">Subscriptions & Commercial</h1>
          <p className="mt-0.5 text-xs text-pulse-muted">
            Global MRR analytics, active tenant subscriptions, renewal deadlines, and plan mappings.
          </p>
        </div>
        <Link to="/platform/billing/plans">
          <Button variant="secondary" type="button">
            Manage subscription plans →
          </Button>
        </Link>
      </div>

      {/* KPI Cards */}
      {overview ? (
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-lg border border-pulse-border bg-pulse-surface p-4 shadow-2xs">
            <p className="text-[11px] font-medium uppercase text-pulse-muted">Committed MRR</p>
            <p className="mt-1 text-2xl font-bold text-pulse-ink">
              ₹{Math.round(overview.committed_mrr_minor / 100).toLocaleString("en-IN")}
            </p>
            <p className="mt-1 text-xs text-pulse-muted">Pre-tax monthly normalized</p>
          </div>

          <div className="rounded-lg border border-pulse-border bg-pulse-surface p-4 shadow-2xs">
            <p className="text-[11px] font-medium uppercase text-pulse-muted">Annual Run Rate (ARR)</p>
            <p className="mt-1 text-2xl font-bold text-pulse-ink">
              ₹{Math.round(overview.committed_arr_minor / 100).toLocaleString("en-IN")}
            </p>
            <p className="mt-1 text-xs text-pulse-muted">Committed MRR × 12</p>
          </div>

          <div className="rounded-lg border border-pulse-border bg-pulse-surface p-4 shadow-2xs">
            <p className="text-[11px] font-medium uppercase text-pulse-muted">Active subscriptions</p>
            <p className="mt-1 text-2xl font-bold text-teal-600 dark:text-teal-400">
              {overview.subscriptions_count.active}
            </p>
            <p className="mt-1 text-xs text-pulse-muted">
              {overview.subscriptions_count.trialing} trialing accounts
            </p>
          </div>

          <div className="rounded-lg border border-pulse-border bg-pulse-surface p-4 shadow-2xs">
            <p className="text-[11px] font-medium uppercase text-pulse-muted">Expiring in 30 days</p>
            <p className="mt-1 text-2xl font-bold text-pulse-ink">
              {overview.subscriptions_count.expiring_in_30_days}
            </p>
            <p className="mt-1 text-xs text-pulse-muted">Upcoming renewal deadlines</p>
          </div>

          <div className="rounded-lg border border-pulse-border bg-pulse-surface p-4 shadow-2xs">
            <p className="text-[11px] font-medium uppercase text-pulse-muted">MRR at risk</p>
            <p className="mt-1 text-2xl font-bold text-rose-600 dark:text-rose-400">
              ₹{Math.round(overview.mrr_at_risk_minor / 100).toLocaleString("en-IN")}
            </p>
            <p className="mt-1 text-xs text-pulse-muted">
              {overview.subscriptions_count.past_due} past due subscriptions
            </p>
          </div>
        </div>
      ) : null}

      {/* Filter toolbar */}
      <form
        className="rounded-lg border border-pulse-border bg-pulse-surface p-4 shadow-2xs"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setSubmittedSearch(search.trim());
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <TextField
            label="Search Tenant"
            name="q"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Company or plan name..."
          />
          <SelectField
            label="Subscription Status"
            name="st"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="trialing">Trialing</option>
            <option value="past_due">Past due</option>
            <option value="canceled">Canceled</option>
          </SelectField>
          <SelectField
            label="Plan"
            name="pc"
            value={planCode}
            onChange={(e) => {
              setPlanCode(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All plans</option>
            <option value="growth">Growth</option>
            <option value="starter">Starter</option>
            <option value="enterprise">Enterprise</option>
          </SelectField>
          <SelectField
            label="Billing Interval"
            name="bi"
            value={interval}
            onChange={(e) => {
              setInterval(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All intervals</option>
            <option value="month">Monthly</option>
            <option value="year">Annual</option>
          </SelectField>
        </div>

        <div className="mt-3 flex justify-end gap-2 pt-2 border-t border-pulse-border/60">
          <Button type="submit">Filter subscriptions</Button>
        </div>
      </form>

      {listQuery.isLoading ? <LoadingState label="Loading subscriptions" /> : null}

      {listQuery.error ? (
        <ErrorState
          title="Subscriptions could not be loaded"
          body={listQuery.error instanceof ApiError ? listQuery.error.message : "API returned an error."}
          action={
            <Button type="button" variant="secondary" onClick={() => listQuery.refetch()}>
              Try again
            </Button>
          }
        />
      ) : null}

      {listQuery.data && listQuery.data.count === 0 ? (
        <EmptyState title="No subscriptions match this filter" body="Try broadening your search or filter options." />
      ) : null}

      {listQuery.data && listQuery.data.results.length > 0 ? (
        <div className="space-y-4">
          <DataTable
            columns={[
              "Company Tenant",
              "Plan",
              "Interval",
              "Rate",
              "Status",
              "Period End",
              "Trial Expiry",
              "Actions",
            ]}
          >
            {listQuery.data.results.map((sub) => (
              <tr key={sub.id} className="hover:bg-pulse-hover/50 transition text-xs">
                <td className="px-4 py-3 font-semibold text-pulse-ink">
                  <Link to={`/platform/companies/${sub.company_id}`} className="text-teal-700 dark:text-teal-400 hover:underline">
                    {sub.company_name}
                  </Link>
                  <p className="font-mono text-[11px] text-pulse-muted">{sub.company_slug}</p>
                </td>

                <td className="px-4 py-3 font-medium text-pulse-ink">{sub.plan_name}</td>

                <td className="px-4 py-3 text-pulse-muted capitalize">{sub.billing_interval}</td>

                <td className="px-4 py-3 font-mono font-semibold text-pulse-ink">
                  ₹{(sub.amount_minor / 100).toLocaleString("en-IN")}
                </td>

                <td className="px-4 py-3">
                  <StatusBadge status={sub.status} />
                </td>

                <td className="px-4 py-3 text-pulse-muted">
                  {sub.current_period_end ? new Date(sub.current_period_end).toLocaleDateString() : "—"}
                </td>

                <td className="px-4 py-3 text-pulse-muted">
                  {sub.trial_ends_at ? new Date(sub.trial_ends_at).toLocaleDateString() : "—"}
                </td>

                <td className="px-4 py-3">
                  <Link
                    to={`/platform/companies/${sub.company_id}`}
                    className="rounded border border-pulse-border px-2.5 py-1 text-[11px] font-medium text-pulse-ink hover:bg-pulse-hover"
                  >
                    Inspect
                  </Link>
                </td>
              </tr>
            ))}
          </DataTable>

          <Pagination page={listQuery.data.page} pageCount={listQuery.data.page_count} onPageChange={setPage} />
        </div>
      ) : null}
    </section>
  );
}

