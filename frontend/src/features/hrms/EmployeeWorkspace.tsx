import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../../shared/api/client";
import { Button } from "../../shared/ui/Button";
import { EmptyState, ErrorState, LoadingState } from "../../shared/ui/States";
import type {
  AttendanceCorrectionRow,
  AttendanceRow,
  CompensationRow,
  EmployeeDocumentRow,
  Employment,
  HRRequestRow,
  OnboardingTaskRow,
  PayslipRow,
} from "./types";

const panelClass = "rounded-lg border border-pulse-border bg-pulse-surface p-4";
const labelClass = "text-xs font-medium uppercase tracking-wide text-pulse-muted";

function errorText(error: unknown) {
  return error instanceof ApiError ? error.message : "The request could not be completed.";
}

function localDateTime() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 16);
}

type Props = {
  companyId: string;
  permissions: string[];
  employments: Employment[];
  selectedEmploymentId: string;
  onSelectEmploymentId: (id: string) => void;
  attendanceActivated: boolean;
};

type EmployeeSubTab = "overview" | "attendance" | "documents" | "requests" | "compensation";

export function EmployeeWorkspace({
  companyId,
  permissions,
  employments,
  selectedEmploymentId,
  onSelectEmploymentId,
  attendanceActivated,
}: Props) {
  const queryClient = useQueryClient();
  const [subTab, setSubTab] = useState<EmployeeSubTab>("overview");
  const [occurredAt, setOccurredAt] = useState(localDateTime());
  const [feedback, setFeedback] = useState<string | null>(null);

  // Correction request form state
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);
  const [corrCheckIn, setCorrCheckIn] = useState(localDateTime());
  const [corrCheckOut, setCorrCheckOut] = useState(localDateTime());
  const [corrReason, setCorrReason] = useState("");

  // Document upload form state
  const [showDocModal, setShowDocModal] = useState(false);
  const [docTitle, setDocTitle] = useState("");
  const [docCategory, setDocCategory] = useState<EmployeeDocumentRow["category"]>("identity");
  const [docUrl, setDocUrl] = useState("");
  const [docSensitive, setDocSensitive] = useState(false);

  // HR Request form state
  const [showReqModal, setShowReqModal] = useState(false);
  const [reqCategory, setReqCategory] = useState<HRRequestRow["category"]>("general");
  const [reqPriority, setReqPriority] = useState<HRRequestRow["priority"]>("medium");
  const [reqSubject, setReqSubject] = useState("");
  const [reqDescription, setReqDescription] = useState("");

  // Selected payslip modal state
  const [selectedPayslip, setSelectedPayslip] = useState<PayslipRow | null>(null);

  const can = (code: string) => permissions.includes(code);
  const root = `/api/v1/companies/${companyId}/hrms`;
  const currentEmployment = employments.find((e) => e.id === selectedEmploymentId) ?? employments[0];

  // Queries
  const attendance = useQuery({
    queryKey: ["hrms-attendance", companyId, selectedEmploymentId],
    queryFn: () => api<{ results: AttendanceRow[] }>(`${root}/me/attendance/?employment_id=${selectedEmploymentId}`),
    enabled: Boolean(selectedEmploymentId && attendanceActivated && can("hrms.attendance.view")),
  });

  const myCorrections = useQuery({
    queryKey: ["hrms-corrections", companyId, selectedEmploymentId],
    queryFn: () =>
      api<{ results: AttendanceCorrectionRow[] }>(`${root}/attendance/corrections/?employment_id=${selectedEmploymentId}`),
    enabled: Boolean(selectedEmploymentId && attendanceActivated),
  });

  const myDocs = useQuery({
    queryKey: ["hrms-my-documents", companyId, selectedEmploymentId],
    queryFn: () => api<{ results: EmployeeDocumentRow[] }>(`${root}/me/documents/?employment_id=${selectedEmploymentId}`),
    enabled: Boolean(selectedEmploymentId),
  });

  const myRequests = useQuery({
    queryKey: ["hrms-my-requests", companyId, selectedEmploymentId],
    queryFn: () => api<{ results: HRRequestRow[] }>(`${root}/me/requests/?employment_id=${selectedEmploymentId}`),
    enabled: Boolean(selectedEmploymentId),
  });

  const myTasks = useQuery({
    queryKey: ["hrms-my-tasks", companyId, selectedEmploymentId],
    queryFn: () => api<{ results: OnboardingTaskRow[] }>(`${root}/onboarding-tasks/?employment_id=${selectedEmploymentId}`),
    enabled: Boolean(selectedEmploymentId),
  });

  const compensation = useQuery({
    queryKey: ["hrms-my-compensation", companyId],
    queryFn: () => api<{ results: CompensationRow[] }>(`${root}/me/compensation/`),
    enabled: can("hrms.compensation.own.view"),
  });

  const payslips = useQuery({
    queryKey: ["hrms-my-payslips", companyId],
    queryFn: () => api<{ results: PayslipRow[] }>(`${root}/me/payslips/`),
    enabled: can("hrms.payroll.payslip.own"),
  });

  // Mutations
  const punch = useMutation({
    mutationFn: (direction: "check-in" | "check-out") =>
      api(`${root}/employments/${selectedEmploymentId}/attendance/${direction}/`, {
        method: "POST",
        body: JSON.stringify({
          occurred_at: new Date(occurredAt).toISOString(),
          event_key: crypto.randomUUID(),
          verification_method: "manual",
        }),
      }),
    onSuccess: async (_, direction) => {
      setFeedback(`Attendance ${direction === "check-in" ? "check-in" : "check-out"} recorded.`);
      setOccurredAt(localDateTime());
      await queryClient.invalidateQueries({ queryKey: ["hrms-attendance", companyId, selectedEmploymentId] });
    },
    onError: (err) => setFeedback(errorText(err)),
  });

  const createCorrection = useMutation({
    mutationFn: (data: { requested_check_in: string; requested_check_out: string; reason: string }) =>
      api(`${root}/attendance/corrections/`, {
        method: "POST",
        body: JSON.stringify({
          employment_id: selectedEmploymentId,
          requested_check_in: data.requested_check_in ? new Date(data.requested_check_in).toISOString() : null,
          requested_check_out: data.requested_check_out ? new Date(data.requested_check_out).toISOString() : null,
          reason: data.reason,
        }),
      }),
    onSuccess: async () => {
      setFeedback("Attendance correction submitted for supervisor review.");
      setShowCorrectionModal(false);
      setCorrReason("");
      await queryClient.invalidateQueries({ queryKey: ["hrms-corrections", companyId, selectedEmploymentId] });
    },
    onError: (err) => setFeedback(errorText(err)),
  });

  const uploadDoc = useMutation({
    mutationFn: (data: { title: string; category: string; document_url: string; is_sensitive: boolean }) =>
      api(`${root}/me/documents/`, {
        method: "POST",
        body: JSON.stringify({
          employment_id: selectedEmploymentId,
          title: data.title,
          category: data.category,
          document_url: data.document_url,
          is_sensitive: data.is_sensitive,
        }),
      }),
    onSuccess: async () => {
      setFeedback("Document submitted for HR verification.");
      setShowDocModal(false);
      setDocTitle("");
      setDocUrl("");
      setDocSensitive(false);
      await queryClient.invalidateQueries({ queryKey: ["hrms-my-documents", companyId, selectedEmploymentId] });
    },
    onError: (err) => setFeedback(errorText(err)),
  });

  const submitHRRequest = useMutation({
    mutationFn: (data: { category: string; priority: string; subject: string; description: string }) =>
      api(`${root}/me/requests/`, {
        method: "POST",
        body: JSON.stringify({
          employment_id: selectedEmploymentId,
          category: data.category,
          priority: data.priority,
          subject: data.subject,
          description: data.description,
        }),
      }),
    onSuccess: async () => {
      setFeedback("HR request submitted successfully.");
      setShowReqModal(false);
      setReqSubject("");
      setReqDescription("");
      await queryClient.invalidateQueries({ queryKey: ["hrms-my-requests", companyId, selectedEmploymentId] });
    },
    onError: (err) => setFeedback(errorText(err)),
  });

  const updateTask = useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: string }) =>
      api(`${root}/onboarding-tasks/${taskId}/`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: async () => {
      setFeedback("Task status updated.");
      await queryClient.invalidateQueries({ queryKey: ["hrms-my-tasks", companyId, selectedEmploymentId] });
    },
    onError: (err) => setFeedback(errorText(err)),
  });

  if (employments.length === 0) {
    return (
      <EmptyState
        title="No Employment Record"
        body="You do not have an active Employment record linked to this company. An HR administrator can assign an employment profile to you."
      />
    );
  }

  const attendanceRows = attendance.data?.results ?? [];
  const openTasks = (myTasks.data?.results ?? []).filter((t) => t.status !== "completed" && t.status !== "waived");
  const openReqs = (myRequests.data?.results ?? []).filter((r) => r.status !== "resolved" && r.status !== "closed");

  return (
    <div className="space-y-4">
      {/* Context selector for multiple sequential or concurrent employments */}
      {employments.length > 1 ? (
        <section className={panelClass}>
          <label className="block text-sm font-medium text-pulse-ink" htmlFor="emp-context">
            Active Employment Context
            <select
              id="emp-context"
              className="mt-1 block w-full max-w-xl rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
              value={selectedEmploymentId}
              onChange={(e) => onSelectEmploymentId(e.target.value)}
            >
              {employments.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.job_title || "Employment"} · {emp.legal_entity_name || "No Entity"} ({emp.employee_number || emp.id.slice(0, 8)})
                </option>
              ))}
            </select>
          </label>
        </section>
      ) : null}

      {/* Sub-Navigation */}
      <nav className="flex flex-wrap gap-2 border-b border-pulse-border pb-2" aria-label="Employee Navigation">
        {(
          [
            { id: "overview", label: "My HR Home" },
            { id: "attendance", label: "Attendance & Shifts" },
            { id: "documents", label: "My Documents" },
            { id: "requests", label: "Helpdesk & Requests" },
            { id: "compensation", label: "Payslips & Salary" },
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

      {/* Sub-View: Overview */}
      {subTab === "overview" && (
        <div className="space-y-4">
          <section className="grid gap-4 sm:grid-cols-4">
            <div className={panelClass}>
              <p className={labelClass}>Status</p>
              <p className="mt-1 text-xl font-semibold capitalize text-pulse-ink">{currentEmployment.status}</p>
              <p className="mt-0.5 text-xs text-pulse-muted">Since {currentEmployment.starts_on}</p>
            </div>
            <div className={panelClass}>
              <p className={labelClass}>Pending Tasks</p>
              <p className="mt-1 text-xl font-semibold text-pulse-ink">{openTasks.length}</p>
              <p className="mt-0.5 text-xs text-pulse-muted">Onboarding checklist</p>
            </div>
            <div className={panelClass}>
              <p className={labelClass}>Open Requests</p>
              <p className="mt-1 text-xl font-semibold text-pulse-ink">{openReqs.length}</p>
              <p className="mt-0.5 text-xs text-pulse-muted">HR helpdesk tickets</p>
            </div>
            <div className={panelClass}>
              <p className={labelClass}>Leave & Time Off</p>
              <Link to="/app/hrms/leave" className="mt-2 inline-block text-sm font-semibold text-pulse-accent hover:underline">
                Open Leave Portal &rarr;
              </Link>
            </div>
          </section>

          <section className={panelClass}>
            <h2 className="text-base font-semibold text-pulse-ink">Employment Profile</h2>
            <dl className="mt-3 grid gap-4 text-sm sm:grid-cols-3">
              <div>
                <dt className={labelClass}>Employee Number</dt>
                <dd className="mt-1 font-medium text-pulse-ink">{currentEmployment.employee_number || "Not assigned"}</dd>
              </div>
              <div>
                <dt className={labelClass}>Job Title</dt>
                <dd className="mt-1 font-medium text-pulse-ink">{currentEmployment.job_title || "Not assigned"}</dd>
              </div>
              <div>
                <dt className={labelClass}>Legal Entity</dt>
                <dd className="mt-1 font-medium text-pulse-ink">{currentEmployment.legal_entity_name || "Unassigned"}</dd>
              </div>
              <div>
                <dt className={labelClass}>Department</dt>
                <dd className="mt-1 font-medium text-pulse-ink">{currentEmployment.department_name || "Unassigned"}</dd>
              </div>
              <div>
                <dt className={labelClass}>Work Location</dt>
                <dd className="mt-1 font-medium text-pulse-ink">{currentEmployment.work_location_name || "Unassigned"}</dd>
              </div>
              <div>
                <dt className={labelClass}>Reporting Manager</dt>
                <dd className="mt-1 font-medium text-pulse-ink">{currentEmployment.manager_name || "None designated"}</dd>
              </div>
            </dl>
          </section>

          {openTasks.length > 0 && (
            <section className={panelClass}>
              <h2 className="text-base font-semibold text-pulse-ink">Pending Onboarding Checklist</h2>
              <div className="mt-3 divide-y divide-pulse-border">
                {openTasks.map((t) => (
                  <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div>
                      <p className="text-sm font-medium text-pulse-ink">{t.title}</p>
                      <p className="text-xs text-pulse-muted">Category: {t.category} {t.due_date ? `· Due: ${t.due_date}` : ""}</p>
                      {t.notes ? <p className="mt-1 text-xs text-pulse-muted">{t.notes}</p> : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-pulse-hover px-2 py-0.5 text-xs font-medium uppercase text-pulse-muted">
                        {t.status}
                      </span>
                      {t.status === "pending" ? (
                        <Button
                          variant="secondary"
                          disabled={updateTask.isPending}
                          onClick={() => updateTask.mutate({ taskId: t.id, status: "in_progress" })}
                        >
                          Start
                        </Button>
                      ) : null}
                      <Button
                        disabled={updateTask.isPending}
                        onClick={() => updateTask.mutate({ taskId: t.id, status: "completed" })}
                      >
                        Complete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Sub-View: Attendance */}
      {subTab === "attendance" && (
        <div className="space-y-4">
          {!attendanceActivated ? (
            <EmptyState
              title="Attendance is Not Activated"
              body="Attendance tracking is currently in setup mode for this company. An administrator must activate attendance readiness."
            />
          ) : (
            <>
              <section className={panelClass}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-pulse-ink">Record Attendance Event</h2>
                    <p className="mt-1 text-xs text-pulse-muted">
                      Check in or check out with manual timestamp verification.
                    </p>
                  </div>
                  <Button variant="secondary" onClick={() => setShowCorrectionModal(true)}>
                    Request Attendance Correction
                  </Button>
                </div>

                <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={(e) => e.preventDefault()}>
                  <label className="text-sm font-medium text-pulse-ink">
                    Event Timestamp
                    <input
                      className="mt-1 block rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                      type="datetime-local"
                      value={occurredAt}
                      onChange={(e) => setOccurredAt(e.target.value)}
                    />
                  </label>
                  <Button disabled={punch.isPending} onClick={() => punch.mutate("check-in")}>
                    Check In
                  </Button>
                  <Button variant="secondary" disabled={punch.isPending} onClick={() => punch.mutate("check-out")}>
                    Check Out
                  </Button>
                </form>
              </section>

              {/* Attendance Correction Modal */}
              {showCorrectionModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                  <div className="w-full max-w-md rounded-lg border border-pulse-border bg-pulse-surface p-6 shadow-xl">
                    <h3 className="text-lg font-semibold text-pulse-ink">Request Attendance Correction</h3>
                    <p className="mt-1 text-xs text-pulse-muted">
                      Provide revised check-in and check-out times and a reason for supervisor review.
                    </p>
                    <form
                      className="mt-4 space-y-3"
                      onSubmit={(e) => {
                        e.preventDefault();
                        createCorrection.mutate({
                          requested_check_in: corrCheckIn,
                          requested_check_out: corrCheckOut,
                          reason: corrReason,
                        });
                      }}
                    >
                      <label className="block text-sm font-medium text-pulse-ink">
                        Requested Check In
                        <input
                          type="datetime-local"
                          className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                          value={corrCheckIn}
                          onChange={(e) => setCorrCheckIn(e.target.value)}
                        />
                      </label>
                      <label className="block text-sm font-medium text-pulse-ink">
                        Requested Check Out
                        <input
                          type="datetime-local"
                          className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                          value={corrCheckOut}
                          onChange={(e) => setCorrCheckOut(e.target.value)}
                        />
                      </label>
                      <label className="block text-sm font-medium text-pulse-ink">
                        Reason / Explanation
                        <textarea
                          required
                          rows={3}
                          className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                          value={corrReason}
                          onChange={(e) => setCorrReason(e.target.value)}
                          placeholder="e.g. Forgot badge / device malfunction"
                        />
                      </label>
                      <div className="flex justify-end gap-2 pt-2">
                        <Button variant="secondary" onClick={() => setShowCorrectionModal(false)}>
                          Cancel
                        </Button>
                        <Button disabled={createCorrection.isPending} type="submit">
                          Submit Request
                        </Button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* Attendance Table */}
              <section className={panelClass}>
                <h2 className="text-base font-semibold text-pulse-ink">Recent Attendance Log</h2>
                {attendance.isLoading ? (
                  <LoadingState label="Loading attendance sessions" />
                ) : attendance.isError ? (
                  <ErrorState title="Attendance unavailable" body={errorText(attendance.error)} />
                ) : attendanceRows.length === 0 ? (
                  <EmptyState title="No attendance recorded yet" body="Your check-in and check-out logs will show here." />
                ) : (
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[36rem] text-left text-sm">
                      <thead>
                        <tr className="border-b border-pulse-border text-pulse-muted">
                          <th className="py-2 pr-3 font-medium">Work Date</th>
                          <th className="py-2 pr-3 font-medium">Shift</th>
                          <th className="py-2 pr-3 font-medium">Check In</th>
                          <th className="py-2 pr-3 font-medium">Check Out</th>
                          <th className="py-2 pr-3 font-medium">Minutes</th>
                          <th className="py-2 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {attendanceRows.map((r) => (
                          <tr key={r.id} className="border-b border-pulse-border/60">
                            <td className="py-2 pr-3 font-medium text-pulse-ink">{r.work_date}</td>
                            <td className="py-2 pr-3 text-pulse-muted">{r.shift || "-"}</td>
                            <td className="py-2 pr-3">{r.check_in ? new Date(r.check_in).toLocaleTimeString() : "-"}</td>
                            <td className="py-2 pr-3">{r.check_out ? new Date(r.check_out).toLocaleTimeString() : "-"}</td>
                            <td className="py-2 pr-3">{r.minutes_worked}</td>
                            <td className="py-2">
                              <span className="rounded bg-pulse-hover px-2 py-0.5 text-xs font-medium uppercase text-pulse-ink">
                                {r.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {/* Correction History */}
              {(myCorrections.data?.results.length ?? 0) > 0 && (
                <section className={panelClass}>
                  <h2 className="text-base font-semibold text-pulse-ink">Submitted Correction Requests</h2>
                  <div className="mt-3 divide-y divide-pulse-border">
                    {myCorrections.data?.results.map((c) => (
                      <div key={c.id} className="flex flex-wrap items-start justify-between gap-3 py-2 text-sm">
                        <div>
                          <p className="font-medium text-pulse-ink">Reason: {c.reason}</p>
                          <p className="text-xs text-pulse-muted">
                            Check In: {c.requested_check_in ? new Date(c.requested_check_in).toLocaleString() : "-"} · Check Out:{" "}
                            {c.requested_check_out ? new Date(c.requested_check_out).toLocaleString() : "-"}
                          </p>
                          {c.decision_note ? (
                            <p className="mt-1 text-xs text-pulse-accent">Supervisor Note: {c.decision_note}</p>
                          ) : null}
                        </div>
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-medium uppercase ${
                            c.status === "approved"
                              ? "bg-green-100 text-green-800"
                              : c.status === "rejected"
                              ? "bg-red-100 text-red-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {c.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      )}

      {/* Sub-View: Documents */}
      {subTab === "documents" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-pulse-ink">Employee Documents</h2>
              <p className="mt-1 text-xs text-pulse-muted">
                View personal compliance documents and submit files for HR verification.
              </p>
            </div>
            <Button onClick={() => setShowDocModal(true)}>Upload Document</Button>
          </div>

          {/* Upload Document Modal */}
          {showDocModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className="w-full max-w-md rounded-lg border border-pulse-border bg-pulse-surface p-6 shadow-xl">
                <h3 className="text-lg font-semibold text-pulse-ink">Upload Document</h3>
                <form
                  className="mt-4 space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    uploadDoc.mutate({
                      title: docTitle,
                      category: docCategory,
                      document_url: docUrl,
                      is_sensitive: docSensitive,
                    });
                  }}
                >
                  <label className="block text-sm font-medium text-pulse-ink">
                    Document Title
                    <input
                      required
                      className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                      value={docTitle}
                      onChange={(e) => setDocTitle(e.target.value)}
                      placeholder="e.g. Passport copy, Tax Form W-4"
                    />
                  </label>
                  <label className="block text-sm font-medium text-pulse-ink">
                    Category
                    <select
                      className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                      value={docCategory}
                      onChange={(e) => setDocCategory(e.target.value as EmployeeDocumentRow["category"])}
                    >
                      <option value="identity">Identity / Passport</option>
                      <option value="tax">Tax & Compliance</option>
                      <option value="contract">Contract & Agreement</option>
                      <option value="qualification">Education / Qualification</option>
                      <option value="payroll">Bank / Payroll</option>
                      <option value="other">Other</option>
                    </select>
                  </label>
                  <label className="block text-sm font-medium text-pulse-ink">
                    Document Link or Path
                    <input
                      required
                      className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                      value={docUrl}
                      onChange={(e) => setDocUrl(e.target.value)}
                      placeholder="https://storage... or file path"
                    />
                  </label>
                  <label className="flex items-center gap-2 pt-1 text-sm font-medium text-pulse-ink">
                    <input
                      type="checkbox"
                      checked={docSensitive}
                      onChange={(e) => setDocSensitive(e.target.checked)}
                      className="rounded border-pulse-border"
                    />
                    Mark as Sensitive (Restricts access to designated HR officers)
                  </label>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="secondary" onClick={() => setShowDocModal(false)}>
                      Cancel
                    </Button>
                    <Button disabled={uploadDoc.isPending} type="submit">
                      Upload
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          )}

          <section className={panelClass}>
            {myDocs.isLoading ? (
              <LoadingState label="Loading documents" />
            ) : (myDocs.data?.results.length ?? 0) === 0 ? (
              <EmptyState title="No documents found" body="Upload identity, tax, or employment documents to keep your records updated." />
            ) : (
              <div className="divide-y divide-pulse-border">
                {myDocs.data?.results.map((doc) => (
                  <div key={doc.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                    <div>
                      <p className="font-semibold text-pulse-ink">{doc.title}</p>
                      <p className="text-xs text-pulse-muted">
                        Category: {doc.category} · Added: {new Date(doc.created_at).toLocaleDateString()}
                        {doc.is_sensitive ? " · [Sensitive Record]" : ""}
                      </p>
                      {doc.verification_notes ? (
                        <p className="mt-1 text-xs text-pulse-accent">Review Notes: {doc.verification_notes}</p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium uppercase ${
                          doc.status === "verified"
                            ? "bg-green-100 text-green-800"
                            : doc.status === "rejected"
                            ? "bg-red-100 text-red-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {doc.status}
                      </span>
                      {doc.document_url ? (
                        <a
                          href={doc.document_url}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded border border-pulse-border px-2 py-1 text-xs font-semibold text-pulse-ink hover:bg-pulse-hover"
                        >
                          View
                        </a>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Sub-View: Helpdesk & Requests */}
      {subTab === "requests" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-pulse-ink">HR Helpdesk & Requests</h2>
              <p className="mt-1 text-xs text-pulse-muted">
                Submit queries, policy clarifications, payroll tickets, or grievance requests.
              </p>
            </div>
            <Button onClick={() => setShowReqModal(true)}>New Request</Button>
          </div>

          {/* New Request Modal */}
          {showReqModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className="w-full max-w-md rounded-lg border border-pulse-border bg-pulse-surface p-6 shadow-xl">
                <h3 className="text-lg font-semibold text-pulse-ink">Submit HR Request</h3>
                <form
                  className="mt-4 space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    submitHRRequest.mutate({
                      category: reqCategory,
                      priority: reqPriority,
                      subject: reqSubject,
                      description: reqDescription,
                    });
                  }}
                >
                  <label className="block text-sm font-medium text-pulse-ink">
                    Category
                    <select
                      className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                      value={reqCategory}
                      onChange={(e) => setReqCategory(e.target.value as HRRequestRow["category"])}
                    >
                      <option value="general">General HR</option>
                      <option value="payroll">Payroll & Compensation</option>
                      <option value="benefits">Benefits & Insurance</option>
                      <option value="policy">Policy Clarification</option>
                      <option value="grievance">Grievance / Workplace</option>
                    </select>
                  </label>
                  <label className="block text-sm font-medium text-pulse-ink">
                    Priority
                    <select
                      className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                      value={reqPriority}
                      onChange={(e) => setReqPriority(e.target.value as HRRequestRow["priority"])}
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </label>
                  <label className="block text-sm font-medium text-pulse-ink">
                    Subject
                    <input
                      required
                      className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                      value={reqSubject}
                      onChange={(e) => setReqSubject(e.target.value)}
                      placeholder="Brief summary of request"
                    />
                  </label>
                  <label className="block text-sm font-medium text-pulse-ink">
                    Description
                    <textarea
                      required
                      rows={3}
                      className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                      value={reqDescription}
                      onChange={(e) => setReqDescription(e.target.value)}
                      placeholder="Provide full details..."
                    />
                  </label>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="secondary" onClick={() => setShowReqModal(false)}>
                      Cancel
                    </Button>
                    <Button disabled={submitHRRequest.isPending} type="submit">
                      Submit
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          )}

          <section className={panelClass}>
            {myRequests.isLoading ? (
              <LoadingState label="Loading requests" />
            ) : (myRequests.data?.results.length ?? 0) === 0 ? (
              <EmptyState title="No requests open" body="You haven't submitted any HR helpdesk requests." />
            ) : (
              <div className="divide-y divide-pulse-border">
                {myRequests.data?.results.map((r) => (
                  <div key={r.id} className="py-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-pulse-ink">{r.subject}</span>
                        <span className="rounded bg-pulse-hover px-1.5 py-0.5 text-xs uppercase text-pulse-muted">
                          {r.priority}
                        </span>
                      </div>
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium uppercase ${
                          r.status === "resolved"
                            ? "bg-green-100 text-green-800"
                            : r.status === "in_progress"
                            ? "bg-blue-100 text-blue-800"
                            : r.status === "closed"
                            ? "bg-gray-100 text-gray-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {r.status}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-pulse-muted">
                      Category: {r.category} · Created: {new Date(r.created_at).toLocaleDateString()}
                    </p>
                    <p className="mt-2 text-sm text-pulse-ink">{r.description}</p>
                    {r.resolution ? (
                      <div className="mt-2 rounded-md bg-pulse-hover p-2.5 text-xs text-pulse-ink">
                        <span className="font-semibold text-pulse-accent">HR Resolution: </span>
                        {r.resolution}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Sub-View: Compensation & Payslips */}
      {subTab === "compensation" && (
        <div className="space-y-4">
          {can("hrms.compensation.own.view") ? (
            <section className={panelClass}>
              <h2 className="text-base font-semibold text-pulse-ink">My Compensation Assignment</h2>
              {compensation.isLoading ? (
                <LoadingState label="Loading compensation" />
              ) : (compensation.data?.results.length ?? 0) === 0 ? (
                <p className="mt-3 text-sm text-pulse-muted">No active salary structure is assigned to this employment.</p>
              ) : (
                <ul className="mt-3 divide-y divide-pulse-border">
                  {compensation.data?.results.map((row) => (
                    <li key={row.employment_id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                      <div>
                        <p className="text-sm font-medium text-pulse-ink">{row.structure_name}</p>
                        <p className="text-xs text-pulse-muted">Effective from: {row.effective_from}</p>
                      </div>
                      <p className="text-base font-semibold text-pulse-ink">
                        {row.currency}{" "}
                        {Number(row.monthly_base_salary).toLocaleString(undefined, {
                          minimumFractionDigits: row.currency_precision,
                          maximumFractionDigits: row.currency_precision,
                        })}{" "}
                        / month
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}

          {can("hrms.payroll.payslip.own") ? (
            <section className={panelClass}>
              <h2 className="text-base font-semibold text-pulse-ink">Issued Payslips</h2>
              {payslips.isLoading ? (
                <LoadingState label="Loading payslips" />
              ) : (payslips.data?.results.length ?? 0) === 0 ? (
                <p className="mt-3 text-sm text-pulse-muted">No finalized payslips available yet.</p>
              ) : (
                <div className="mt-3 divide-y divide-pulse-border">
                  {payslips.data?.results.map((p) => (
                    <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                      <div>
                        <p className="font-semibold text-pulse-ink">Period: {p.period}</p>
                        <p className="text-xs text-pulse-muted">Issued: {new Date(p.issued_at).toLocaleDateString()}</p>
                      </div>
                      <Button variant="secondary" onClick={() => setSelectedPayslip(p)}>
                        View Payslip Breakdown
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ) : null}

          {/* Payslip View Modal */}
          {selectedPayslip && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className="w-full max-w-lg rounded-lg border border-pulse-border bg-pulse-surface p-6 shadow-xl">
                <div className="flex items-center justify-between border-b border-pulse-border pb-3">
                  <h3 className="text-lg font-semibold text-pulse-ink">Payslip · {selectedPayslip.period}</h3>
                  <button
                    type="button"
                    className="text-xs font-semibold text-pulse-muted hover:text-pulse-ink"
                    onClick={() => setSelectedPayslip(null)}
                  >
                    Close
                  </button>
                </div>
                <div className="mt-4 space-y-3 text-sm">
                  <p className="text-xs text-pulse-muted">Issued On: {new Date(selectedPayslip.issued_at).toLocaleString()}</p>
                  <div className="rounded-md bg-pulse-hover p-4">
                    <p className={labelClass}>Snapshot Outputs</p>
                    <pre className="mt-2 max-h-60 overflow-auto text-xs text-pulse-ink">
                      {JSON.stringify(selectedPayslip.snapshot, null, 2)}
                    </pre>
                  </div>
                </div>
                <div className="mt-4 flex justify-end">
                  <Button variant="secondary" onClick={() => setSelectedPayslip(null)}>
                    Done
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

