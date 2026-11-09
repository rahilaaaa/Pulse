import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, ApiError } from "../../shared/api/client";
import { Button } from "../../shared/ui/Button";
import { EmptyState, ErrorState, LoadingState } from "../../shared/ui/States";
import type {
  CompensationRow,
  Employment,
  PayrollLineRow,
  PayrollPeriodRow,
  PayrollRunRow,
  SalaryComponentRow,
  SalaryStructureRow,
} from "./types";

const panelClass = "rounded-lg border border-pulse-border bg-pulse-surface p-4";
const labelClass = "text-xs font-medium uppercase tracking-wide text-pulse-muted";

function errorText(error: unknown) {
  return error instanceof ApiError ? error.message : "The request could not be completed.";
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

type Props = {
  companyId: string;
  permissions: string[];
  employments: Employment[];
};

type PayrollSubTab = "runs" | "run_details" | "compensation" | "structures";

export function PayrollWorkspace({ companyId, permissions, employments }: Props) {
  const queryClient = useQueryClient();
  const [subTab, setSubTab] = useState<PayrollSubTab>("runs");
  const [feedback, setFeedback] = useState<string | null>(null);

  // Selected Run
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedLine, setSelectedLine] = useState<PayrollLineRow | null>(null);

  // Create Run Modal
  const [showCreateRunModal, setShowCreateRunModal] = useState(false);
  const [runPeriodId, setRunPeriodId] = useState("");
  const [runNotes, setRunNotes] = useState("");

  // Assign Compensation Modal
  const [showCompModal, setShowCompModal] = useState(false);
  const [compEmpId, setCompEmpId] = useState("");
  const [compStructureId, setCompStructureId] = useState("");
  const [compBaseSalary, setCompBaseSalary] = useState("50000");
  const [compEffectiveFrom, setCompEffectiveFrom] = useState(todayIso());

  // Setup Modals
  const [showStructureModal, setShowStructureModal] = useState(false);
  const [structName, setStructName] = useState("");
  const [structCode, setStructCode] = useState("");
  const [structCurrency, setStructCurrency] = useState("INR");

  const [showComponentModal, setShowComponentModal] = useState(false);
  const [compName, setCompName] = useState("");
  const [compCode, setCompCode] = useState("");
  const [compType, setCompType] = useState<"earning" | "deduction">("earning");
  const [compStatutory, setCompStatutory] = useState(false);

  const [showPeriodModal, setShowPeriodModal] = useState(false);
  const [periodName, setPeriodName] = useState("");
  const [periodStart, setPeriodStart] = useState(todayIso());
  const [periodEnd, setPeriodEnd] = useState(todayIso());

  const can = (code: string) => permissions.includes(code);
  const root = `/api/v1/companies/${companyId}/hrms`;

  // Queries
  const periods = useQuery({
    queryKey: ["hrms-payroll-periods", companyId],
    queryFn: () => api<{ results: PayrollPeriodRow[] }>(`${root}/payroll-periods/`),
    enabled: can("hrms.payroll.view"),
  });

  const runs = useQuery({
    queryKey: ["hrms-payroll-runs", companyId],
    queryFn: () => api<{ results: PayrollRunRow[] }>(`${root}/payroll-runs/`),
    enabled: can("hrms.payroll.view"),
  });

  const selectedRunDetail = useQuery({
    queryKey: ["hrms-payroll-run-detail", companyId, selectedRunId],
    queryFn: () =>
      api<{
        run: PayrollRunRow;
        lines: PayrollLineRow[];
      }>(`${root}/payroll-runs/${selectedRunId}/`),
    enabled: Boolean(selectedRunId && can("hrms.payroll.view")),
  });

  const structures = useQuery({
    queryKey: ["hrms-salary-structures", companyId],
    queryFn: () => api<{ results: SalaryStructureRow[] }>(`${root}/salary-structures/`),
    enabled: can("hrms.compensation.view") || can("hrms.payroll.view"),
  });

  const components = useQuery({
    queryKey: ["hrms-salary-components", companyId],
    queryFn: () => api<{ results: SalaryComponentRow[] }>(`${root}/salary-components/`),
    enabled: can("hrms.compensation.view") || can("hrms.payroll.view"),
  });

  const assignments = useQuery({
    queryKey: ["hrms-compensation-assignments", companyId],
    queryFn: () => api<{ results: CompensationRow[] }>(`${root}/compensation-assignments/`),
    enabled: can("hrms.compensation.view"),
  });

  // Mutations
  const createRun = useMutation({
    mutationFn: (data: { period_id: string; notes: string }) =>
      api(`${root}/payroll-runs/`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: async (res: any) => {
      setFeedback("Payroll run created and calculated.");
      setShowCreateRunModal(false);
      setRunNotes("");
      if (res?.id) setSelectedRunId(res.id);
      await queryClient.invalidateQueries({ queryKey: ["hrms-payroll-runs", companyId] });
      setSubTab("run_details");
    },
    onError: (err) => setFeedback(errorText(err)),
  });

  const runAction = useMutation({
    mutationFn: ({ runId, action }: { runId: string; action: string }) =>
      api(`${root}/payroll-runs/${runId}/actions/${action}/`, {
        method: "POST",
      }),
    onSuccess: async (_, vars) => {
      setFeedback(`Payroll run action [${vars.action}] applied successfully.`);
      await queryClient.invalidateQueries({ queryKey: ["hrms-payroll-runs", companyId] });
      await queryClient.invalidateQueries({ queryKey: ["hrms-payroll-run-detail", companyId, selectedRunId] });
    },
    onError: (err) => setFeedback(errorText(err)),
  });

  const assignCompensation = useMutation({
    mutationFn: (data: {
      employment_id: string;
      salary_structure_id: string;
      monthly_base_salary: string;
      effective_from: string;
    }) =>
      api(`${root}/compensation-assignments/`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: async () => {
      setFeedback("Compensation assigned.");
      setShowCompModal(false);
      await queryClient.invalidateQueries({ queryKey: ["hrms-compensation-assignments", companyId] });
    },
    onError: (err) => setFeedback(errorText(err)),
  });

  const createStructure = useMutation({
    mutationFn: (data: { name: string; code: string; currency: string }) =>
      api(`${root}/salary-structures/`, {
        method: "POST",
        body: JSON.stringify({ ...data, is_active: true }),
      }),
    onSuccess: async () => {
      setFeedback("Salary structure created.");
      setShowStructureModal(false);
      setStructName("");
      setStructCode("");
      await queryClient.invalidateQueries({ queryKey: ["hrms-salary-structures", companyId] });
    },
    onError: (err) => setFeedback(errorText(err)),
  });

  const createComponent = useMutation({
    mutationFn: (data: { name: string; code: string; component_type: string; is_statutory: boolean }) =>
      api(`${root}/salary-components/`, {
        method: "POST",
        body: JSON.stringify({ ...data, is_active: true, is_taxable: true }),
      }),
    onSuccess: async () => {
      setFeedback("Salary component added.");
      setShowComponentModal(false);
      setCompName("");
      setCompCode("");
      await queryClient.invalidateQueries({ queryKey: ["hrms-salary-components", companyId] });
    },
    onError: (err) => setFeedback(errorText(err)),
  });

  const createPeriod = useMutation({
    mutationFn: (data: { name: string; starts_on: string; ends_on: string }) =>
      api(`${root}/payroll-periods/`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: async () => {
      setFeedback("Payroll period created.");
      setShowPeriodModal(false);
      setPeriodName("");
      await queryClient.invalidateQueries({ queryKey: ["hrms-payroll-periods", companyId] });
    },
    onError: (err) => setFeedback(errorText(err)),
  });

  const runRows = runs.data?.results ?? [];
  const currentRun = selectedRunDetail.data?.run;
  const currentLines = selectedRunDetail.data?.lines ?? [];

  return (
    <div className="space-y-4">
      {/* Sub-Navigation */}
      <nav className="flex flex-wrap gap-2 border-b border-pulse-border pb-2" aria-label="Payroll Navigation">
        {(
          [
            { id: "runs", label: `Payroll Runs (${runRows.length})` },
            { id: "run_details", label: "Run Calculations & Approval" },
            { id: "compensation", label: `Compensation Assignments (${assignments.data?.results.length ?? 0})` },
            { id: "structures", label: "Salary Structures & Setup" },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              subTab === item.id
                ? "bg-pulse-accent text-white"
                : "bg-pulse-surface text-pulse-muted hover:bg-pulse-hover hover:text-pulse-ink"
            }`}
            onClick={() => setSubTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {feedback ? (
        <div className="flex items-center justify-between rounded-md bg-pulse-hover px-4 py-2 text-sm text-pulse-ink" role="status">
          <span>{feedback}</span>
          <button type="button" className="text-xs font-semibold text-pulse-muted hover:text-pulse-ink" onClick={() => setFeedback(null)}>
            Dismiss
          </button>
        </div>
      ) : null}

      {/* Sub-View: Payroll Runs */}
      {subTab === "runs" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-pulse-ink">Payroll Runs</h2>
              <p className="mt-1 text-xs text-pulse-muted">
                Calculate and review gross pay, statutory deductions, net salaries, and maker-checker approvals.
              </p>
            </div>
            <Button onClick={() => setShowCreateRunModal(true)}>+ New Payroll Run</Button>
          </div>

          {/* New Run Modal */}
          {showCreateRunModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className="w-full max-w-md rounded-lg border border-pulse-border bg-pulse-surface p-6 shadow-xl">
                <h3 className="text-lg font-semibold text-pulse-ink">Create Payroll Run</h3>
                <p className="mt-1 text-xs text-pulse-muted">
                  Select a pay period to initialize attendance/compensation inputs and execute calculations.
                </p>
                <form
                  className="mt-4 space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    createRun.mutate({
                      period_id: runPeriodId,
                      notes: runNotes,
                    });
                  }}
                >
                  <label className="block text-sm font-medium text-pulse-ink">
                    Payroll Period
                    <select
                      required
                      className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                      value={runPeriodId}
                      onChange={(e) => setRunPeriodId(e.target.value)}
                    >
                      <option value="">Select Period</option>
                      {(periods.data?.results ?? []).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.starts_on} to {p.ends_on})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm font-medium text-pulse-ink">
                    Run Notes
                    <textarea
                      rows={2}
                      className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                      value={runNotes}
                      onChange={(e) => setRunNotes(e.target.value)}
                      placeholder="e.g. Regular monthly cycle"
                    />
                  </label>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="secondary" onClick={() => setShowCreateRunModal(false)}>
                      Cancel
                    </Button>
                    <Button disabled={createRun.isPending} type="submit">
                      Initialize & Calculate
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Runs Table */}
          <section className={panelClass}>
            {runs.isLoading ? (
              <LoadingState label="Loading payroll runs" />
            ) : runRows.length === 0 ? (
              <EmptyState title="No payroll runs initialized" body="Create a payroll run for a configured period." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[45rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-pulse-border text-pulse-muted">
                      <th className="py-2.5 pr-3 font-medium">Period</th>
                      <th className="py-2.5 pr-3 font-medium">Lines</th>
                      <th className="py-2.5 pr-3 font-medium">Total Gross</th>
                      <th className="py-2.5 pr-3 font-medium">Deductions</th>
                      <th className="py-2.5 pr-3 font-medium">Total Net</th>
                      <th className="py-2.5 pr-3 font-medium">Status</th>
                      <th className="py-2.5 font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runRows.map((r) => (
                      <tr key={r.id} className="border-b border-pulse-border/60">
                        <td className="py-2.5 pr-3 font-semibold text-pulse-ink">
                          {r.period_name}
                          <span className="block text-xs font-normal text-pulse-muted">
                            {r.period_starts_on} - {r.period_ends_on}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3 text-pulse-muted">{r.line_count}</td>
                        <td className="py-2.5 pr-3 font-medium text-pulse-ink">
                          {r.currency} {Number(r.total_gross || 0).toLocaleString()}
                        </td>
                        <td className="py-2.5 pr-3 text-pulse-muted">
                          {r.currency} {Number(r.total_deductions || 0).toLocaleString()}
                        </td>
                        <td className="py-2.5 pr-3 font-semibold text-pulse-accent">
                          {r.currency} {Number(r.total_net || 0).toLocaleString()}
                        </td>
                        <td className="py-2.5 pr-3">
                          <span
                            className={`rounded px-2 py-0.5 text-xs font-medium uppercase ${
                              r.status === "finalized"
                                ? "bg-green-100 text-green-800"
                                : r.status === "approved"
                                ? "bg-blue-100 text-blue-800"
                                : r.status === "calculated"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-pulse-hover text-pulse-ink"
                            }`}
                          >
                            {r.status}
                          </span>
                        </td>
                        <td className="py-2.5">
                          <Button
                            variant="secondary"
                            onClick={() => {
                              setSelectedRunId(r.id);
                              setSubTab("run_details");
                            }}
                          >
                            Review & Approvals &rarr;
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

      {/* Sub-View: Run Details & Maker-Checker Approvals */}
      {subTab === "run_details" && (
        <div className="space-y-4">
          {!selectedRunId ? (
            <EmptyState
              title="No Run Selected"
              body="Select a payroll run from the Runs list to view calculation snapshots and execute approvals."
            />
          ) : selectedRunDetail.isLoading ? (
            <LoadingState label="Loading run details" />
          ) : !currentRun ? (
            <ErrorState title="Run not found" body="Unable to locate the selected payroll run." />
          ) : (
            <>
              {/* Header & Maker-Checker Action Bar */}
              <section className={panelClass}>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-pulse-border pb-3">
                  <div>
                    <h2 className="text-lg font-semibold text-pulse-ink">
                      Payroll Run · {currentRun.period_name}
                    </h2>
                    <p className="mt-0.5 text-xs text-pulse-muted">
                      Dates: {currentRun.period_starts_on} to {currentRun.period_ends_on} · Calculation Engine v{currentRun.calculation_version}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded px-2.5 py-1 text-xs font-semibold uppercase ${
                        currentRun.status === "finalized"
                          ? "bg-green-100 text-green-800"
                          : currentRun.status === "approved"
                          ? "bg-blue-100 text-blue-800"
                          : currentRun.status === "calculated"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-pulse-hover text-pulse-ink"
                      }`}
                    >
                      Status: {currentRun.status}
                    </span>

                    {/* Maker action: recalculate */}
                    {currentRun.status === "draft" || currentRun.status === "calculated" ? (
                      <Button
                        variant="secondary"
                        disabled={runAction.isPending}
                        onClick={() => runAction.mutate({ runId: currentRun.id, action: "calculate" })}
                      >
                        Recalculate
                      </Button>
                    ) : null}

                    {/* Checker actions: approve / reject */}
                    {currentRun.status === "calculated" ? (
                      <>
                        <Button
                          disabled={runAction.isPending}
                          onClick={() => runAction.mutate({ runId: currentRun.id, action: "approve" })}
                        >
                          Approve (Checker)
                        </Button>
                        <Button
                          variant="danger"
                          disabled={runAction.isPending}
                          onClick={() => runAction.mutate({ runId: currentRun.id, action: "reject" })}
                        >
                          Reject
                        </Button>
                      </>
                    ) : null}

                    {/* Finalize action: locks snapshots permanently */}
                    {currentRun.status === "approved" ? (
                      <Button
                        disabled={runAction.isPending}
                        onClick={() => runAction.mutate({ runId: currentRun.id, action: "finalize" })}
                      >
                        Finalize & Issue Payslips
                      </Button>
                    ) : null}

                    {/* Reversal action */}
                    {currentRun.status === "finalized" ? (
                      <Button
                        variant="danger"
                        disabled={runAction.isPending}
                        onClick={() => runAction.mutate({ runId: currentRun.id, action: "reverse" })}
                      >
                        Reverse Run
                      </Button>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-4 text-sm">
                  <div>
                    <span className={labelClass}>Total Gross</span>
                    <p className="mt-1 text-xl font-bold text-pulse-ink">
                      {currentRun.currency} {Number(currentRun.total_gross || 0).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <span className={labelClass}>Total Deductions</span>
                    <p className="mt-1 text-xl font-bold text-pulse-ink">
                      {currentRun.currency} {Number(currentRun.total_deductions || 0).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <span className={labelClass}>Net Payout</span>
                    <p className="mt-1 text-xl font-bold text-pulse-accent">
                      {currentRun.currency} {Number(currentRun.total_net || 0).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <span className={labelClass}>Line Count</span>
                    <p className="mt-1 text-xl font-bold text-pulse-ink">{currentRun.line_count}</p>
                  </div>
                </div>
              </section>

              {/* Line Items Table */}
              <section className={panelClass}>
                <h3 className="text-sm font-semibold text-pulse-ink">Employee Calculation Lines</h3>
                {currentLines.length === 0 ? (
                  <p className="mt-2 text-xs text-pulse-muted">No line items calculated for this run.</p>
                ) : (
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[45rem] text-left text-sm">
                      <thead>
                        <tr className="border-b border-pulse-border text-pulse-muted">
                          <th className="py-2.5 pr-3 font-medium">Employee</th>
                          <th className="py-2.5 pr-3 font-medium">Base Salary</th>
                          <th className="py-2.5 pr-3 font-medium">Gross Pay</th>
                          <th className="py-2.5 pr-3 font-medium">Deductions</th>
                          <th className="py-2.5 pr-3 font-medium">Net Pay</th>
                          <th className="py-2.5 pr-3 font-medium">Status</th>
                          <th className="py-2.5 font-medium">Breakdown</th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentLines.map((line) => (
                          <tr key={line.id} className="border-b border-pulse-border/60">
                            <td className="py-2.5 pr-3 font-semibold text-pulse-ink">{line.employee_name}</td>
                            <td className="py-2.5 pr-3 text-pulse-muted">
                              {line.currency} {Number(line.base_salary).toLocaleString()}
                            </td>
                            <td className="py-2.5 pr-3 font-medium text-pulse-ink">
                              {line.currency} {Number(line.gross_pay).toLocaleString()}
                            </td>
                            <td className="py-2.5 pr-3 text-pulse-muted">
                              {line.currency} {Number(line.total_deductions).toLocaleString()}
                            </td>
                            <td className="py-2.5 pr-3 font-semibold text-pulse-accent">
                              {line.currency} {Number(line.net_pay).toLocaleString()}
                            </td>
                            <td className="py-2.5 pr-3">
                              <span className="rounded bg-pulse-hover px-2 py-0.5 text-xs uppercase text-pulse-muted">
                                {line.status}
                              </span>
                            </td>
                            <td className="py-2.5">
                              <button
                                type="button"
                                className="text-xs font-semibold text-pulse-accent hover:underline"
                                onClick={() => setSelectedLine(line)}
                              >
                                View Snapshot &rarr;
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {/* Line Detail Modal */}
              {selectedLine && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                  <div className="w-full max-w-lg rounded-lg border border-pulse-border bg-pulse-surface p-6 shadow-xl">
                    <div className="flex items-center justify-between border-b border-pulse-border pb-3">
                      <h3 className="text-lg font-semibold text-pulse-ink">
                        Calculation Snapshot · {selectedLine.employee_name}
                      </h3>
                      <button
                        type="button"
                        className="text-xs font-semibold text-pulse-muted hover:text-pulse-ink"
                        onClick={() => setSelectedLine(null)}
                      >
                        Close
                      </button>
                    </div>
                    <div className="mt-4 space-y-3 text-sm">
                      <div className="grid grid-cols-2 gap-3 rounded bg-pulse-hover p-3 text-xs">
                        <div>
                          <span className={labelClass}>Base Salary</span>
                          <p className="mt-1 font-semibold text-pulse-ink">
                            {selectedLine.currency} {Number(selectedLine.base_salary).toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <span className={labelClass}>Net Pay</span>
                          <p className="mt-1 font-semibold text-pulse-accent">
                            {selectedLine.currency} {Number(selectedLine.net_pay).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="rounded bg-pulse-hover p-3">
                        <span className={labelClass}>Line Breakdown Details</span>
                        <pre className="mt-2 max-h-48 overflow-auto text-xs text-pulse-ink">
                          {JSON.stringify(selectedLine.line_details || selectedLine, null, 2)}
                        </pre>
                      </div>
                    </div>
                    <div className="mt-4 flex justify-end">
                      <Button variant="secondary" onClick={() => setSelectedLine(null)}>
                        Done
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Sub-View: Compensation Assignments */}
      {subTab === "compensation" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-pulse-ink">Compensation Assignments</h2>
              <p className="mt-1 text-xs text-pulse-muted">
                Effective-dated salary structure and monthly compensation assignments per employment.
              </p>
            </div>
            <Button onClick={() => setShowCompModal(true)}>+ Assign Compensation</Button>
          </div>

          {/* Assign Compensation Modal */}
          {showCompModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className="w-full max-w-md rounded-lg border border-pulse-border bg-pulse-surface p-6 shadow-xl">
                <h3 className="text-lg font-semibold text-pulse-ink">Assign Salary Structure</h3>
                <form
                  className="mt-4 space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    assignCompensation.mutate({
                      employment_id: compEmpId,
                      salary_structure_id: compStructureId,
                      monthly_base_salary: compBaseSalary,
                      effective_from: compEffectiveFrom,
                    });
                  }}
                >
                  <label className="block text-sm font-medium text-pulse-ink">
                    Employee
                    <select
                      required
                      className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                      value={compEmpId}
                      onChange={(e) => setCompEmpId(e.target.value)}
                    >
                      <option value="">Select Employee</option>
                      {employments.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.person_name} ({emp.job_title || emp.employee_number})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm font-medium text-pulse-ink">
                    Salary Structure
                    <select
                      required
                      className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                      value={compStructureId}
                      onChange={(e) => setCompStructureId(e.target.value)}
                    >
                      <option value="">Select Structure</option>
                      {(structures.data?.results ?? []).map((st) => (
                        <option key={st.id} value={st.id}>
                          {st.name} ({st.currency})
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block text-sm font-medium text-pulse-ink">
                      Monthly Base Salary
                      <input
                        type="number"
                        step="0.01"
                        required
                        className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                        value={compBaseSalary}
                        onChange={(e) => setCompBaseSalary(e.target.value)}
                      />
                    </label>
                    <label className="block text-sm font-medium text-pulse-ink">
                      Effective From
                      <input
                        type="date"
                        required
                        className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                        value={compEffectiveFrom}
                        onChange={(e) => setCompEffectiveFrom(e.target.value)}
                      />
                    </label>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="secondary" onClick={() => setShowCompModal(false)}>
                      Cancel
                    </Button>
                    <Button disabled={assignCompensation.isPending} type="submit">
                      Save Assignment
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          )}

          <section className={panelClass}>
            {assignments.isLoading ? (
              <LoadingState label="Loading compensation records" />
            ) : (assignments.data?.results.length ?? 0) === 0 ? (
              <EmptyState title="No compensation assigned" body="Assign salary structures to employees to calculate payroll." />
            ) : (
              <div className="divide-y divide-pulse-border">
                {assignments.data?.results.map((c) => (
                  <div key={c.employment_id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                    <div>
                      <p className="font-semibold text-pulse-ink">{c.structure_name}</p>
                      <p className="text-xs text-pulse-muted">Effective from: {c.effective_from}</p>
                    </div>
                    <p className="text-base font-semibold text-pulse-accent">
                      {c.currency} {Number(c.monthly_base_salary).toLocaleString()} / month
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Sub-View: Structures & Setup */}
      {subTab === "structures" && (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Structures */}
            <section className={panelClass}>
              <div className="flex items-center justify-between border-b border-pulse-border pb-2">
                <h3 className="text-sm font-semibold text-pulse-ink">Salary Structures</h3>
                <Button variant="secondary" onClick={() => setShowStructureModal(true)}>+ Add Structure</Button>
              </div>
              <ul className="mt-3 divide-y divide-pulse-border text-sm">
                {(structures.data?.results ?? []).map((st) => (
                  <li key={st.id} className="flex items-center justify-between py-2">
                    <div>
                      <p className="font-medium text-pulse-ink">{st.name}</p>
                      <p className="text-xs text-pulse-muted">Code: {st.code} · Currency: {st.currency}</p>
                    </div>
                    <span className="rounded bg-pulse-hover px-2 py-0.5 text-xs text-pulse-muted">
                      {st.is_active ? "Active" : "Inactive"}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            {/* Components */}
            <section className={panelClass}>
              <div className="flex items-center justify-between border-b border-pulse-border pb-2">
                <h3 className="text-sm font-semibold text-pulse-ink">Salary Components</h3>
                <Button variant="secondary" onClick={() => setShowComponentModal(true)}>+ Add Component</Button>
              </div>
              <ul className="mt-3 divide-y divide-pulse-border text-sm">
                {(components.data?.results ?? []).map((cp) => (
                  <li key={cp.id} className="flex items-center justify-between py-2">
                    <div>
                      <p className="font-medium text-pulse-ink">{cp.name}</p>
                      <p className="text-xs text-pulse-muted">Code: {cp.code} · Type: {cp.component_type}</p>
                    </div>
                    <span className="rounded bg-pulse-hover px-2 py-0.5 text-xs capitalize text-pulse-muted">
                      {cp.component_type}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            {/* Periods */}
            <section className={panelClass}>
              <div className="flex items-center justify-between border-b border-pulse-border pb-2">
                <h3 className="text-sm font-semibold text-pulse-ink">Payroll Periods</h3>
                <Button variant="secondary" onClick={() => setShowPeriodModal(true)}>+ Add Period</Button>
              </div>
              <ul className="mt-3 divide-y divide-pulse-border text-sm">
                {(periods.data?.results ?? []).map((pd) => (
                  <li key={pd.id} className="flex items-center justify-between py-2">
                    <div>
                      <p className="font-medium text-pulse-ink">{pd.name}</p>
                      <p className="text-xs text-pulse-muted">{pd.starts_on} to {pd.ends_on}</p>
                    </div>
                    <span className="rounded bg-pulse-hover px-2 py-0.5 text-xs text-pulse-muted">{pd.status}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          {/* Structure Modal */}
          {showStructureModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className="w-full max-w-md rounded-lg border border-pulse-border bg-pulse-surface p-6 shadow-xl">
                <h3 className="text-lg font-semibold text-pulse-ink">New Salary Structure</h3>
                <form
                  className="mt-4 space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    createStructure.mutate({
                      name: structName,
                      code: structCode,
                      currency: structCurrency,
                    });
                  }}
                >
                  <label className="block text-sm font-medium text-pulse-ink">
                    Structure Name
                    <input
                      required
                      className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                      value={structName}
                      onChange={(e) => setStructName(e.target.value)}
                    />
                  </label>
                  <label className="block text-sm font-medium text-pulse-ink">
                    Code
                    <input
                      required
                      className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                      value={structCode}
                      onChange={(e) => setStructCode(e.target.value)}
                    />
                  </label>
                  <label className="block text-sm font-medium text-pulse-ink">
                    Currency
                    <input
                      required
                      className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                      value={structCurrency}
                      onChange={(e) => setStructCurrency(e.target.value)}
                    />
                  </label>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="secondary" onClick={() => setShowStructureModal(false)}>Cancel</Button>
                    <Button disabled={createStructure.isPending} type="submit">Create</Button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Component Modal */}
          {showComponentModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className="w-full max-w-md rounded-lg border border-pulse-border bg-pulse-surface p-6 shadow-xl">
                <h3 className="text-lg font-semibold text-pulse-ink">New Salary Component</h3>
                <form
                  className="mt-4 space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    createComponent.mutate({
                      name: compName,
                      code: compCode,
                      component_type: compType,
                      is_statutory: compStatutory,
                    });
                  }}
                >
                  <label className="block text-sm font-medium text-pulse-ink">
                    Component Name
                    <input
                      required
                      className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                      value={compName}
                      onChange={(e) => setCompName(e.target.value)}
                    />
                  </label>
                  <label className="block text-sm font-medium text-pulse-ink">
                    Code
                    <input
                      required
                      className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                      value={compCode}
                      onChange={(e) => setCompCode(e.target.value)}
                    />
                  </label>
                  <label className="block text-sm font-medium text-pulse-ink">
                    Component Type
                    <select
                      className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                      value={compType}
                      onChange={(e) => setCompType(e.target.value as "earning" | "deduction")}
                    >
                      <option value="earning">Earning</option>
                      <option value="deduction">Deduction</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-2 pt-1 text-sm font-medium text-pulse-ink">
                    <input
                      type="checkbox"
                      checked={compStatutory}
                      onChange={(e) => setCompStatutory(e.target.checked)}
                      className="rounded border-pulse-border"
                    />
                    Is Statutory Deduction / Rule
                  </label>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="secondary" onClick={() => setShowComponentModal(false)}>Cancel</Button>
                    <Button disabled={createComponent.isPending} type="submit">Create</Button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Period Modal */}
          {showPeriodModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className="w-full max-w-md rounded-lg border border-pulse-border bg-pulse-surface p-6 shadow-xl">
                <h3 className="text-lg font-semibold text-pulse-ink">New Payroll Period</h3>
                <form
                  className="mt-4 space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    createPeriod.mutate({
                      name: periodName,
                      starts_on: periodStart,
                      ends_on: periodEnd,
                    });
                  }}
                >
                  <label className="block text-sm font-medium text-pulse-ink">
                    Period Name
                    <input
                      required
                      className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                      value={periodName}
                      onChange={(e) => setPeriodName(e.target.value)}
                      placeholder="e.g. October 2026 Pay Period"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block text-sm font-medium text-pulse-ink">
                      Starts On
                      <input
                        type="date"
                        required
                        className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                        value={periodStart}
                        onChange={(e) => setPeriodStart(e.target.value)}
                      />
                    </label>
                    <label className="block text-sm font-medium text-pulse-ink">
                      Ends On
                      <input
                        type="date"
                        required
                        className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                        value={periodEnd}
                        onChange={(e) => setPeriodEnd(e.target.value)}
                      />
                    </label>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="secondary" onClick={() => setShowPeriodModal(false)}>Cancel</Button>
                    <Button disabled={createPeriod.isPending} type="submit">Create</Button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

