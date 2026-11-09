import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../../shared/api/client";
import type { CompanyList, CompanyRow } from "../../shared/api/types";
import { Breadcrumbs } from "../../shared/ui/Breadcrumbs";
import { Button } from "../../shared/ui/Button";
import { DataTable } from "../../shared/ui/DataTable";
import { SelectField, TextField } from "../../shared/ui/Fields";
import { Modal } from "../../shared/ui/Modal";
import { Pagination } from "../../shared/ui/Pagination";
import { EmptyState, ErrorState, LoadingState } from "../../shared/ui/States";
import { StatusBadge } from "../../shared/ui/StatusBadge";

const PAGE_SIZE = 25;

export function CompaniesPage() {
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [status, setStatus] = useState(params.get("status") ?? "");
  const [plan, setPlan] = useState("");
  const [subStatus, setSubStatus] = useState("");
  const [moduleFilter, setModuleFilter] = useState("");
  const [sort, setSort] = useState("-created_at");
  const [page, setPage] = useState(1);

  // Modals state
  const [suspendCompanyTarget, setSuspendCompanyTarget] = useState<CompanyRow | null>(null);
  const [suspendReason, setSuspendReason] = useState("");
  const [suspendError, setSuspendError] = useState("");

  const [reactivateTarget, setReactivateTarget] = useState<CompanyRow | null>(null);
  const [closeTarget, setCloseTarget] = useState<CompanyRow | null>(null);

  const queryString = useMemo(() => {
    const qp = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE), sort });
    if (submittedSearch) qp.set("q", submittedSearch);
    if (status) qp.set("status", status);
    if (plan) qp.set("plan", plan);
    if (subStatus) qp.set("subscription_status", subStatus);
    if (moduleFilter) qp.set("module", moduleFilter);
    return qp.toString();
  }, [moduleFilter, page, plan, sort, status, subStatus, submittedSearch]);

  const companies = useQuery({
    queryKey: ["platform-companies", queryString],
    queryFn: () => api<CompanyList>(`/api/v1/platform/companies/?${queryString}`),
  });

  const activateMutation = useMutation({
    mutationFn: (companyId: string) =>
      api<CompanyRow>(`/api/v1/platform/companies/${companyId}/activate/`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["platform-companies"] });
      queryClient.invalidateQueries({ queryKey: ["platform-overview"] });
    },
  });

  const suspendMutation = useMutation({
    mutationFn: ({ companyId, reason }: { companyId: string; reason: string }) =>
      api<CompanyRow>(`/api/v1/platform/companies/${companyId}/suspend/`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => {
      setSuspendCompanyTarget(null);
      setSuspendReason("");
      setSuspendError("");
      queryClient.invalidateQueries({ queryKey: ["platform-companies"] });
      queryClient.invalidateQueries({ queryKey: ["platform-overview"] });
    },
    onError: (err) => {
      setSuspendError(err instanceof ApiError ? err.message : "Suspension failed.");
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: (companyId: string) =>
      api<CompanyRow>(`/api/v1/platform/companies/${companyId}/reactivate/`, { method: "POST" }),
    onSuccess: () => {
      setReactivateTarget(null);
      queryClient.invalidateQueries({ queryKey: ["platform-companies"] });
      queryClient.invalidateQueries({ queryKey: ["platform-overview"] });
    },
  });

  const closeMutation = useMutation({
    mutationFn: (companyId: string) =>
      api<CompanyRow>(`/api/v1/platform/companies/${companyId}/close/`, {
        method: "POST",
        body: JSON.stringify({ reason: "Closed by platform admin" }),
      }),
    onSuccess: () => {
      setCloseTarget(null);
      queryClient.invalidateQueries({ queryKey: ["platform-companies"] });
      queryClient.invalidateQueries({ queryKey: ["platform-overview"] });
    },
  });

  function handleClearFilters() {
    setSearch("");
    setSubmittedSearch("");
    setStatus("");
    setPlan("");
    setSubStatus("");
    setModuleFilter("");
    setSort("-created_at");
    setPage(1);
    setParams({});
  }

  const hasActiveFilters = Boolean(submittedSearch || status || plan || subStatus || moduleFilter || sort !== "-created_at");

  return (
    <section className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Breadcrumbs items={["Platform", "Companies"]} />
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-pulse-ink">Companies</h1>
          <p className="mt-0.5 text-xs text-pulse-muted">
            Manage tenant organizations, status lifecycles, subscriptions, and module adoption.
          </p>
        </div>

      </div>

      {/* Advanced Filter Bar */}
      <form
        className="rounded-lg border border-pulse-border bg-pulse-surface p-4 shadow-2xs space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setSubmittedSearch(search.trim());
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <TextField
            label="Search"
            name="q"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, slug or legal name"
          />

          <SelectField
            label="Lifecycle Status"
            name="status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="draft">Draft</option>
            <option value="suspended">Suspended</option>
            <option value="closed">Closed</option>
          </SelectField>

          <SelectField
            label="Subscription Plan"
            name="plan"
            value={plan}
            onChange={(e) => {
              setPlan(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All plans</option>
            <option value="growth">Growth</option>
            <option value="starter">Starter</option>
            <option value="enterprise">Enterprise</option>
          </SelectField>

          <SelectField
            label="Subscription Status"
            name="subStatus"
            value={subStatus}
            onChange={(e) => {
              setSubStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All subscription states</option>
            <option value="active">Active</option>
            <option value="trialing">Trialing</option>
            <option value="past_due">Past due</option>
            <option value="canceled">Canceled</option>
          </SelectField>

          <SelectField
            label="Installed Module"
            name="module"
            value={moduleFilter}
            onChange={(e) => {
              setModuleFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All modules</option>
            <option value="hrms">HRMS</option>
            <option value="projects">Projects</option>
            <option value="crm">CRM</option>
            <option value="commerce">Commerce</option>
          </SelectField>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-pulse-border/60 pt-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-pulse-muted">Sort by:</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="rounded border border-pulse-border bg-pulse-surface px-2 py-1 text-xs text-pulse-ink"
            >
              <option value="-created_at">Newest registered</option>
              <option value="created_at">Oldest registered</option>
              <option value="display_name">Name (A–Z)</option>
              <option value="-display_name">Name (Z–A)</option>
              <option value="slug">Slug (A–Z)</option>
              <option value="status">Status</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            {hasActiveFilters ? (
              <button
                type="button"
                onClick={handleClearFilters}
                className="text-xs text-pulse-muted hover:text-rose-600 transition underline underline-offset-2"
              >
                Clear filters
              </button>
            ) : null}
            <Button type="submit">Apply filters</Button>
          </div>
        </div>
      </form>

      {/* Loading / Error States */}
      {companies.isLoading ? <LoadingState label="Loading company directory" /> : null}

      {companies.error ? (
        <ErrorState
          title="Companies could not be loaded"
          body={companies.error instanceof ApiError ? companies.error.message : "The platform API returned an error."}
          action={
            <Button type="button" variant="secondary" onClick={() => companies.refetch()}>
              Try again
            </Button>
          }
        />
      ) : null}

      {/* Data Table */}
      {companies.data && companies.data.count === 0 ? (
        <EmptyState
          title="No companies found"
          body="No tenant companies match the selected search criteria or filter combinations."
          action={
            hasActiveFilters ? (
              <Button type="button" variant="secondary" onClick={handleClearFilters}>
                Clear filters
              </Button>
            ) : null
          }
        />
      ) : null}

      {companies.data && companies.data.results.length > 0 ? (
        <div className="space-y-4">
          <DataTable
            columns={[
              "Company",
              "Legal Name",
              "Status",
              "Subscription",
              "Modules",
              "Members",
              "Created",
              "Actions",
            ]}
          >
            {companies.data.results.map((comp) => (
              <tr key={comp.id} className="hover:bg-pulse-hover/50 transition">
                <td className="px-4 py-3">
                  <Link
                    to={`/platform/companies/${comp.id}`}
                    className="font-semibold text-teal-700 dark:text-teal-400 hover:underline"
                  >
                    {comp.display_name}
                  </Link>
                  <div className="flex items-center gap-1.5 text-[11px] text-pulse-muted mt-0.5">
                    <span>{comp.slug}</span>
                    {comp.country_code ? (
                      <span className="rounded bg-slate-100 dark:bg-slate-800 px-1 text-[10px]">
                        {comp.country_code}
                      </span>
                    ) : null}
                  </div>
                </td>

                <td className="px-4 py-3 text-xs text-pulse-muted max-w-[160px] truncate">
                  {comp.legal_name || "—"}
                </td>

                <td className="px-4 py-3">
                  <StatusBadge status={comp.status} />
                </td>

                <td className="px-4 py-3 text-xs">
                  {comp.subscription ? (
                    <div>
                      <p className="font-medium text-pulse-ink">{comp.subscription.plan_name}</p>
                      <p className="text-[11px] text-pulse-muted capitalize">
                        {comp.subscription.status} · {comp.subscription.billing_interval}
                      </p>
                    </div>
                  ) : (
                    <span className="text-pulse-muted">No plan</span>
                  )}
                </td>

                <td className="px-4 py-3 text-xs font-semibold text-pulse-ink">
                  {comp.installed_modules_count ?? 0}
                </td>

                <td className="px-4 py-3 text-xs font-semibold text-pulse-ink">
                  {comp.membership_count}
                </td>

                <td className="px-4 py-3 text-xs text-pulse-muted">
                  {new Date(comp.created_at).toLocaleDateString([], {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </td>

                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5 text-xs">
                    <Link
                      to={`/platform/companies/${comp.id}`}
                      className="rounded border border-pulse-border bg-pulse-surface px-2 py-1 text-[11px] font-medium text-pulse-ink hover:bg-pulse-hover"
                    >
                      Inspect
                    </Link>

                    {comp.status === "draft" ? (
                      <button
                        type="button"
                        onClick={() => activateMutation.mutate(comp.id)}
                        className="rounded bg-teal-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-teal-500"
                      >
                        Activate
                      </button>
                    ) : null}

                    {comp.status === "active" ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSuspendCompanyTarget(comp);
                          setSuspendReason("");
                          setSuspendError("");
                        }}
                        className="rounded border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 px-2 py-1 text-[11px] font-medium text-rose-700 dark:text-rose-300 hover:bg-rose-100"
                      >
                        Suspend
                      </button>
                    ) : null}

                    {comp.status === "suspended" ? (
                      <button
                        type="button"
                        onClick={() => setReactivateTarget(comp)}
                        className="rounded border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-950/40 px-2 py-1 text-[11px] font-medium text-teal-700 dark:text-teal-300 hover:bg-teal-100"
                      >
                        Reactivate
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </DataTable>

          <Pagination
            page={companies.data.page}
            pageCount={companies.data.page_count}
            onPageChange={setPage}
          />
        </div>
      ) : null}

      {/* SUSPEND MODAL WITH MANDATORY REASON */}
      <Modal
        open={Boolean(suspendCompanyTarget)}
        onClose={() => setSuspendCompanyTarget(null)}
        title={`Suspend Company: ${suspendCompanyTarget?.display_name}`}
        description="Suspension immediately blocks workspace access for all company users. Company data and billing history are preserved."
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (suspendCompanyTarget) {
              suspendMutation.mutate({
                companyId: suspendCompanyTarget.id,
                reason: suspendReason,
              });
            }
          }}
        >
          {suspendError ? (
            <div className="rounded bg-rose-50 p-2.5 text-xs text-rose-700 border border-rose-200">
              {suspendError}
            </div>
          ) : null}

          <div className="rounded-md bg-amber-50 dark:bg-amber-950/40 p-3 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200">
            <p className="font-semibold">Consequences of suspension:</p>
            <ul className="list-disc list-inside mt-1 space-y-0.5">
              <li>All members attempting to access the workspace will receive a 403 Access Denied.</li>
              <li>No tenant records or configurations will be deleted.</li>
              <li>An immutable audit log of this action and the reason will be stored.</li>
            </ul>
          </div>

          <div>
            <label className="block text-xs font-medium text-pulse-ink mb-1">
              Suspension Reason <span className="text-rose-500">*</span>
            </label>
            <textarea
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              placeholder="Provide a clear operational or compliance reason (minimum 10 characters)..."
              rows={3}
              className="w-full rounded-md border border-pulse-border bg-pulse-surface p-2 text-xs text-pulse-ink focus:border-teal-500 focus:outline-hidden"
              required
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-pulse-border/60">
            <Button type="button" variant="secondary" onClick={() => setSuspendCompanyTarget(null)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={suspendMutation.isPending || suspendReason.trim().length < 10}
              className="bg-rose-600 hover:bg-rose-500 text-white"
            >
              {suspendMutation.isPending ? "Suspending..." : "Confirm suspension"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* REACTIVATE CONFIRMATION */}
      <Modal
        open={Boolean(reactivateTarget)}
        onClose={() => setReactivateTarget(null)}
        title={`Reactivate Company: ${reactivateTarget?.display_name ?? ""}`}
        description="Reactivating this company will restore workspace access according to their current subscription status. All company data remains intact."
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setReactivateTarget(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={reactivateMutation.isPending}
              onClick={() => {
                if (reactivateTarget) reactivateMutation.mutate(reactivateTarget.id);
              }}
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
        open={Boolean(closeTarget)}
        onClose={() => setCloseTarget(null)}
        title={`Close Company: ${closeTarget?.display_name ?? ""}`}
        description="Closing this company marks the tenant as permanently closed. Existing records and billing history are preserved for retention rules."
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setCloseTarget(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={closeMutation.isPending}
              onClick={() => {
                if (closeTarget) closeMutation.mutate(closeTarget.id);
              }}
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
    </section>
  );
}
