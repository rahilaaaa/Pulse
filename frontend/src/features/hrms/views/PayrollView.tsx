import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, ApiError } from "../../../shared/api/client";
import { Button } from "../../../shared/ui/Button";
import type {
  CompensationRow,
  Employment,
  PayrollLineRow,
  PayrollPeriodRow,
  PayrollRunRow,
  PayslipRow,
  SalaryComponentRow,
  SalaryStructureRow,
} from "../types";

const panelClass = "rounded-lg border border-pulse-border bg-pulse-surface p-4 shadow-sm";
const labelClass = "text-xs font-semibold uppercase tracking-wider text-pulse-muted";

function errorText(error: unknown) {
  return error instanceof ApiError ? error.message : "The request could not be completed.";
}

interface PayrollViewProps {
  companyId: string;
  permissions: string[];
  employments: Employment[];
}

export function PayrollView({ companyId, permissions, employments }: PayrollViewProps) {
  const queryClient = useQueryClient();
  const can = (code: string) => permissions.includes(code);
  const root = `/api/v1/companies/${companyId}/hrms`;

  // Permissions
  const canManageComp = can("hrms.compensation.manage");
  const canViewAdminPayroll = can("hrms.payroll.view") || can("hrms.admin.view");
  const canCalculate = can("hrms.payroll.calculate");
  const canApprove = can("hrms.payroll.approve");
  const canFinalize = can("hrms.payroll.finalize");
  const canViewOwnPayslips = can("hrms.payroll.payslip.own") || true;
  const canViewOwnComp = can("hrms.compensation.own.view") || true;

  type PayrollTab = "payslips" | "runs" | "structures" | "components";
  const [activeTab, setActiveTab] = useState<PayrollTab>(canViewAdminPayroll ? "runs" : "payslips");

  // Selection states
  const [selectedRunId, setSelectedRunId] = useState("");
  const [selectedPayslip, setSelectedPayslip] = useState<PayslipRow | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Modals
  const [showCreatePeriodModal, setShowCreatePeriodModal] = useState(false);
  const [periodName, setPeriodName] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");

  const [showCreateRunModal, setShowCreateRunModal] = useState(false);
  const [selectedPeriodId, setSelectedPeriodId] = useState("");

  const [showAssignCompModal, setShowAssignCompModal] = useState(false);
  const [assignEmpId, setAssignEmpId] = useState("");
  const [assignStructId, setAssignStructId] = useState("");
  const [assignBaseSalary, setAssignBaseSalary] = useState("50000");
  const [assignCurrency, setAssignCurrency] = useState("INR");

  // Queries
  const myPayslips = useQuery({
    queryKey: ["hrms-my-payslips", companyId],
    queryFn: () => api<{ results: PayslipRow[] }>(`${root}/me/payslips/`),
    enabled: canViewOwnPayslips,
  });

  const myCompensation = useQuery({
    queryKey: ["hrms-my-compensation", companyId],
    queryFn: () => api<{ results: CompensationRow[] }>(`${root}/me/compensation/`),
    enabled: canViewOwnComp,
  });

  const periods = useQuery({
    queryKey: ["hrms-payroll-periods", companyId],
    queryFn: () => api<{ results: PayrollPeriodRow[] }>(`${root}/payroll-periods/`),
    enabled: canViewAdminPayroll,
  });

  const runs = useQuery({
    queryKey: ["hrms-payroll-runs", companyId],
    queryFn: () => api<{ results: PayrollRunRow[] }>(`${root}/payroll-runs/`),
    enabled: canViewAdminPayroll,
  });

  const runLines = useQuery({
    queryKey: ["hrms-payroll-run-lines", companyId, selectedRunId],
    queryFn: () => api<{ results: PayrollLineRow[] }>(`${root}/payroll-runs/${selectedRunId}/`),
    enabled: Boolean(selectedRunId && canViewAdminPayroll),
  });

  const structures = useQuery({
    queryKey: ["hrms-salary-structures", companyId],
    queryFn: () => api<{ results: SalaryStructureRow[] }>(`${root}/salary-structures/`),
    enabled: canViewAdminPayroll || canManageComp,
  });

  const components = useQuery({
    queryKey: ["hrms-salary-components", companyId],
    queryFn: () => api<{ results: SalaryComponentRow[] }>(`${root}/salary-components/`),
    enabled: canViewAdminPayroll || canManageComp,
  });

  // Mutations
  const createPeriod = useMutation({
    mutationFn: () =>
      api(`${root}/payroll-periods/`, {
        method: "POST",
        body: JSON.stringify({ name: periodName, starts_on: periodStart, ends_on: periodEnd }),
      }),
    onSuccess: async () => {
      setFeedback("Payroll period created.");
      setShowCreatePeriodModal(false);
      setPeriodName("");
      setPeriodStart("");
      setPeriodEnd("");
      await queryClient.invalidateQueries({ queryKey: ["hrms-payroll-periods", companyId] });
    },
    onError: (err) => setFeedback(errorText(err)),
  });

  const createRun = useMutation({
    mutationFn: () =>
      api(`${root}/payroll-runs/`, {
        method: "POST",
        body: JSON.stringify({ period_id: selectedPeriodId }),
      }),
    onSuccess: async () => {
      setFeedback("Payroll run initiated.");
      setShowCreateRunModal(false);
      await queryClient.invalidateQueries({ queryKey: ["hrms-payroll-runs", companyId] });
      await queryClient.invalidateQueries({ queryKey: ["hrms-dashboard", companyId] });
    },
    onError: (err) => setFeedback(errorText(err)),
  });

  const runAction = useMutation({
    mutationFn: ({ runId, action }: { runId: string; action: "calculate" | "approve" | "finalize" }) =>
      api(`${root}/payroll-runs/${runId}/actions/${action}/`, {
        method: "POST",
      }),
    onSuccess: async (_, { action }) => {
      setFeedback(`Payroll run successfully marked as ${action}d.`);
      await queryClient.invalidateQueries({ queryKey: ["hrms-payroll-runs", companyId] });
      await queryClient.invalidateQueries({ queryKey: ["hrms-payroll-run-lines", companyId, selectedRunId] });
      await queryClient.invalidateQueries({ queryKey: ["hrms-dashboard", companyId] });
    },
    onError: (err) => setFeedback(errorText(err)),
  });

  const assignCompensation = useMutation({
    mutationFn: () =>
      api(`${root}/compensation-assignments/`, {
        method: "POST",
        body: JSON.stringify({
          employment_id: assignEmpId,
          salary_structure_id: assignStructId,
          monthly_base_salary: assignBaseSalary,
          currency: assignCurrency,
          effective_from: new Date().toISOString().slice(0, 10),
        }),
      }),
    onSuccess: async () => {
      setFeedback("Compensation assigned successfully.");
      setShowAssignCompModal(false);
      await queryClient.invalidateQueries({ queryKey: ["hrms-my-compensation", companyId] });
    },
    onError: (err) => setFeedback(errorText(err)),
  });

  const payslipRows = myPayslips.data?.results ?? [];
  const compRows = myCompensation.data?.results ?? [];
  const runRows = runs.data?.results ?? [];
  const lineRows = runLines.data?.results ?? [];

  return (
    <div className="space-y-4">
      {/* Feedback banner */}
      {feedback && (
        <div className="flex items-center justify-between rounded-lg border border-teal-200 bg-teal-50 p-3 text-xs text-teal-800 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-200">
          <span>{feedback}</span>
          <button type="button" onClick={() => setFeedback(null)} className="font-semibold underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Main Payroll Header */}
      <section className={panelClass}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-pulse-ink">Payroll Operations & Payslips</h2>
            <p className="text-xs text-pulse-muted">
              Compensation, salary disbursements, and personal pay statements.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {canViewAdminPayroll && (
              <>
                <Button variant="secondary" size="sm" onClick={() => setShowCreatePeriodModal(true)}>
                  + New Period
                </Button>
                <Button size="sm" onClick={() => setShowCreateRunModal(true)}>
                  + Run Payroll
                </Button>
              </>
            )}
            {canManageComp && (
              <Button variant="secondary" size="sm" onClick={() => setShowAssignCompModal(true)}>
                Assign Comp
              </Button>
            )}
          </div>
        </div>

        {/* Sub-Tabs Bar */}
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-pulse-border pt-3 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab("payslips")}
            className={`rounded-md px-3 py-1.5 font-semibold transition ${
              activeTab === "payslips"
                ? "bg-pulse-accent text-white shadow-sm"
                : "bg-pulse-hover text-pulse-muted hover:text-pulse-ink"
            }`}
          >
            My Payslips & Compensation
          </button>

          {canViewAdminPayroll && (
            <button
              type="button"
              onClick={() => setActiveTab("runs")}
              className={`rounded-md px-3 py-1.5 font-semibold transition ${
                activeTab === "runs"
                  ? "bg-pulse-accent text-white shadow-sm"
                  : "bg-pulse-hover text-pulse-muted hover:text-pulse-ink"
              }`}
            >
              Payroll Runs & Periods
            </button>
          )}

          {(canViewAdminPayroll || canManageComp) && (
            <>
              <button
                type="button"
                onClick={() => setActiveTab("structures")}
                className={`rounded-md px-3 py-1.5 font-semibold transition ${
                  activeTab === "structures"
                    ? "bg-pulse-accent text-white shadow-sm"
                    : "bg-pulse-hover text-pulse-muted hover:text-pulse-ink"
                }`}
              >
                Salary Structures
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("components")}
                className={`rounded-md px-3 py-1.5 font-semibold transition ${
                  activeTab === "components"
                    ? "bg-pulse-accent text-white shadow-sm"
                    : "bg-pulse-hover text-pulse-muted hover:text-pulse-ink"
                }`}
              >
                Salary Components
              </button>
            </>
          )}
        </div>
      </section>

      {/* SUB-TAB 1: My Payslips & Compensation */}
      {activeTab === "payslips" && (
        <div className="space-y-4">
          {/* Active Compensation Card */}
          {compRows.length > 0 && (
            <div className={panelClass}>
              <span className={labelClass}>Active Compensation Structure</span>
              <div className="mt-2 grid gap-3 sm:grid-cols-3 text-xs">
                <div>
                  <span className="text-pulse-muted">Structure:</span>
                  <p className="font-bold text-pulse-ink text-sm">{compRows[0].structure_name}</p>
                </div>
                <div>
                  <span className="text-pulse-muted">Monthly Base Salary:</span>
                  <p className="font-bold text-pulse-ink text-sm font-mono">
                    {compRows[0].currency} {Number(compRows[0].monthly_base_salary).toLocaleString()}
                  </p>
                </div>
                <div>
                  <span className="text-pulse-muted">Effective From:</span>
                  <p className="font-medium text-pulse-ink">{compRows[0].effective_from}</p>
                </div>
              </div>
            </div>
          )}

          {/* Payslips Table */}
          <section className={`${panelClass} overflow-hidden p-0`}>
            <div className="p-4 border-b border-pulse-border">
              <h3 className="text-base font-bold text-pulse-ink">Issued Payslips</h3>
            </div>
            {payslipRows.length === 0 ? (
              <div className="p-8 text-center text-xs text-pulse-muted">
                No finalized payslips available yet for this account.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-pulse-border bg-pulse-hover/50 text-pulse-muted">
                      <th className="px-4 py-3 font-semibold">Pay Period</th>
                      <th className="px-4 py-3 font-semibold">Issued Date</th>
                      <th className="px-4 py-3 font-semibold">Gross Salary</th>
                      <th className="px-4 py-3 font-semibold">Net Disbursed</th>
                      <th className="px-4 py-3 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-pulse-border">
                    {payslipRows.map((ps) => (
                      <tr key={ps.id} className="hover:bg-pulse-hover/60">
                        <td className="px-4 py-3 font-medium text-pulse-ink">{ps.period}</td>
                        <td className="px-4 py-3 text-pulse-muted font-mono">{ps.issued_at?.slice(0, 10)}</td>
                        <td className="px-4 py-3 font-mono font-medium text-pulse-ink">
                          {ps.currency || "INR"} {Number(ps.gross_salary || 0).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 font-mono font-bold text-emerald-600">
                          {ps.currency || "INR"} {Number(ps.net_salary || 0).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button size="sm" variant="secondary" onClick={() => setSelectedPayslip(ps)}>
                            View Breakdown
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {/* SUB-TAB 2: Payroll Runs & Operations */}
      {activeTab === "runs" && (
        <div className="space-y-4">
          <section className={`${panelClass} overflow-hidden p-0`}>
            <div className="p-4 border-b border-pulse-border">
              <h3 className="text-base font-bold text-pulse-ink">Payroll Runs Pipeline</h3>
            </div>
            {runRows.length === 0 ? (
              <div className="p-8 text-center text-xs text-pulse-muted">
                No payroll runs created yet. Click "+ Run Payroll" above to initiate a cycle.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-pulse-border bg-pulse-hover/50 text-pulse-muted">
                      <th className="px-4 py-3 font-semibold">Period</th>
                      <th className="px-4 py-3 font-semibold">Lines</th>
                      <th className="px-4 py-3 font-semibold">Total Gross</th>
                      <th className="px-4 py-3 font-semibold">Total Net</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-pulse-border">
                    {runRows.map((r) => (
                      <tr
                        key={r.id}
                        className={`hover:bg-pulse-hover/60 cursor-pointer ${
                          selectedRunId === r.id ? "bg-pulse-accent/10" : ""
                        }`}
                        onClick={() => setSelectedRunId(r.id)}
                      >
                        <td className="px-4 py-3 font-semibold text-pulse-ink">{r.period_name}</td>
                        <td className="px-4 py-3 text-pulse-muted">{r.line_count} employees</td>
                        <td className="px-4 py-3 font-mono font-medium text-pulse-ink">
                          {r.currency} {Number(r.total_gross || 0).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 font-mono font-bold text-emerald-600">
                          {r.currency} {Number(r.total_net || 0).toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              r.status === "finalized"
                                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                                : r.status === "approved"
                                ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                                : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                            }`}
                          >
                            {r.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                            {r.status === "draft" && canCalculate && (
                              <Button
                                size="sm"
                                disabled={runAction.isPending}
                                onClick={() => runAction.mutate({ runId: r.id, action: "calculate" })}
                              >
                                Calculate
                              </Button>
                            )}
                            {r.status === "calculated" && canApprove && (
                              <Button
                                size="sm"
                                disabled={runAction.isPending}
                                onClick={() => runAction.mutate({ runId: r.id, action: "approve" })}
                              >
                                Approve
                              </Button>
                            )}
                            {r.status === "approved" && canFinalize && (
                              <Button
                                size="sm"
                                disabled={runAction.isPending}
                                onClick={() => runAction.mutate({ runId: r.id, action: "finalize" })}
                              >
                                Finalize
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Selected Run Details */}
          {selectedRunId && (
            <section className={`${panelClass} overflow-hidden p-0`}>
              <div className="p-4 border-b border-pulse-border flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-pulse-ink">Run Employee Lines Breakdown</h4>
                  <p className="text-xs text-pulse-muted">Individual calculation outputs per employee.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedRunId("")}
                  className="text-xs font-semibold text-pulse-muted hover:text-pulse-ink"
                >
                  Close
                </button>
              </div>

              {lineRows.length === 0 ? (
                <div className="p-6 text-center text-xs text-pulse-muted">
                  No employee lines generated yet. Click "Calculate" to execute salary rules.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-pulse-border bg-pulse-hover/50 text-pulse-muted">
                        <th className="px-4 py-2.5 font-semibold">Employee</th>
                        <th className="px-4 py-2.5 font-semibold">Base Salary</th>
                        <th className="px-4 py-2.5 font-semibold">Gross Pay</th>
                        <th className="px-4 py-2.5 font-semibold">Total Deductions</th>
                        <th className="px-4 py-2.5 font-semibold">Net Pay</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-pulse-border">
                      {lineRows.map((line) => (
                        <tr key={line.id} className="hover:bg-pulse-hover/60">
                          <td className="px-4 py-2.5 font-semibold text-pulse-ink">{line.employee_name}</td>
                          <td className="px-4 py-2.5 font-mono text-pulse-muted">
                            {line.currency} {Number(line.base_salary || 0).toLocaleString()}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-pulse-ink">
                            {line.currency} {Number(line.gross_pay || 0).toLocaleString()}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-rose-600">
                            - {line.currency} {Number(line.total_deductions || 0).toLocaleString()}
                          </td>
                          <td className="px-4 py-2.5 font-mono font-bold text-emerald-600">
                            {line.currency} {Number(line.net_pay || 0).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {/* SUB-TAB 3: Salary Structures */}
      {activeTab === "structures" && (
        <section className={panelClass}>
          <h3 className="text-base font-bold text-pulse-ink mb-3">Salary Structures</h3>
          {(structures.data?.results ?? []).length === 0 ? (
            <div className="py-8 text-center text-xs text-pulse-muted">
              No salary structures created yet.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(structures.data?.results ?? []).map((s) => (
                <div key={s.id} className="rounded-lg border border-pulse-border p-3.5 space-y-1.5 text-xs bg-pulse-hover/20">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-pulse-ink text-sm">{s.name}</span>
                    <span className="font-mono text-[10px] text-pulse-muted">{s.code}</span>
                  </div>
                  <p className="text-pulse-muted">Currency: <strong className="text-pulse-ink">{s.currency}</strong></p>
                  <p className="text-pulse-muted">
                    Status: <span className="text-emerald-600 font-semibold">{s.is_active ? "Active" : "Inactive"}</span>
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* SUB-TAB 4: Salary Components */}
      {activeTab === "components" && (
        <section className={panelClass}>
          <h3 className="text-base font-bold text-pulse-ink mb-3">Salary Components (Earnings & Deductions)</h3>
          {(components.data?.results ?? []).length === 0 ? (
            <div className="py-8 text-center text-xs text-pulse-muted">
              No salary components configured.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(components.data?.results ?? []).map((c) => (
                <div key={c.id} className="rounded-lg border border-pulse-border p-3.5 space-y-1.5 text-xs bg-pulse-hover/20">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-pulse-ink text-sm">{c.name}</span>
                    <span
                      className={`rounded px-1.5 py-0.2 font-bold text-[10px] ${
                        c.component_type === "earning"
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                          : "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                      }`}
                    >
                      {c.component_type}
                    </span>
                  </div>
                  <p className="text-pulse-muted font-mono text-[11px]">{c.code}</p>
                  <p className="text-pulse-muted">
                    Statutory: {c.is_statutory ? "Yes" : "No"} · Taxable: {c.is_taxable ? "Yes" : "No"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Payslip Breakdown Modal */}
      {selectedPayslip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg border border-pulse-border bg-pulse-surface p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-pulse-border pb-3">
              <div>
                <h3 className="text-base font-bold text-pulse-ink">Payslip Breakdown</h3>
                <p className="text-xs text-pulse-muted">{selectedPayslip.period}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPayslip(null)}
                className="text-pulse-muted hover:text-pulse-ink text-lg font-bold"
              >
                &times;
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between rounded-md bg-pulse-hover p-3">
                <span className="font-semibold text-pulse-ink">Net Disbursed Pay:</span>
                <span className="font-mono text-base font-bold text-emerald-600">
                  {selectedPayslip.currency || "INR"} {Number(selectedPayslip.net_salary || 0).toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-between p-2">
                <span className="text-pulse-muted">Gross Earnings:</span>
                <span className="font-mono font-medium text-pulse-ink">
                  {selectedPayslip.currency || "INR"} {Number(selectedPayslip.gross_salary || 0).toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-between p-2">
                <span className="text-pulse-muted">Issued Date:</span>
                <span className="font-mono text-pulse-ink">{selectedPayslip.issued_at?.slice(0, 10)}</span>
              </div>
            </div>

            <div className="pt-2 border-t border-pulse-border flex justify-end">
              <Button variant="secondary" onClick={() => setSelectedPayslip(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Create Period Modal */}
      {showCreatePeriodModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg border border-pulse-border bg-pulse-surface p-5 shadow-xl space-y-3">
            <h3 className="text-base font-bold text-pulse-ink">Create Payroll Period</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createPeriod.mutate();
              }}
              className="space-y-3 text-xs"
            >
              <label className="block">
                <span className="font-semibold text-pulse-ink">Period Name *</span>
                <input
                  type="text"
                  required
                  placeholder="e.g. November 2026"
                  value={periodName}
                  onChange={(e) => setPeriodName(e.target.value)}
                  className="mt-1 block w-full rounded border border-pulse-border bg-pulse-surface px-2.5 py-1.5 text-xs text-pulse-ink"
                />
              </label>
              <label className="block">
                <span className="font-semibold text-pulse-ink">Start Date *</span>
                <input
                  type="date"
                  required
                  value={periodStart}
                  onChange={(e) => setPeriodStart(e.target.value)}
                  className="mt-1 block w-full rounded border border-pulse-border bg-pulse-surface px-2.5 py-1.5 text-xs text-pulse-ink"
                />
              </label>
              <label className="block">
                <span className="font-semibold text-pulse-ink">End Date *</span>
                <input
                  type="date"
                  required
                  value={periodEnd}
                  onChange={(e) => setPeriodEnd(e.target.value)}
                  className="mt-1 block w-full rounded border border-pulse-border bg-pulse-surface px-2.5 py-1.5 text-xs text-pulse-ink"
                />
              </label>
              <div className="flex justify-end gap-2 pt-2 border-t border-pulse-border">
                <Button variant="secondary" type="button" onClick={() => setShowCreatePeriodModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createPeriod.isPending}>
                  Create Period
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Run Modal */}
      {showCreateRunModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg border border-pulse-border bg-pulse-surface p-5 shadow-xl space-y-3">
            <h3 className="text-base font-bold text-pulse-ink">Initiate Payroll Run</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createRun.mutate();
              }}
              className="space-y-3 text-xs"
            >
              <label className="block">
                <span className="font-semibold text-pulse-ink">Select Period *</span>
                <select
                  required
                  value={selectedPeriodId}
                  onChange={(e) => setSelectedPeriodId(e.target.value)}
                  className="mt-1 block w-full rounded border border-pulse-border bg-pulse-surface px-2.5 py-1.5 text-xs text-pulse-ink"
                >
                  <option value="">Choose period...</option>
                  {(periods.data?.results ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.starts_on} to {p.ends_on})
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex justify-end gap-2 pt-2 border-t border-pulse-border">
                <Button variant="secondary" type="button" onClick={() => setShowCreateRunModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createRun.isPending}>
                  Start Run
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Compensation Modal */}
      {showAssignCompModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg border border-pulse-border bg-pulse-surface p-5 shadow-xl space-y-3">
            <h3 className="text-base font-bold text-pulse-ink">Assign Employee Compensation</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                assignCompensation.mutate();
              }}
              className="space-y-3 text-xs"
            >
              <label className="block">
                <span className="font-semibold text-pulse-ink">Employee *</span>
                <select
                  required
                  value={assignEmpId}
                  onChange={(e) => setAssignEmpId(e.target.value)}
                  className="mt-1 block w-full rounded border border-pulse-border bg-pulse-surface px-2.5 py-1.5 text-xs text-pulse-ink"
                >
                  <option value="">Choose employee...</option>
                  {employments.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.person_name} ({emp.job_title})
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="font-semibold text-pulse-ink">Salary Structure *</span>
                <select
                  required
                  value={assignStructId}
                  onChange={(e) => setAssignStructId(e.target.value)}
                  className="mt-1 block w-full rounded border border-pulse-border bg-pulse-surface px-2.5 py-1.5 text-xs text-pulse-ink"
                >
                  <option value="">Choose structure...</option>
                  {(structures.data?.results ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.currency})
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="font-semibold text-pulse-ink">Monthly Base Salary *</span>
                  <input
                    type="number"
                    required
                    value={assignBaseSalary}
                    onChange={(e) => setAssignBaseSalary(e.target.value)}
                    className="mt-1 block w-full rounded border border-pulse-border bg-pulse-surface px-2.5 py-1.5 text-xs text-pulse-ink font-mono"
                  />
                </label>
                <label className="block">
                  <span className="font-semibold text-pulse-ink">Currency</span>
                  <select
                    value={assignCurrency}
                    onChange={(e) => setAssignCurrency(e.target.value)}
                    className="mt-1 block w-full rounded border border-pulse-border bg-pulse-surface px-2.5 py-1.5 text-xs text-pulse-ink font-mono"
                  >
                    <option value="INR">INR</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                  </select>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-pulse-border">
                <Button variant="secondary" type="button" onClick={() => setShowAssignCompModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={assignCompensation.isPending}>
                  Assign Compensation
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
