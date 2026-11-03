import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, ApiError } from "../../shared/api/client";
import type { PlatformBillingPlan } from "../../shared/api/types";
import { Breadcrumbs } from "../../shared/ui/Breadcrumbs";
import { Button } from "../../shared/ui/Button";
import { EmptyState, ErrorState, LoadingState } from "../../shared/ui/States";

export function BillingPlansPage() {
  const plansQuery = useQuery({
    queryKey: ["platform-billing-plans"],
    queryFn: () => api<{ results: PlatformBillingPlan[]; count: number }>("/api/v1/platform/billing/plans/"),
  });

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Breadcrumbs items={["Platform", "Subscriptions", "Plans Catalog"]} />
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-pulse-ink">Subscription Plans Catalog</h1>
          <p className="mt-0.5 text-xs text-pulse-muted">
            Global commercial packages, pricing intervals, entitlement limits, and adoption across customer tenants.
          </p>
        </div>
        <Link to="/platform/billing">
          <Button variant="secondary" type="button">
            ← Active subscriptions
          </Button>
        </Link>
      </div>

      {plansQuery.isLoading ? <LoadingState label="Loading plans catalog" /> : null}

      {plansQuery.error ? (
        <ErrorState
          title="Plans could not be loaded"
          body={plansQuery.error instanceof ApiError ? plansQuery.error.message : "API returned an error."}
          action={
            <Button type="button" variant="secondary" onClick={() => plansQuery.refetch()}>
              Try again
            </Button>
          }
        />
      ) : null}

      {plansQuery.data && plansQuery.data.results.length === 0 ? (
        <EmptyState title="No plans defined" body="No commercial plans are configured in the database catalog." />
      ) : null}

      {plansQuery.data && plansQuery.data.results.length > 0 ? (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {plansQuery.data.results.map((plan) => (
            <div
              key={plan.id}
              className="rounded-lg border border-pulse-border bg-pulse-surface p-5 shadow-2xs flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="rounded bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 px-2 py-0.5 text-xs font-semibold text-teal-700 dark:text-teal-300 uppercase">
                    {plan.code}
                  </span>
                  <span className="text-xs text-pulse-muted">
                    {plan.active_subscriptions_count} active{" "}
                    {plan.active_subscriptions_count === 1 ? "tenant" : "tenants"}
                  </span>
                </div>

                <h2 className="mt-3 text-lg font-bold text-pulse-ink">{plan.name}</h2>
                <p className="mt-1 text-xs text-pulse-muted leading-relaxed">{plan.description}</p>

                {/* Pricing Rates */}
                <div className="mt-4 rounded-md bg-pulse-canvas p-3 border border-pulse-border/60 space-y-2">
                  <p className="text-[11px] font-semibold text-pulse-muted uppercase tracking-wider">Catalog Prices</p>
                  {plan.prices.map((pr) => (
                    <div key={pr.id} className="flex justify-between items-center text-xs">
                      <span className="capitalize text-pulse-ink font-medium">{pr.billing_interval}:</span>
                      <span className="font-mono font-bold text-pulse-ink">
                        ₹{Math.round(pr.amount_minor / 100).toLocaleString("en-IN")}{" "}
                        <span className="text-[10px] text-pulse-muted">/ {pr.billing_interval}</span>
                      </span>
                    </div>
                  ))}
                  {plan.trial_days > 0 ? (
                    <p className="text-[11px] text-teal-600 dark:text-teal-400 font-medium pt-1 border-t border-pulse-border/40">
                      Includes a {plan.trial_days}-day complimentary trial
                    </p>
                  ) : null}
                </div>

                {/* Entitlements */}
                <div className="mt-4 space-y-2 text-xs">
                  <p className="text-[11px] font-semibold text-pulse-muted uppercase tracking-wider">Entitlements</p>
                  <ul className="space-y-1 text-pulse-ink">
                    <li className="flex items-center justify-between py-1 border-b border-pulse-border/40">
                      <span className="text-pulse-muted">Max Employee People:</span>
                      <span className="font-semibold">{String(plan.entitlements.max_people ?? "Unlimited")}</span>
                    </li>
                    <li className="flex items-center justify-between py-1 border-b border-pulse-border/40">
                      <span className="text-pulse-muted">Studio Dashboards:</span>
                      <span className="font-semibold">{plan.entitlements.dashboards_enabled ? "Enabled" : "Disabled"}</span>
                    </li>
                    <li className="py-1">
                      <span className="text-pulse-muted block mb-1">Included Modules:</span>
                      <div className="flex flex-wrap gap-1">
                        {Array.isArray(plan.entitlements.included_module_slugs) ? (
                          (plan.entitlements.included_module_slugs as string[]).map((slug) => (
                            <span
                              key={slug}
                              className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono text-pulse-ink uppercase"
                            >
                              {slug}
                            </span>
                          ))
                        ) : (
                          <span className="text-pulse-muted">—</span>
                        )}
                      </div>
                    </li>
                  </ul>
                </div>
              </div>

              <div className="mt-5 pt-3 border-t border-pulse-border/60">
                <Link
                  to={`/platform/companies?plan=${plan.code}`}
                  className="text-xs font-semibold text-teal-600 dark:text-teal-400 hover:underline block text-center"
                >
                  View adopting companies →
                </Link>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

