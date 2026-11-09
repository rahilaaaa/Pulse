import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api, ApiError } from "../../shared/api/client";
import type { PlatformOnboardingData } from "../../shared/api/types";
import { Breadcrumbs } from "../../shared/ui/Breadcrumbs";
import { Button } from "../../shared/ui/Button";
import { DataTable } from "../../shared/ui/DataTable";
import { EmptyState, ErrorState, LoadingState } from "../../shared/ui/States";

export function OnboardingMonitorPage() {
  const queryClient = useQueryClient();

  const onboardingQuery = useQuery({
    queryKey: ["platform-onboarding-monitor"],
    queryFn: () => api<PlatformOnboardingData>("/api/v1/platform/operations/onboarding/"),
  });

  const activateMutation = useMutation({
    mutationFn: (companyId: string) =>
      api<void>(`/api/v1/platform/companies/${companyId}/activate/`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-onboarding-monitor"] });
      queryClient.invalidateQueries({ queryKey: ["platform-companies"] });
      queryClient.invalidateQueries({ queryKey: ["platform-overview"] });
    },
  });

  const data = onboardingQuery.data;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Breadcrumbs items={["Platform", "Companies", "Onboarding Monitor"]} />
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-pulse-ink">Tenant Onboarding Monitor</h1>
          <p className="mt-0.5 text-xs text-pulse-muted">
            Monitor draft tenants, track customer onboarding completion stages, and pending employee invitations.
          </p>
        </div>
      </div>

      {/* Metrics */}
      {data ? (
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-lg border border-pulse-border bg-pulse-surface p-4 shadow-2xs">
            <p className="text-[11px] font-medium uppercase text-pulse-muted">Draft companies</p>
            <p className="mt-1 text-2xl font-bold text-amber-600 dark:text-amber-400">{data.draft_companies_count}</p>
            <p className="mt-1 text-xs text-pulse-muted">Tenants awaiting onboarding completion</p>
          </div>

          <div className="rounded-lg border border-pulse-border bg-pulse-surface p-4 shadow-2xs">
            <p className="text-[11px] font-medium uppercase text-pulse-muted">Pending invitations</p>
            <p className="mt-1 text-2xl font-bold text-pulse-ink">{data.pending_invitations_count}</p>
            <p className="mt-1 text-xs text-pulse-muted">Employee invitations across all tenants</p>
          </div>

          <div className="rounded-lg border border-pulse-border bg-pulse-surface p-4 shadow-2xs">
            <p className="text-[11px] font-medium uppercase text-pulse-muted">Onboarding funnel health</p>
            <p className="mt-1 text-2xl font-bold text-teal-600 dark:text-teal-400">Normal</p>
            <p className="mt-1 text-xs text-pulse-muted">Automated verification running</p>
          </div>
        </div>
      ) : null}

      {onboardingQuery.isLoading ? <LoadingState label="Loading onboarding progress data" /> : null}

      {onboardingQuery.error ? (
        <ErrorState
          title="Onboarding data could not be loaded"
          body={onboardingQuery.error instanceof ApiError ? onboardingQuery.error.message : "API returned an error."}
          action={
            <Button type="button" variant="secondary" onClick={() => onboardingQuery.refetch()}>
              Try again
            </Button>
          }
        />
      ) : null}

      {data && data.companies.length === 0 ? (
        <EmptyState
          title="All companies fully onboarded"
          body="There are currently no companies waiting in draft status or incomplete onboarding."
        />
      ) : null}

      {data && data.companies.length > 0 ? (
        <div className="rounded-lg border border-pulse-border bg-pulse-surface shadow-2xs overflow-hidden">
          <DataTable columns={["Company", "Owner Account", "Registered", "Profile Setup", "Plan Choice", "Active Sub", "Actions"]}>
            {data.companies.map((c) => (
              <tr key={c.id} className="hover:bg-pulse-hover/50 transition text-xs">
                <td className="px-4 py-3">
                  <Link to={`/platform/companies/${c.id}`} className="font-semibold text-teal-700 dark:text-teal-400 hover:underline">
                    {c.display_name}
                  </Link>
                  <p className="font-mono text-[11px] text-pulse-muted">{c.slug}</p>
                </td>

                <td className="px-4 py-3 text-pulse-ink">{c.owner_email || "—"}</td>

                <td className="px-4 py-3 text-pulse-muted">
                  {c.created_at ? new Date(c.created_at).toLocaleDateString() : "—"}
                </td>

                <td className="px-4 py-3">
                  <StepBadge completed={c.profile_completed} />
                </td>

                <td className="px-4 py-3">
                  <StepBadge completed={c.plan_selected} />
                </td>

                <td className="px-4 py-3">
                  <StepBadge completed={c.subscription_activated} />
                </td>

                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Link
                      to={`/platform/companies/${c.id}`}
                      className="rounded border border-pulse-border px-2 py-1 text-[11px] font-medium text-pulse-ink hover:bg-pulse-hover"
                    >
                      Inspect
                    </Link>
                    <button
                      type="button"
                      disabled={activateMutation.isPending}
                      onClick={() => activateMutation.mutate(c.id)}
                      className="rounded bg-teal-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-teal-500"
                    >
                      Force activate
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </DataTable>
        </div>
      ) : null}
    </section>
  );
}

function StepBadge({ completed }: { completed: boolean }) {
  return completed ? (
    <span className="inline-flex items-center gap-1 rounded bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
      ✓ Done
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
      Pending
    </span>
  );
}

