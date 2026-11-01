import { useQuery } from "@tanstack/react-query";
import { Link, useOutletContext } from "react-router-dom";
import { api } from "../../shared/api/client";
import { LoadingState } from "../../shared/ui/States";
import { StatusBadge } from "../../shared/ui/StatusBadge";
import type { WorkspacePayload } from "./types";

type Settings = {
  display_name: string;
  legal_name: string;
  slug: string;
  subscription: { plan_name: string; status: string; billing_interval: string; trial_ends_at: string | null } | null;
  billing_name: string;
  billing_email: string;
};

export function BillingPage() {
  const workspace = useOutletContext<WorkspacePayload>();
  const settings = useQuery({
    queryKey: ["company-settings", workspace.company.id],
    queryFn: () => api<Settings>(`/api/v1/companies/${workspace.company.id}/settings/`),
  });
  if (settings.isLoading || !settings.data) {
    return <LoadingState label="Loading billing" />;
  }
  const data = settings.data;
  const plan = data.subscription;
  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Billing & Plan</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">The subscription and billing contact for {data.display_name}.</p>
      </div>
      <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-slate-500 dark:text-slate-400">Current plan</p>
            <p className="text-xl font-semibold text-slate-900 dark:text-slate-100">{plan ? plan.plan_name : "No plan"}</p>
          </div>
          {plan ? <StatusBadge status={plan.status} /> : null}
        </div>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-slate-500 dark:text-slate-400">Billing interval</dt><dd className="font-medium text-slate-900 dark:text-slate-100">{plan?.billing_interval ?? "—"}</dd></div>
          <div><dt className="text-slate-500 dark:text-slate-400">Trial ends</dt><dd className="font-medium text-slate-900 dark:text-slate-100">{plan?.trial_ends_at ? new Date(plan.trial_ends_at).toLocaleDateString() : "—"}</dd></div>
          <div><dt className="text-slate-500 dark:text-slate-400">Billing contact</dt><dd className="font-medium text-slate-900 dark:text-slate-100">{data.billing_name || "—"}</dd></div>
          <div><dt className="text-slate-500 dark:text-slate-400">Billing email</dt><dd className="font-medium text-slate-900 dark:text-slate-100">{data.billing_email || "—"}</dd></div>
          <div><dt className="text-slate-500 dark:text-slate-400">Legal name</dt><dd className="font-medium text-slate-900 dark:text-slate-100">{data.legal_name}</dd></div>
          <div><dt className="text-slate-500 dark:text-slate-400">Workspace</dt><dd className="font-medium text-slate-900 dark:text-slate-100">{data.slug}</dd></div>
        </dl>
        <Link to="/app/settings?section=company" className="mt-4 inline-flex text-sm font-medium text-teal-800">Edit company information</Link>
      </section>
    </div>
  );
}
