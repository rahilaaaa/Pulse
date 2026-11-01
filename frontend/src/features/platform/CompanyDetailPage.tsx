import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError } from "../../shared/api/client";
import type { PlatformCompanyDashboard, PlatformCompanyDetail } from "../../shared/api/types";
import { Breadcrumbs } from "../../shared/ui/Breadcrumbs";
import { DataTable } from "../../shared/ui/DataTable";
import { StatusBadge } from "../../shared/ui/StatusBadge";
import { EmptyState, ErrorState, LoadingState } from "../../shared/ui/States";

export function CompanyDetailPage() {
  const { companyId = "" } = useParams();
  const detail = useQuery({
    queryKey: ["platform-company", companyId],
    queryFn: () => api<PlatformCompanyDetail>(`/api/v1/platform/companies/${companyId}/`),
    enabled: Boolean(companyId),
  });
  const dashboard = useQuery({
    queryKey: ["platform-company-dashboard", companyId],
    queryFn: () => api<PlatformCompanyDashboard>(`/api/v1/platform/companies/${companyId}/dashboard/`),
    enabled: Boolean(companyId),
  });

  if (detail.isLoading || dashboard.isLoading) {
    return <LoadingState label="Loading company" />;
  }

  const loadError = detail.error || dashboard.error;
  if (loadError || !detail.data || !dashboard.data) {
    return (
      <ErrorState
        title="Company could not be loaded"
        body={loadError instanceof ApiError ? loadError.message : "That company was not found."}
        action={
          <Link
            className="inline-flex rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-800 dark:text-slate-200"
            to="/platform/companies"
          >
            Back to companies
          </Link>
        }
      />
    );
  }

  const members = detail.data;
  const data = dashboard.data;
  const company = data.company;
  const planLabel = data.subscription
    ? `${data.subscription.plan_name} · ${data.subscription.status}`
    : "No plan";

  return (
    <section className="space-y-5">
      <Breadcrumbs items={["Platform", "Companies", company.display_name]} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{company.display_name}</h1>
            <StatusBadge status={company.status} />
          </div>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            {company.slug}
            <span className="text-slate-300 dark:text-slate-600"> · </span>
            {company.legal_name}
            <span className="text-slate-300 dark:text-slate-600"> · </span>
            {company.timezone || "—"}
          </p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Created {formatDateTime(company.created_at)}
            {company.country_code ? ` · ${company.country_code}` : ""}
          </p>
        </div>
        <Link className="text-sm font-medium text-teal-800 dark:text-teal-300" to="/platform/companies">
          ← All companies
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Metric label="Active members" value={String(data.people.memberships_active)} />
        <Metric
          label="People"
          value={String(data.people.people_active)}
          detail={`${data.people.people_total} total`}
        />
        <Metric label="Units" value={String(data.organization.units_count)} />
        <Metric label="Installed modules" value={String(data.installed_modules_count)} />
        <Metric label="Plan" value={planLabel} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Company & billing">
          <dl className="grid gap-3 sm:grid-cols-2">
            <Field label="Legal name" value={company.legal_name} />
            <Field label="Slug" value={company.slug} />
            <Field label="Timezone" value={company.timezone || "—"} />
            <Field label="Country" value={company.country_code || "—"} />
            <Field label="Roles" value={String(data.organization.roles_count)} />
            <Field
              label="Invitations"
              value={
                data.people.pending_invitations > 0
                  ? `${data.people.pending_invitations} pending`
                  : data.people.memberships_invited > 0
                    ? `${data.people.memberships_invited} invited`
                    : "None pending"
              }
            />
          </dl>
          <div className="mt-4 border-t border-slate-100 dark:border-slate-800 pt-4">
            {data.subscription ? (
              <dl className="grid gap-3 sm:grid-cols-2">
                <Field label="Plan" value={data.subscription.plan_name} />
                <Field label="Status" value={<StatusBadge status={data.subscription.status} />} />
                <Field label="Interval" value={data.subscription.billing_interval || "—"} />
                <Field label="Code" value={data.subscription.plan_code} />
              </dl>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">No active subscription on file.</p>
            )}
            {data.billing ? (
              <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="Billing name" value={data.billing.billing_name} />
                <Field label="Billing email" value={data.billing.billing_email} />
              </dl>
            ) : (
              <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Billing profile not completed.</p>
            )}
          </div>
        </Panel>

        <Panel title="Installed modules">
          {data.modules.length === 0 ? (
            <EmptyState title="No modules installed" body="When this company installs apps, they will appear here." />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.modules.map((mod) => (
                <li key={mod.slug} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{mod.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {mod.slug}
                      {mod.version ? ` · v${mod.version}` : ""}
                      {mod.installed_at ? ` · ${formatDateTime(mod.installed_at)}` : ""}
                    </p>
                  </div>
                  <StatusBadge status={mod.status} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Members</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          People with a membership in this company. Platform operators without a company membership are not listed here.
        </p>
      </div>

      {members.members.length === 0 ? (
        <EmptyState title="No members yet" body="When people join this company, they will appear here." />
      ) : (
        <DataTable columns={["Email", "Name", "Membership", "Roles", "Verified", "Joined"]}>
          {members.members.map((member) => (
            <tr key={member.membership_id}>
              <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{member.email}</td>
              <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                {[member.first_name, member.last_name].filter(Boolean).join(" ") || "—"}
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={member.membership_status} />
              </td>
              <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{member.roles.join(", ") || "—"}</td>
              <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{member.email_verified ? "Yes" : "No"}</td>
              <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                {member.joined_at ? formatDateTime(member.joined_at) : "—"}
              </td>
            </tr>
          ))}
        </DataTable>
      )}
    </section>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{value}</p>
      {detail ? <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{detail}</p> : null}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-slate-900 dark:text-slate-100">{value}</dd>
    </div>
  );
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}
