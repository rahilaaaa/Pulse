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

  const data = overview.data;

  return (
    <section className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Breadcrumbs items={["Platform", "Overview"]} />
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-pulse-ink">Platform Overview</h1>
          <p className="mt-0.5 text-xs text-pulse-muted">
            Central platform operations, cross-tenant metrics, commercial status, and activity.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/platform/companies">
            <Button type="button">Manage companies</Button>
          </Link>
          <Link to="/platform/audit">
            <Button type="button" variant="secondary">
              Audit logs
            </Button>
          </Link>
        </div>
      </div>

      {overview.isLoading ? <LoadingState label="Loading platform operations overview" /> : null}

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

      {data ? (
        <>
          {/* Key KPI Metrics (8 Cards) */}
          <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label="Total companies"
              value={data.companies.total}
              detail={`${data.companies.active} active · ${data.companies.draft} draft`}
              to="/platform/companies"
              accent="teal"
            />
            <MetricCard
              label="Active companies"
              value={data.companies.active}
              detail={`${data.companies.suspended} suspended · ${data.companies.closed} closed`}
              to="/platform/companies?status=active"
              accent="emerald"
            />
            <MetricCard
              label="Committed MRR"
              value={formatInr(data.billing.committed_mrr_minor)}
              detail={`ARR ~${formatInr(data.billing.committed_arr_minor)}`}
              to="/platform/billing"
              accent="blue"
            />
            <MetricCard
              label="Active subscriptions"
              value={data.billing.subscriptions_count.active}
              detail={`${data.billing.subscriptions_count.trialing} trialing · ${data.billing.subscriptions_count.past_due} past due`}
              to="/platform/billing"
              accent="purple"
            />
            <MetricCard
              label="Expiring renewals (30d)"
              value={data.billing.subscriptions_count.expiring_in_30_days}
              detail={data.billing.mrr_at_risk_minor > 0 ? `At risk: ${formatInr(data.billing.mrr_at_risk_minor)}` : "No urgent past-due risk"}
              to="/platform/billing"
              accent={data.billing.subscriptions_count.expiring_in_30_days > 0 ? "amber" : "slate"}
            />
            <MetricCard
              label="Company memberships"
              value={data.memberships.active}
              detail={`${data.memberships.total} total · ${data.memberships.pending_invitations} invites`}
              to="/platform/companies"
              accent="slate"
            />
            <MetricCard
              label="Module catalog"
              value={data.modules.total_catalog}
              detail={`${data.modules.total_installed} tenant installations`}
              to="/platform/modules"
              accent="teal"
            />
            <MetricCard
              label="Platform operators"
              value={data.platform_grants}
              detail={`${data.users.active} total active Pulse accounts`}
              to="/platform/users"
              accent="slate"
            />
          </div>

          {/* Visualizations Grid */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Chart 1: Company Growth Trends */}
            <div className="rounded-lg border border-pulse-border bg-pulse-surface p-4 shadow-2xs">
              <div className="flex items-center justify-between pb-3 border-b border-pulse-border/60">
                <div>
                  <h2 className="text-sm font-semibold text-pulse-ink">Company Registration Trends</h2>
                  <p className="text-[11px] text-pulse-muted">New companies onboarded over the last 6 months</p>
                </div>
                <span className="text-xs font-medium text-teal-600 dark:text-teal-400">Monthly</span>
              </div>
              <div className="mt-4">
                <GrowthBarChart data={data.trends.company_growth} />
              </div>
            </div>

            {/* Chart 2: Lifecycle & Plan Distribution */}
            <div className="rounded-lg border border-pulse-border bg-pulse-surface p-4 shadow-2xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-pulse-border/60">
                  <div>
                    <h2 className="text-sm font-semibold text-pulse-ink">Lifecycle & Plan Distribution</h2>
                    <p className="text-[11px] text-pulse-muted">Tenant status and commercial plan adoption</p>
                  </div>
                </div>

                {/* Lifecycle Distribution Bar */}
                <div className="mt-4 space-y-2">
                  <div className="flex justify-between text-xs text-pulse-muted">
                    <span className="font-medium text-pulse-ink">Lifecycle Status</span>
                    <span>{data.companies.total} total</span>
                  </div>
                  <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    {data.companies.total > 0 ? (
                      <>
                        <div
                          style={{ width: `${(data.companies.active / data.companies.total) * 100}%` }}
                          className="bg-emerald-500"
                          title={`Active: ${data.companies.active}`}
                        />
                        <div
                          style={{ width: `${(data.companies.draft / data.companies.total) * 100}%` }}
                          className="bg-amber-400"
                          title={`Draft: ${data.companies.draft}`}
                        />
                        <div
                          style={{ width: `${(data.companies.suspended / data.companies.total) * 100}%` }}
                          className="bg-rose-500"
                          title={`Suspended: ${data.companies.suspended}`}
                        />
                        <div
                          style={{ width: `${(data.companies.closed / data.companies.total) * 100}%` }}
                          className="bg-slate-400"
                          title={`Closed: ${data.companies.closed}`}
                        />
                      </>
                    ) : (
                      <div className="w-full bg-slate-200 dark:bg-slate-700" />
                    )}
                  </div>
                  <div className="flex flex-wrap gap-4 pt-1 text-[11px] text-pulse-muted">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" /> Active ({data.companies.active})
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-amber-400" /> Draft ({data.companies.draft})
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-rose-500" /> Suspended ({data.companies.suspended})
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-slate-400" /> Closed ({data.companies.closed})
                    </span>
                  </div>
                </div>

                {/* Plan Distribution Breakdown */}
                <div className="mt-5 space-y-2 border-t border-pulse-border/60 pt-4">
                  <div className="flex justify-between text-xs text-pulse-muted">
                    <span className="font-medium text-pulse-ink">Subscription Plans</span>
                    <span>{Object.values(data.trends.plan_distribution).reduce((a, b) => a + b, 0)} subscriptions</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {Object.entries(data.trends.plan_distribution).map(([planName, count]) => (
                      <div
                        key={planName}
                        className="rounded-md border border-pulse-border bg-pulse-canvas p-2 text-center"
                      >
                        <p className="text-[11px] text-pulse-muted truncate">{planName}</p>
                        <p className="text-base font-bold text-pulse-ink">{count}</p>
                      </div>
                    ))}
                    {Object.keys(data.trends.plan_distribution).length === 0 ? (
                      <p className="text-xs text-pulse-muted col-span-2">No active plans yet</p>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* Module Adoption Preview */}
              <div className="mt-5 border-t border-pulse-border/60 pt-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-pulse-muted">Top Installed Modules:</span>
                  <Link to="/platform/modules" className="text-teal-600 dark:text-teal-400 hover:underline text-[11px]">
                    View all catalog →
                  </Link>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {data.modules.adoption.slice(0, 4).map((mod) => (
                    <span
                      key={mod.slug}
                      className="inline-flex items-center gap-1 rounded-md bg-pulse-canvas border border-pulse-border px-2 py-1 text-[11px] text-pulse-ink"
                    >
                      <span className="font-medium">{mod.name}:</span>
                      <span className="text-teal-600 dark:text-teal-400 font-semibold">{mod.installed_count}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Quick Actions & Recent Platform Activity */}
          <div className="grid gap-4 lg:grid-cols-3">
            {/* Quick Actions (1 col) */}
            <div className="rounded-lg border border-pulse-border bg-pulse-surface p-4 shadow-2xs space-y-3">
              <h2 className="text-sm font-semibold text-pulse-ink">Operator Shortcuts</h2>
              <div className="space-y-2">
                <ShortcutLink
                  to="/platform/companies"
                  title="Manage Companies"
                  desc="Review tenant lifecycles, plans, and module adoption"
                />
                <ShortcutLink
                  to="/platform/onboarding"
                  title="Monitor Onboarding"
                  desc="Review draft companies and incomplete onboarding"
                />
                <ShortcutLink
                  to="/platform/modules"
                  title="Manage Module Catalog"
                  desc="Toggle module availability and view dependencies"
                />
                <ShortcutLink
                  to="/platform/billing/plans"
                  title="Subscription Plans"
                  desc="Configure billing pricing, intervals & entitlements"
                />
                <ShortcutLink
                  to="/platform/settings"
                  title="Platform Settings"
                  desc="Adjust grace period, registration & maintenance"
                />
                <ShortcutLink
                  to="/platform/health"
                  title="Operations Health"
                  desc="Inspect database latency and runtime status"
                />
              </div>
            </div>

            {/* Recent Activity Feed (2 cols) */}
            <div className="lg:col-span-2 rounded-lg border border-pulse-border bg-pulse-surface p-4 shadow-2xs">
              <div className="flex items-center justify-between pb-3 border-b border-pulse-border/60">
                <div>
                  <h2 className="text-sm font-semibold text-pulse-ink">Recent Platform Activity</h2>
                  <p className="text-[11px] text-pulse-muted">Real-time audit events across tenants and platform operations</p>
                </div>
                <Link to="/platform/audit" className="text-xs text-teal-600 dark:text-teal-400 hover:underline">
                  Full audit log →
                </Link>
              </div>

              <div className="mt-3 divide-y divide-pulse-border/50">
                {data.recent_activity.length === 0 ? (
                  <p className="py-6 text-center text-xs text-pulse-muted">No recent activity recorded yet.</p>
                ) : (
                  data.recent_activity.map((act) => (
                    <div key={act.id} className="py-2.5 flex items-start justify-between gap-3 text-xs">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] font-semibold text-pulse-ink">{act.action}</span>
                          {act.company_name ? (
                            <span className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] text-pulse-muted truncate max-w-[150px]">
                              {act.company_name}
                            </span>
                          ) : (
                            <span className="rounded bg-teal-50 dark:bg-teal-950/40 px-1.5 py-0.5 text-[10px] text-teal-700 dark:text-teal-300">
                              Platform
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-[11px] text-pulse-muted truncate">
                          Actor: <span className="text-pulse-ink">{act.actor_email}</span> ({act.actor_name})
                        </p>
                      </div>
                      <span className="text-[11px] text-pulse-muted whitespace-nowrap">
                        {new Date(act.created_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}

function MetricCard({
  label,
  value,
  detail,
  to,
  accent = "teal",
}: {
  label: string;
  value: string | number;
  detail?: string;
  to: string;
  accent?: "teal" | "emerald" | "blue" | "purple" | "amber" | "slate";
}) {
  const accentBorder = {
    teal: "hover:border-teal-500",
    emerald: "hover:border-emerald-500",
    blue: "hover:border-blue-500",
    purple: "hover:border-purple-500",
    amber: "hover:border-amber-500",
    slate: "hover:border-slate-500",
  }[accent];

  return (
    <Link
      to={to}
      className={`rounded-lg border border-pulse-border bg-pulse-surface p-4 transition-all duration-150 hover:shadow-xs focus-visible:outline-2 focus-visible:outline-teal-600 ${accentBorder}`}
    >
      <p className="text-[11px] font-medium uppercase tracking-wider text-pulse-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight text-pulse-ink">{value}</p>
      {detail ? <p className="mt-1 text-xs text-pulse-muted truncate">{detail}</p> : null}
    </Link>
  );
}

function ShortcutLink({ to, title, desc }: { to: string; title: string; desc: string }) {
  return (
    <Link
      to={to}
      className="block rounded-md border border-pulse-border/60 bg-pulse-canvas p-2.5 transition hover:border-teal-500 hover:bg-pulse-surface"
    >
      <p className="text-xs font-semibold text-pulse-ink">{title}</p>
      <p className="text-[11px] text-pulse-muted mt-0.5">{desc}</p>
    </Link>
  );
}

function GrowthBarChart({ data }: { data: Array<{ key: string; label: string; count: number }> }) {
  if (!data || data.length === 0) {
    return <div className="h-44 flex items-center justify-center text-xs text-pulse-muted">No trend data available</div>;
  }

  const maxVal = Math.max(...data.map((d) => d.count), 1);
  const chartHeight = 140;

  return (
    <div className="w-full">
      <div className="flex items-end justify-between gap-3 h-36 pt-4 px-2">
        {data.map((d) => {
          const barHeight = Math.max((d.count / maxVal) * (chartHeight - 30), 4);
          return (
            <div key={d.key} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group">
              <span className="text-[10px] font-semibold text-pulse-ink opacity-80 group-hover:opacity-100">
                {d.count}
              </span>
              <div
                style={{ height: `${barHeight}px` }}
                className="w-full max-w-[40px] rounded-t-sm bg-teal-600 dark:bg-teal-500 transition-all group-hover:bg-teal-500 dark:group-hover:bg-teal-400 shadow-2xs"
              />
              <span className="text-[10px] text-pulse-muted whitespace-nowrap mt-1">{d.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatInr(amountMinor: number): string {
  const rupees = Math.round(amountMinor / 100);
  return `₹${rupees.toLocaleString("en-IN")}`;
}
