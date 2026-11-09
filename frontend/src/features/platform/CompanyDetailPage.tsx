import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError } from "../../shared/api/client";
import type {
  PlatformAuditRow,
  PlatformCompanyDashboard,
  PlatformCompanyDetail,
  PlatformModuleRow,
} from "../../shared/api/types";
import { Breadcrumbs } from "../../shared/ui/Breadcrumbs";
import { Button } from "../../shared/ui/Button";
import { DataTable } from "../../shared/ui/DataTable";
import { SelectField, TextField } from "../../shared/ui/Fields";
import { Modal } from "../../shared/ui/Modal";
import { EmptyState, ErrorState, LoadingState } from "../../shared/ui/States";
import { StatusBadge } from "../../shared/ui/StatusBadge";

const COUNTRY_OPTIONS = [
  { code: "IN", label: "India (IN)" },
  { code: "AE", label: "United Arab Emirates (AE)" },
  { code: "SG", label: "Singapore (SG)" },
  { code: "US", label: "United States (US)" },
  { code: "GB", label: "United Kingdom (GB)" },
  { code: "SA", label: "Saudi Arabia (SA)" },
  { code: "QA", label: "Qatar (QA)" },
  { code: "OM", label: "Oman (OM)" },
  { code: "KW", label: "Kuwait (KW)" },
  { code: "BH", label: "Bahrain (BH)" },
  { code: "DE", label: "Germany (DE)" },
  { code: "CA", label: "Canada (CA)" },
  { code: "AU", label: "Australia (AU)" },
  { code: "MY", label: "Malaysia (MY)" },
  { code: "ID", label: "Indonesia (ID)" },
  { code: "NL", label: "Netherlands (NL)" },
];

const TIMEZONE_OPTIONS = [
  { value: "Asia/Kolkata", label: "Asia/Kolkata (UTC+05:30) India" },
  { value: "Asia/Dubai", label: "Asia/Dubai (UTC+04:00) UAE" },
  { value: "Asia/Singapore", label: "Asia/Singapore (UTC+08:00) Singapore" },
  { value: "Asia/Riyadh", label: "Asia/Riyadh (UTC+03:00) Saudi Arabia" },
  { value: "Asia/Qatar", label: "Asia/Qatar (UTC+03:00) Qatar" },
  { value: "Europe/London", label: "Europe/London (UTC+00:00) London" },
  { value: "Europe/Berlin", label: "Europe/Berlin (UTC+01:00) Berlin" },
  { value: "America/New_York", label: "America/New_York (UTC-05:00) Eastern" },
  { value: "America/Los_Angeles", label: "America/Los_Angeles (UTC-08:00) Pacific" },
];

export function CompanyDetailPage() {
  const { companyId = "" } = useParams();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<"overview" | "modules" | "members" | "activity">("overview");

  // Lifecycle modals
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editLegalName, setEditLegalName] = useState("");
  const [editTimezone, setEditTimezone] = useState("");
  const [editCountry, setEditCountry] = useState("");
  const [editError, setEditError] = useState("");

  const [isSuspendOpen, setIsSuspendOpen] = useState(false);
  const [suspendReason, setSuspendReason] = useState("");
  const [suspendError, setSuspendError] = useState("");

  const [isReactivateOpen, setIsReactivateOpen] = useState(false);
  const [isCloseOpen, setIsCloseOpen] = useState(false);

  // Plan change modal
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [newPlanCode, setNewPlanCode] = useState("growth");
  const [newPlanInterval, setNewPlanInterval] = useState("month");
  const [planChangeError, setPlanChangeError] = useState("");

  // Module uninstall modal
  const [uninstallModuleSlug, setUninstallModuleSlug] = useState<string | null>(null);

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

  const catalog = useQuery({
    queryKey: ["platform-modules-catalog"],
    queryFn: () => api<{ results: PlatformModuleRow[] }>("/api/v1/platform/modules/"),
    enabled: activeTab === "modules",
  });

  const auditLogs = useQuery({
    queryKey: ["platform-company-audit", companyId],
    queryFn: () => api<{ results: PlatformAuditRow[] }>(`/api/v1/platform/companies/${companyId}/audit-logs/`),
    enabled: activeTab === "activity",
  });

  // Mutations
  const updateMetaMutation = useMutation({
    mutationFn: () =>
      api<PlatformCompanyDetail>(`/api/v1/platform/companies/${companyId}/`, {
        method: "PATCH",
        body: JSON.stringify({
          display_name: editDisplayName.trim(),
          legal_name: editLegalName.trim(),
          timezone: editTimezone.trim(),
          country_code: editCountry.trim(),
        }),
      }),
    onSuccess: () => {
      setIsEditOpen(false);
      queryClient.invalidateQueries({ queryKey: ["platform-company", companyId] });
      queryClient.invalidateQueries({ queryKey: ["platform-companies"] });
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        if (err.details && err.details.length > 0) {
          const detailMessages = err.details.map((d) => d.message).filter(Boolean);
          setEditError(detailMessages.join(" ") || err.message);
        } else {
          setEditError(err.message || "Update failed.");
        }
      } else {
        setEditError("Update failed.");
      }
    },
  });

  const activateMutation = useMutation({
    mutationFn: () => api<PlatformCompanyDetail>(`/api/v1/platform/companies/${companyId}/activate/`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-company", companyId] });
      queryClient.invalidateQueries({ queryKey: ["platform-companies"] });
      queryClient.invalidateQueries({ queryKey: ["platform-overview"] });
    },
  });

  const suspendMutation = useMutation({
    mutationFn: () =>
      api<PlatformCompanyDetail>(`/api/v1/platform/companies/${companyId}/suspend/`, {
        method: "POST",
        body: JSON.stringify({ reason: suspendReason.trim() }),
      }),
    onSuccess: () => {
      setIsSuspendOpen(false);
      setSuspendReason("");
      queryClient.invalidateQueries({ queryKey: ["platform-company", companyId] });
      queryClient.invalidateQueries({ queryKey: ["platform-companies"] });
      queryClient.invalidateQueries({ queryKey: ["platform-overview"] });
    },
    onError: (err) => setSuspendError(err instanceof ApiError ? err.message : "Suspension failed."),
  });

  const reactivateMutation = useMutation({
    mutationFn: () => api<PlatformCompanyDetail>(`/api/v1/platform/companies/${companyId}/reactivate/`, { method: "POST" }),
    onSuccess: () => {
      setIsReactivateOpen(false);
      queryClient.invalidateQueries({ queryKey: ["platform-company", companyId] });
      queryClient.invalidateQueries({ queryKey: ["platform-companies"] });
      queryClient.invalidateQueries({ queryKey: ["platform-overview"] });
    },
  });

  const closeMutation = useMutation({
    mutationFn: () =>
      api<PlatformCompanyDetail>(`/api/v1/platform/companies/${companyId}/close/`, {
        method: "POST",
        body: JSON.stringify({ reason: "Closed by platform admin" }),
      }),
    onSuccess: () => {
      setIsCloseOpen(false);
      queryClient.invalidateQueries({ queryKey: ["platform-company", companyId] });
      queryClient.invalidateQueries({ queryKey: ["platform-companies"] });
      queryClient.invalidateQueries({ queryKey: ["platform-overview"] });
    },
  });

  const changePlanMutation = useMutation({
    mutationFn: () =>
      api<{ subscription_id: string }>(`/api/v1/platform/companies/${companyId}/subscription/change-plan/`, {
        method: "POST",
        body: JSON.stringify({ plan_code: newPlanCode, billing_interval: newPlanInterval }),
      }),
    onSuccess: () => {
      setIsPlanModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ["platform-company", companyId] });
      queryClient.invalidateQueries({ queryKey: ["platform-company-dashboard", companyId] });
    },
    onError: (err) => setPlanChangeError(err instanceof ApiError ? err.message : "Plan change failed."),
  });

  const installModuleMutation = useMutation({
    mutationFn: (slug: string) =>
      api<{ slug: string }>(`/api/v1/platform/companies/${companyId}/modules/${slug}/install/`, {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-company", companyId] });
      queryClient.invalidateQueries({ queryKey: ["platform-company-dashboard", companyId] });
    },
  });

  const uninstallModuleMutation = useMutation({
    mutationFn: (slug: string) =>
      api<{ slug: string }>(`/api/v1/platform/companies/${companyId}/modules/${slug}/uninstall/`, {
        method: "POST",
      }),
    onSuccess: () => {
      setUninstallModuleSlug(null);
      queryClient.invalidateQueries({ queryKey: ["platform-company", companyId] });
      queryClient.invalidateQueries({ queryKey: ["platform-company-dashboard", companyId] });
    },
  });

  if (detail.isLoading || dashboard.isLoading) {
    return <LoadingState label="Loading company administration profile" />;
  }

  const loadError = detail.error || dashboard.error;
  if (loadError || !detail.data || !dashboard.data) {
    return (
      <ErrorState
        title="Company could not be loaded"
        body={loadError instanceof ApiError ? loadError.message : "That company was not found."}
        action={
          <Link to="/platform/companies">
            <Button variant="secondary" type="button">
              Back to companies
            </Button>
          </Link>
        }
      />
    );
  }

  const company = detail.data;
  const dashData = dashboard.data;
  const memberSummary = company.member_summary || {
    total_members: 0,
    active_members: 0,
    pending_invitations: 0,
    owners_count: 0,
    managers_count: 0,
  };

  const planLabel = company.subscription
    ? `${company.subscription.plan_name} (${company.subscription.billing_interval})`
    : "No active plan";

  function openEditModal() {
    setEditDisplayName(company.display_name);
    setEditLegalName(company.legal_name || "");
    setEditTimezone(company.timezone || "Asia/Kolkata");
    setEditCountry(company.country_code || "IN");
    setEditError("");
    setIsEditOpen(true);
  }

  return (
    <section className="space-y-6">
      {/* Top Header & Context Actions */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-pulse-border/60 pb-5">
        <div>
          <Breadcrumbs items={["Platform", "Companies", company.display_name]} />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-pulse-ink">{company.display_name}</h1>
            <StatusBadge status={company.status} />
            <span className="rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-mono text-pulse-muted">
              {company.slug}
            </span>
          </div>
          <p className="mt-1 text-xs text-pulse-muted">
            Legal: <span className="font-medium text-pulse-ink">{company.legal_name || "—"}</span> · Timezone:{" "}
            {company.timezone || "—"} · Country: {company.country_code || "—"} · Registered:{" "}
            {new Date(company.created_at).toLocaleDateString()}
          </p>
        </div>

        {/* Lifecycle Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" onClick={openEditModal}>
            Edit metadata
          </Button>

          {company.status === "draft" ? (
            <Button type="button" onClick={() => activateMutation.mutate()}>
              Activate company
            </Button>
          ) : null}

          {company.status === "active" ? (
            <button
              type="button"
              onClick={() => {
                setSuspendReason("");
                setSuspendError("");
                setIsSuspendOpen(true);
              }}
              className="rounded-md border border-rose-300 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 px-3 py-1.5 text-xs font-medium text-rose-700 dark:text-rose-300 hover:bg-rose-100"
            >
              Suspend company
            </button>
          ) : null}

          {company.status === "suspended" ? (
            <Button type="button" onClick={() => setIsReactivateOpen(true)}>
              Reactivate company
            </Button>
          ) : null}

          {company.status !== "closed" ? (
            <button
              type="button"
              onClick={() => setIsCloseOpen(true)}
              className="rounded-md border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Close company
            </button>
          ) : null}
        </div>
      </div>

      {/* KPI Cards Strip */}
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard label="Active members" value={String(memberSummary.active_members)} detail={`${memberSummary.total_members} total registered`} />
        <MetricCard label="Company owners" value={String(memberSummary.owners_count)} detail={`${memberSummary.managers_count} managers`} />
        <MetricCard label="Installed modules" value={String(dashData.installed_modules_count)} detail="Active in tenant" />
        <MetricCard label="Organizational units" value={String(dashData.organization.units_count)} detail={`${dashData.organization.roles_count} roles configured`} />
        <MetricCard label="Subscription plan" value={planLabel} detail={company.subscription?.status || "Inactive"} />
      </div>

      {/* Tabs Navigation */}
      <div className="border-b border-pulse-border">
        <nav className="flex space-x-6" aria-label="Company Details Tabs">
          <button
            type="button"
            onClick={() => setActiveTab("overview")}
            className={`border-b-2 py-3 text-xs font-semibold transition ${
              activeTab === "overview"
                ? "border-teal-600 text-teal-600 dark:text-teal-400"
                : "border-transparent text-pulse-muted hover:text-pulse-ink"
            }`}
          >
            Overview & Commercial
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("modules")}
            className={`border-b-2 py-3 text-xs font-semibold transition ${
              activeTab === "modules"
                ? "border-teal-600 text-teal-600 dark:text-teal-400"
                : "border-transparent text-pulse-muted hover:text-pulse-ink"
            }`}
          >
            Installed Modules ({dashData.modules.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("members")}
            className={`border-b-2 py-3 text-xs font-semibold transition ${
              activeTab === "members"
                ? "border-teal-600 text-teal-600 dark:text-teal-400"
                : "border-transparent text-pulse-muted hover:text-pulse-ink"
            }`}
          >
            Members Summary (Privacy-Safe)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("activity")}
            className={`border-b-2 py-3 text-xs font-semibold transition ${
              activeTab === "activity"
                ? "border-teal-600 text-teal-600 dark:text-teal-400"
                : "border-transparent text-pulse-muted hover:text-pulse-ink"
            }`}
          >
            Company Activity Log
          </button>
        </nav>
      </div>

      {/* TAB 1: OVERVIEW & COMMERCIAL */}
      {activeTab === "overview" ? (
        <div className="grid gap-5 lg:grid-cols-2">
          {/* Company Profile Panel */}
          <div className="rounded-lg border border-pulse-border bg-pulse-surface p-4 shadow-2xs space-y-4">
            <h2 className="text-sm font-semibold text-pulse-ink">Company Profile & Tenant Setup</h2>
            <dl className="grid gap-3 sm:grid-cols-2 text-xs">
              <Field label="Display Name" value={company.display_name} />
              <Field label="Legal Name" value={company.legal_name || "—"} />
              <Field label="Tenant Slug" value={company.slug} />
              <Field label="Tenant ID" value={<span className="font-mono text-[11px]">{company.id}</span>} />
              <Field label="Country" value={company.country_code || "—"} />
              <Field label="Timezone" value={company.timezone || "—"} />
              <Field label="Lifecycle Status" value={<StatusBadge status={company.status} />} />
              <Field label="Registration Date" value={new Date(company.created_at).toLocaleString()} />
              {company.suspended_at ? (
                <Field label="Suspended At" value={new Date(company.suspended_at).toLocaleString()} />
              ) : null}
              {company.closed_at ? (
                <Field label="Closed At" value={new Date(company.closed_at).toLocaleString()} />
              ) : null}
            </dl>
          </div>

          {/* Subscription & Billing Panel */}
          <div className="rounded-lg border border-pulse-border bg-pulse-surface p-4 shadow-2xs space-y-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-pulse-ink">Subscription & Billing Status</h2>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setNewPlanCode(company.subscription?.plan_code || "growth");
                    setNewPlanInterval(company.subscription?.billing_interval || "month");
                    setPlanChangeError("");
                    setIsPlanModalOpen(true);
                  }}
                >
                  Change plan
                </Button>
              </div>

              {company.subscription ? (
                <dl className="mt-4 grid gap-3 sm:grid-cols-2 text-xs">
                  <Field label="Current Plan" value={company.subscription.plan_name} />
                  <Field label="Billing Interval" value={<span className="capitalize">{company.subscription.billing_interval}</span>} />
                  <Field label="Subscription Status" value={<StatusBadge status={company.subscription.status} />} />
                  <Field
                    label="Rate / Price"
                    value={`₹${(company.subscription.amount_minor / 100).toLocaleString("en-IN")}`}
                  />
                  {company.subscription.trial_ends_at ? (
                    <Field
                      label="Trial Expiration"
                      value={new Date(company.subscription.trial_ends_at).toLocaleDateString()}
                    />
                  ) : null}
                </dl>
              ) : (
                <p className="mt-4 text-xs text-pulse-muted">No active subscription record found on file.</p>
              )}

              {/* Tax & Invoicing Profile */}
              <div className="mt-5 border-t border-pulse-border/60 pt-4 space-y-2">
                <h3 className="text-xs font-semibold text-pulse-ink">Invoicing & Tax Profile</h3>
                {dashData.billing ? (
                  <dl className="grid gap-3 sm:grid-cols-2 text-xs">
                    <Field label="Billing Entity" value={dashData.billing.billing_name || "—"} />
                    <Field label="Billing Email" value={dashData.billing.billing_email || "—"} />
                    <Field label="GSTIN" value={dashData.billing.gstin || "Not provided"} />
                    <Field label="Billing Country" value={dashData.billing.country_code || "IN"} />
                  </dl>
                ) : (
                  <p className="text-xs text-pulse-muted">Company billing profile has not been completed.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* TAB 2: INSTALLED MODULES */}
      {activeTab === "modules" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-pulse-ink">Installed Modules & Extensions</h2>
              <p className="text-xs text-pulse-muted">
                Manage which business modules are provisioned and active for this tenant.
              </p>
            </div>
          </div>

          <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            {dashData.modules.map((mod) => (
              <div
                key={mod.slug}
                className="rounded-lg border border-pulse-border bg-pulse-surface p-4 shadow-2xs flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-pulse-ink">{mod.name}</h3>
                    <StatusBadge status={mod.status} />
                  </div>
                  <p className="mt-1 text-xs text-pulse-muted font-mono">{mod.slug}</p>
                  <div className="mt-3 text-xs space-y-1">
                    <p className="text-pulse-muted">
                      Version: <span className="text-pulse-ink font-medium">{mod.version}</span>
                    </p>
                    {mod.installed_at ? (
                      <p className="text-pulse-muted">
                        Installed:{" "}
                        <span className="text-pulse-ink">
                          {new Date(mod.installed_at).toLocaleDateString()}
                        </span>
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-pulse-border/60 flex justify-end gap-2">
                  {mod.status === "installed" ? (
                    <button
                      type="button"
                      onClick={() => setUninstallModuleSlug(mod.slug)}
                      className="text-xs text-rose-600 hover:text-rose-700 hover:underline"
                    >
                      Uninstall module
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => installModuleMutation.mutate(mod.slug)}
                      className="text-xs font-semibold text-teal-600 hover:text-teal-700 hover:underline"
                    >
                      Re-install
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Available Modules from Catalog to Install */}
          {catalog.data ? (
            <div className="mt-6 rounded-lg border border-pulse-border bg-pulse-surface p-4 shadow-2xs space-y-3">
              <h3 className="text-sm font-semibold text-pulse-ink">Install Additional Modules</h3>
              <p className="text-xs text-pulse-muted">
                Modules from the global catalog available for provisioning:
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 pt-2">
                {catalog.data.results
                  .filter((catMod) => !dashData.modules.some((m) => m.slug === catMod.slug && m.status === "installed"))
                  .map((availableMod) => (
                    <div
                      key={availableMod.slug}
                      className="rounded-md border border-pulse-border/80 bg-pulse-canvas p-3 flex flex-col justify-between"
                    >
                      <div>
                        <p className="text-xs font-semibold text-pulse-ink">{availableMod.display_name}</p>
                        <p className="text-[11px] text-pulse-muted mt-1 line-clamp-2">{availableMod.description}</p>
                      </div>
                      <div className="mt-3 pt-2 border-t border-pulse-border/60 flex items-center justify-between">
                        <span className="text-[10px] text-pulse-muted font-mono">v{availableMod.version}</span>
                        <Button
                          type="button"
                          onClick={() => installModuleMutation.mutate(availableMod.slug)}
                          disabled={installModuleMutation.isPending}
                        >
                          Install
                        </Button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* TAB 3: MEMBERS SUMMARY (STRICT PRIVACY ENFORCEMENT) */}
      {activeTab === "members" ? (
        <div className="space-y-5">
          <div className="rounded-lg bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 p-4">
            <h3 className="text-xs font-bold text-teal-800 dark:text-teal-200 uppercase tracking-wider">
              Tenant Member Privacy & Data Minimization Active
            </h3>
            <p className="mt-1 text-xs text-teal-900 dark:text-teal-300">
              In strict accordance with Pulse enterprise multi-tenant isolation, the Platform Administration Console
              presents aggregate operational statistics only. Individual employee names, email addresses, personal identifiers,
              and HR records are customer data strictly contained within the tenant workspace.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <MetricCard label="Total members" value={String(memberSummary.total_members)} detail="All registered memberships" />
            <MetricCard label="Active members" value={String(memberSummary.active_members)} detail="Active user accounts" />
            <MetricCard label="Company owners" value={String(memberSummary.owners_count)} detail="Workspace owners" />
            <MetricCard label="Managers" value={String(memberSummary.managers_count)} detail="Department & unit managers" />
            <MetricCard label="Pending invitations" value={String(memberSummary.pending_invitations)} detail="Unaccepted invitations" />
          </div>

          <div className="rounded-lg border border-pulse-border bg-pulse-surface p-5 shadow-2xs space-y-3">
            <h3 className="text-sm font-semibold text-pulse-ink">Membership & Identity Architecture</h3>
            <p className="text-xs text-pulse-muted leading-relaxed">
              Company membership records govern tenant authorization. Even if a user account exists on the platform,
              their data within this company is scoped exclusively to this tenant. Platform operators cannot inspect
              or browse individual payroll, compensation, attendance, or personal records.
            </p>
          </div>
        </div>
      ) : null}

      {/* TAB 4: COMPANY ACTIVITY */}
      {activeTab === "activity" ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-pulse-ink">Tenant Administrative Activity Log</h2>
            <span className="text-xs text-pulse-muted">Events scoped to {company.display_name}</span>
          </div>

          {auditLogs.isLoading ? <LoadingState label="Loading audit trail" /> : null}

          {auditLogs.data && auditLogs.data.results.length === 0 ? (
            <EmptyState
              title="No activity recorded"
              body="No administrative lifecycle or module events have been logged for this company yet."
            />
          ) : null}

          {auditLogs.data && auditLogs.data.results.length > 0 ? (
            <DataTable columns={["Action", "Actor", "Object", "Timestamp"]}>
              {auditLogs.data.results.map((log) => (
                <tr key={log.id} className="text-xs hover:bg-pulse-hover/50 transition">
                  <td className="px-4 py-3 font-mono font-semibold text-pulse-ink">{log.action}</td>
                  <td className="px-4 py-3 text-pulse-muted">
                    {log.actor_email} <span className="text-[10px]">({log.actor_name})</span>
                  </td>
                  <td className="px-4 py-3 text-pulse-muted capitalize">{log.object_type}</td>
                  <td className="px-4 py-3 text-pulse-muted">{new Date(log.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </DataTable>
          ) : null}
        </div>
      ) : null}

      {/* EDIT METADATA MODAL */}
      <Modal
        open={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        title="Edit Company Details"
        description="Update operational metadata for this company. Ownership, subscriptions, and modules are not changed."
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            updateMetaMutation.mutate();
          }}
        >
          {editError ? <div className="rounded bg-rose-50 p-2 text-xs text-rose-700">{editError}</div> : null}

          <TextField
            label="Display Name"
            name="dispName"
            value={editDisplayName}
            onChange={(e) => setEditDisplayName(e.target.value)}
            required
          />
          <TextField
            label="Legal Name"
            name="legName"
            value={editLegalName}
            onChange={(e) => setEditLegalName(e.target.value)}
            required
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField
              label="Timezone"
              name="tz"
              value={editTimezone}
              onChange={(e) => setEditTimezone(e.target.value)}
              required
            >
              {TIMEZONE_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
              {!TIMEZONE_OPTIONS.some((t) => t.value === editTimezone) && editTimezone ? (
                <option value={editTimezone}>{editTimezone}</option>
              ) : null}
            </SelectField>
            <SelectField
              label="Country"
              name="cc"
              value={editCountry}
              onChange={(e) => setEditCountry(e.target.value)}
              required
            >
              {COUNTRY_OPTIONS.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
              {!COUNTRY_OPTIONS.some((c) => c.code === editCountry) && editCountry ? (
                <option value={editCountry}>{editCountry}</option>
              ) : null}
            </SelectField>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-pulse-border/60">
            <Button type="button" variant="secondary" onClick={() => setIsEditOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateMetaMutation.isPending}>
              {updateMetaMutation.isPending ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* CHANGE PLAN MODAL */}
      <Modal
        open={isPlanModalOpen}
        onClose={() => setIsPlanModalOpen(false)}
        title="Change Subscription Plan"
        description="Select a new billing plan and interval for this tenant. An audit log and status event will be stored."
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            changePlanMutation.mutate();
          }}
        >
          {planChangeError ? (
            <div className="rounded bg-rose-50 p-2 text-xs text-rose-700">{planChangeError}</div>
          ) : null}

          <SelectField
            label="Target Plan"
            name="newPlan"
            value={newPlanCode}
            onChange={(e) => setNewPlanCode(e.target.value)}
          >
            <option value="growth">Growth Plan</option>
            <option value="starter">Starter Plan</option>
            <option value="enterprise">Enterprise Plan</option>
          </SelectField>

          <SelectField
            label="Billing Interval"
            name="newInterval"
            value={newPlanInterval}
            onChange={(e) => setNewPlanInterval(e.target.value)}
          >
            <option value="month">Monthly</option>
            <option value="year">Annual</option>
          </SelectField>

          <div className="flex justify-end gap-2 pt-3 border-t border-pulse-border/60">
            <Button type="button" variant="secondary" onClick={() => setIsPlanModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={changePlanMutation.isPending}>
              {changePlanMutation.isPending ? "Updating..." : "Confirm plan change"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* SUSPEND MODAL */}
      <Modal
        open={isSuspendOpen}
        onClose={() => setIsSuspendOpen(false)}
        title={`Suspend Company: ${company.display_name}`}
        description="Blocks workspace access for all users of this company immediately while preserving all tenant data."
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            suspendMutation.mutate();
          }}
        >
          {suspendError ? <div className="rounded bg-rose-50 p-2 text-xs text-rose-700">{suspendError}</div> : null}

          <div>
            <label className="block text-xs font-medium text-pulse-ink mb-1">
              Suspension Reason <span className="text-rose-500">*</span>
            </label>
            <textarea
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              placeholder="State reason for suspension (at least 10 characters)..."
              rows={3}
              className="w-full rounded-md border border-pulse-border bg-pulse-surface p-2 text-xs text-pulse-ink focus:border-teal-500 focus:outline-hidden"
              required
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-pulse-border/60">
            <Button type="button" variant="secondary" onClick={() => setIsSuspendOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={suspendMutation.isPending || suspendReason.trim().length < 10}
              className="bg-rose-600 text-white hover:bg-rose-500"
            >
              {suspendMutation.isPending ? "Suspending..." : "Confirm suspension"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* REACTIVATE CONFIRMATION */}
      <Modal
        open={isReactivateOpen}
        onClose={() => setIsReactivateOpen(false)}
        title={`Reactivate Company: ${company.display_name}`}
        description="Restores full workspace access according to their current subscription status. All company data remains intact."
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setIsReactivateOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={reactivateMutation.isPending}
              onClick={() => reactivateMutation.mutate()}
            >
              {reactivateMutation.isPending ? "Reactivating..." : "Reactivate access"}
            </Button>
          </>
        }
      >
        <p className="text-xs text-pulse-muted">Workspace access will immediately be restored for all active company members.</p>
      </Modal>

      {/* CLOSE CONFIRMATION */}
      <Modal
        open={isCloseOpen}
        onClose={() => setIsCloseOpen(false)}
        title={`Close Company: ${company.display_name}`}
        description="Marks the company as closed. Records and billing history are preserved for retention rules."
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setIsCloseOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={closeMutation.isPending}
              onClick={() => closeMutation.mutate()}
            >
              {closeMutation.isPending ? "Closing..." : "Close company"}
            </Button>
          </>
        }
      >
        <div className="rounded-md bg-rose-50 dark:bg-rose-950/40 p-3 border border-rose-200 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-200">
          <p className="font-semibold">Notice regarding company closure:</p>
          <p className="mt-1">The company lifecycle status will be set to CLOSED and workspace access will be blocked. Business data will remain stored in PostgreSQL per compliance retention policies.</p>
        </div>
      </Modal>

      {/* UNINSTALL MODULE CONFIRMATION */}
      <Modal
        open={Boolean(uninstallModuleSlug)}
        onClose={() => setUninstallModuleSlug(null)}
        title={`Uninstall Module: ${uninstallModuleSlug ?? ""}`}
        description={`Uninstalls the ${uninstallModuleSlug ?? ""} module from this company. Pursuant to ADR-011, existing business tables and historical records created by the company will be safely retained.`}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setUninstallModuleSlug(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={uninstallModuleMutation.isPending}
              onClick={() => {
                if (uninstallModuleSlug) {
                  uninstallModuleMutation.mutate(uninstallModuleSlug);
                }
              }}
            >
              {uninstallModuleMutation.isPending ? "Uninstalling..." : "Confirm uninstall"}
            </Button>
          </>
        }
      >
        {/* {uninstallModuleMutation.isError ? (
          <div>
            <p>Action blocked</p>
            <p>Cannot disable a module</p>
          </div>
        ): null} */}
        
        <div className="rounded-md bg-amber-50 dark:bg-amber-950/40 p-3 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200">
          <p className="font-semibold">Data retention assurance:</p>
          <p className="mt-1">Module uninstallation sets the company installation record to disabled/uninstalled. No database tables, schema columns, or business transactions will be dropped or deleted.</p>
        </div>
      </Modal>
    </section>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-lg border border-pulse-border bg-pulse-surface p-4 shadow-2xs">
      <p className="text-[11px] font-medium uppercase tracking-wider text-pulse-muted">{label}</p>
      <p className="mt-1 text-xl font-bold tracking-tight text-pulse-ink">{value}</p>
      {detail ? <p className="mt-1 text-xs text-pulse-muted truncate">{detail}</p> : null}
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wider text-pulse-muted">{label}</dt>
      <dd className="mt-0.5 text-xs font-semibold text-pulse-ink">{value}</dd>
    </div>
  );
}
