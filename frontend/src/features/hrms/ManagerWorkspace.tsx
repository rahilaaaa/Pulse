import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, ApiError } from "../../shared/api/client";
import { Button } from "../../shared/ui/Button";
import { EmptyState, ErrorState, LoadingState } from "../../shared/ui/States";
import type {
  ApprovalDelegationRow,
  AttendanceCorrectionRow,
  Employment,
  TeamAttendanceRow,
  TeamCalendarEvent,
  TeamMember,
} from "./types";

const panelClass = "rounded-lg border border-pulse-border bg-pulse-surface p-4";

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

type ManagerSubTab = "attendance" | "directory" | "approvals" | "delegations" | "calendar";

export function ManagerWorkspace({ companyId, employments }: Props) {
  const queryClient = useQueryClient();
  const [subTab, setSubTab] = useState<ManagerSubTab>("attendance");
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [feedback, setFeedback] = useState<string | null>(null);

  // Decision Modal State (for Corrections or Leaves)
  const [activeDecision, setActiveDecision] = useState<{
    id: string;
    type: "correction" | "leave";
    status: "approved" | "rejected";
    title: string;
  } | null>(null);
  const [decisionNote, setDecisionNote] = useState("");

  // New Delegation Modal State
  const [showDelegationModal, setShowDelegationModal] = useState(false);
  const [delegateeId, setDelegateeId] = useState("");
  const [delegationScope, setDelegationScope] = useState("all");
  const [delegationStartsOn, setDelegationStartsOn] = useState(todayIso());
  const [delegationEndsOn, setDelegationEndsOn] = useState(todayIso());
  const [delegationReason, setDelegationReason] = useState("");

  // Reassignment Modal State
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [reassignFromManagerId, setReassignFromManagerId] = useState("");
  const [reassignToManagerId, setReassignToManagerId] = useState("");
  const [reassignReason, setReassignReason] = useState("");

  const root = `/api/v1/companies/${companyId}/hrms`;

  // Queries
  const teamDirectory = useQuery({
    queryKey: ["hrms-team-directory", companyId],
    queryFn: () => api<{ results: TeamMember[] }>(`${root}/team/directory/`),
  });

  const teamAttendance = useQuery({
    queryKey: ["hrms-team-attendance", companyId, selectedDate],
    queryFn: () => api<{ results: TeamAttendanceRow[] }>(`${root}/team/attendance/?work_date=${selectedDate}`),
  });

  const teamCalendar = useQuery({
    queryKey: ["hrms-team-calendar", companyId],
    queryFn: () => api<{ results: TeamCalendarEvent[] }>(`${root}/team/calendar/`),
  });

  const pendingCorrections = useQuery({
    queryKey: ["hrms-corrections-pending", companyId],
    queryFn: () => api<{ results: AttendanceCorrectionRow[] }>(`${root}/attendance/corrections/?status=pending`),
  });

  const pendingLeaves = useQuery({
    queryKey: ["hrms-leaves-pending", companyId],
    queryFn: () => api<{ results: Array<{ id: string; employee_name?: string; leave_type_name: string; start_date: string; end_date: string; reason?: string; status: string }> }>(`${root}/leave-requests/?status=pending`),
  });

  const delegations = useQuery({
    queryKey: ["hrms-delegations", companyId],
    queryFn: () => api<{ results: ApprovalDelegationRow[] }>(`${root}/delegations/`),
  });

  // Mutations
  const decideCorrection = useMutation({
    mutationFn: ({ id, status, note }: { id: string; status: string; note: string }) =>
      api(`${root}/attendance/corrections/${id}/decision/`, {
        method: "POST",
        body: JSON.stringify({ status, decision_note: note }),
      }),
    onSuccess: async () => {
      setFeedback("Attendance correction decision submitted.");
      setActiveDecision(null);
      setDecisionNote("");
      await queryClient.invalidateQueries({ queryKey: ["hrms-corrections-pending", companyId] });
      await queryClient.invalidateQueries({ queryKey: ["hrms-team-attendance", companyId] });
    },
    onError: (err) => setFeedback(errorText(err)),
  });

  const decideLeave = useMutation({
    mutationFn: ({ id, status, note }: { id: string; status: string; note: string }) =>
      api(`${root}/leave-requests/${id}/decision/`, {
        method: "POST",
        body: JSON.stringify({ status, decision_notes: note }),
      }),
    onSuccess: async () => {
      setFeedback("Leave decision recorded.");
      setActiveDecision(null);
      setDecisionNote("");
      await queryClient.invalidateQueries({ queryKey: ["hrms-leaves-pending", companyId] });
    },
    onError: (err) => setFeedback(errorText(err)),
  });

  const createDelegation = useMutation({
    mutationFn: (data: { delegatee_id: string; scope: string; starts_on: string; ends_on: string; reason: string }) =>
      api(`${root}/delegations/`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: async () => {
      setFeedback("Approval authority delegated.");
      setShowDelegationModal(false);
      setDelegateeId("");
      setDelegationReason("");
      await queryClient.invalidateQueries({ queryKey: ["hrms-delegations", companyId] });
    },
    onError: (err) => setFeedback(errorText(err)),
  });

  const revokeDelegation = useMutation({
    mutationFn: (delegationId: string) =>
      api(`${root}/delegations/${delegationId}/revoke/`, {
        method: "POST",
      }),
    onSuccess: async () => {
      setFeedback("Delegation revoked.");
      await queryClient.invalidateQueries({ queryKey: ["hrms-delegations", companyId] });
    },
    onError: (err) => setFeedback(errorText(err)),
  });

  const reassignApprovals = useMutation({
    mutationFn: (data: { from_manager_employment_id: string; to_manager_employment_id: string; reason: string }) =>
      api(`${root}/approvals/reassign/`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: async () => {
      setFeedback("Pending approvals reassigned to successor manager.");
      setShowReassignModal(false);
      setReassignReason("");
      await queryClient.invalidateQueries({ queryKey: ["hrms-leaves-pending", companyId] });
      await queryClient.invalidateQueries({ queryKey: ["hrms-corrections-pending", companyId] });
    },
    onError: (err) => setFeedback(errorText(err)),
  });

  const teamMembers = teamDirectory.data?.results ?? [];
  const attendanceList = teamAttendance.data?.results ?? [];
  const correctionRows = pendingCorrections.data?.results ?? [];
  const leaveRows = pendingLeaves.data?.results ?? [];
  const totalPending = correctionRows.length + leaveRows.length;

  return (
    <div className="space-y-4">
      {/* Sub-Navigation */}
      <nav className="flex flex-wrap gap-2 border-b border-pulse-border pb-2" aria-label="Manager Navigation">
        {(
          [
            { id: "attendance", label: "Team Attendance" },
            { id: "directory", label: "Team Directory" },
            { id: "approvals", label: `Approvals Queue (${totalPending})` },
            { id: "delegations", label: "Delegations" },
            { id: "calendar", label: "Team Calendar" },
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

      {/* Sub-View: Team Attendance */}
      {subTab === "attendance" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-pulse-ink">Team Daily Attendance</h2>
              <p className="mt-1 text-xs text-pulse-muted">
                Review real-time presence and hours worked for your direct and indirect reports.
              </p>
            </div>
            <label className="text-sm font-medium text-pulse-ink">
              Work Date
              <input
                type="date"
                className="ml-2 rounded-md border border-pulse-border bg-pulse-surface px-3 py-1.5 text-sm text-pulse-ink"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
            </label>
          </div>

          <section className={panelClass}>
            {teamAttendance.isLoading ? (
              <LoadingState label="Loading team attendance records" />
            ) : teamAttendance.isError ? (
              <ErrorState title="Team attendance unavailable" body={errorText(teamAttendance.error)} />
            ) : attendanceList.length === 0 ? (
              <EmptyState title="No attendance logs" body={`No team attendance records found for ${selectedDate}.`} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[36rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-pulse-border text-pulse-muted">
                      <th className="py-2 pr-3 font-medium">Team Member</th>
                      <th className="py-2 pr-3 font-medium">Job Title</th>
                      <th className="py-2 pr-3 font-medium">Check In</th>
                      <th className="py-2 pr-3 font-medium">Check Out</th>
                      <th className="py-2 pr-3 font-medium">Minutes</th>
                      <th className="py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attendanceList.map((row) => (
                      <tr key={row.employment_id} className="border-b border-pulse-border/60">
                        <td className="py-2 pr-3 font-medium text-pulse-ink">{row.employee_name}</td>
                        <td className="py-2 pr-3 text-pulse-muted">{row.job_title || "-"}</td>
                        <td className="py-2 pr-3">{row.check_in ? new Date(row.check_in).toLocaleTimeString() : "-"}</td>
                        <td className="py-2 pr-3">{row.check_out ? new Date(row.check_out).toLocaleTimeString() : "-"}</td>
                        <td className="py-2 pr-3">{row.minutes_worked}</td>
                        <td className="py-2">
                          <span
                            className={`rounded px-2 py-0.5 text-xs font-medium uppercase ${
                              row.status === "present"
                                ? "bg-green-100 text-green-800"
                                : row.status === "absent"
                                ? "bg-red-100 text-red-800"
                                : "bg-pulse-hover text-pulse-ink"
                            }`}
                          >
                            {row.status}
                          </span>
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

      {/* Sub-View: Team Directory */}
      {subTab === "directory" && (
        <div className="space-y-4">
          <section className={panelClass}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-pulse-border pb-3">
              <div>
                <h2 className="text-base font-semibold text-pulse-ink">Managed Team Roster</h2>
                <p className="mt-1 text-xs text-pulse-muted">Total members reporting to you: {teamMembers.length}</p>
              </div>
            </div>

            {teamDirectory.isLoading ? (
              <LoadingState label="Loading team directory" />
            ) : teamMembers.length === 0 ? (
              <EmptyState title="No direct or indirect reports" body="No active employees currently report to your employment profile." />
            ) : (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {teamMembers.map((m) => (
                  <div key={m.id} className="rounded-md border border-pulse-border p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-pulse-ink">{m.person_name}</p>
                      <span className="rounded bg-pulse-hover px-1.5 py-0.5 text-xs capitalize text-pulse-muted">
                        {m.status}
                      </span>
                    </div>
                    <p className="mt-1 text-xs font-medium text-pulse-accent">{m.job_title || "Designation Pending"}</p>
                    <p className="mt-2 text-xs text-pulse-muted">Department: {m.department_name || "Unassigned"}</p>
                    <p className="text-xs text-pulse-muted">Location: {m.work_location_name || "Unassigned"}</p>
                    <p className="text-xs text-pulse-muted">Employee #{m.employee_number || m.id.slice(0, 8)}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Sub-View: Approvals Queue */}
      {subTab === "approvals" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-pulse-ink">Pending Approval Requests</h2>
              <p className="mt-1 text-xs text-pulse-muted">
                Review pending leave and attendance correction requests from your team.
              </p>
            </div>
            <Button variant="secondary" onClick={() => setShowReassignModal(true)}>
              Reassign Approvals (Manager Departure)
            </Button>
          </div>

          {/* Pending Leaves */}
          <section className={panelClass}>
            <h3 className="text-sm font-semibold text-pulse-ink">Leave Requests ({leaveRows.length})</h3>
            {leaveRows.length === 0 ? (
              <p className="mt-2 text-xs text-pulse-muted">No pending team leave requests.</p>
            ) : (
              <div className="mt-3 divide-y divide-pulse-border">
                {leaveRows.map((req) => (
                  <div key={req.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                    <div>
                      <p className="font-medium text-pulse-ink">{req.employee_name || "Team Member"} · {req.leave_type_name}</p>
                      <p className="text-xs text-pulse-muted">Duration: {req.start_date} to {req.end_date}</p>
                      {req.reason ? <p className="mt-1 text-xs text-pulse-muted">Reason: {req.reason}</p> : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        onClick={() =>
                          setActiveDecision({
                            id: req.id,
                            type: "leave",
                            status: "rejected",
                            title: `Reject Leave for ${req.employee_name || "Employee"}`,
                          })
                        }
                      >
                        Reject
                      </Button>
                      <Button
                        onClick={() =>
                          setActiveDecision({
                            id: req.id,
                            type: "leave",
                            status: "approved",
                            title: `Approve Leave for ${req.employee_name || "Employee"}`,
                          })
                        }
                      >
                        Approve
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Pending Attendance Corrections */}
          <section className={panelClass}>
            <h3 className="text-sm font-semibold text-pulse-ink">Attendance Correction Requests ({correctionRows.length})</h3>
            {correctionRows.length === 0 ? (
              <p className="mt-2 text-xs text-pulse-muted">No pending attendance corrections.</p>
            ) : (
              <div className="mt-3 divide-y divide-pulse-border">
                {correctionRows.map((c) => (
                  <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                    <div>
                      <p className="font-medium text-pulse-ink">{c.employee_name}</p>
                      <p className="text-xs text-pulse-muted">
                        In: {c.requested_check_in ? new Date(c.requested_check_in).toLocaleString() : "-"} · Out:{" "}
                        {c.requested_check_out ? new Date(c.requested_check_out).toLocaleString() : "-"}
                      </p>
                      <p className="mt-1 text-xs text-pulse-muted">Reason: {c.reason}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        onClick={() =>
                          setActiveDecision({
                            id: c.id,
                            type: "correction",
                            status: "rejected",
                            title: `Reject Correction for ${c.employee_name}`,
                          })
                        }
                      >
                        Reject
                      </Button>
                      <Button
                        onClick={() =>
                          setActiveDecision({
                            id: c.id,
                            type: "correction",
                            status: "approved",
                            title: `Approve Correction for ${c.employee_name}`,
                          })
                        }
                      >
                        Approve
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Decision Modal */}
          {activeDecision && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className="w-full max-w-md rounded-lg border border-pulse-border bg-pulse-surface p-6 shadow-xl">
                <h3 className="text-lg font-semibold text-pulse-ink">{activeDecision.title}</h3>
                <p className="mt-1 text-xs text-pulse-muted">
                  Action: <span className="font-semibold uppercase">{activeDecision.status}</span>
                </p>
                <form
                  className="mt-4 space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (activeDecision.type === "correction") {
                      decideCorrection.mutate({
                        id: activeDecision.id,
                        status: activeDecision.status,
                        note: decisionNote,
                      });
                    } else {
                      decideLeave.mutate({
                        id: activeDecision.id,
                        status: activeDecision.status,
                        note: decisionNote,
                      });
                    }
                  }}
                >
                  <label className="block text-sm font-medium text-pulse-ink">
                    Decision Note / Reason
                    <textarea
                      rows={3}
                      className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                      value={decisionNote}
                      onChange={(e) => setDecisionNote(e.target.value)}
                      placeholder="Optional remarks..."
                    />
                  </label>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="secondary" onClick={() => setActiveDecision(null)}>
                      Cancel
                    </Button>
                    <Button
                      disabled={decideCorrection.isPending || decideLeave.isPending}
                      variant={activeDecision.status === "rejected" ? "danger" : "primary"}
                      type="submit"
                    >
                      Confirm {activeDecision.status}
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Reassignment Modal */}
          {showReassignModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className="w-full max-w-md rounded-lg border border-pulse-border bg-pulse-surface p-6 shadow-xl">
                <h3 className="text-lg font-semibold text-pulse-ink">Reassign Pending Approvals</h3>
                <p className="mt-1 text-xs text-pulse-muted">
                  Transfer pending team approvals and update effective-dated reporting lines safely.
                </p>
                <form
                  className="mt-4 space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    reassignApprovals.mutate({
                      from_manager_employment_id: reassignFromManagerId,
                      to_manager_employment_id: reassignToManagerId,
                      reason: reassignReason,
                    });
                  }}
                >
                  <label className="block text-sm font-medium text-pulse-ink">
                    Departing / Unavailable Manager
                    <select
                      required
                      className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                      value={reassignFromManagerId}
                      onChange={(e) => setReassignFromManagerId(e.target.value)}
                    >
                      <option value="">Select Manager</option>
                      {employments.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.person_name} ({emp.job_title || emp.employee_number})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm font-medium text-pulse-ink">
                    Successor Manager
                    <select
                      required
                      className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                      value={reassignToManagerId}
                      onChange={(e) => setReassignToManagerId(e.target.value)}
                    >
                      <option value="">Select Successor Manager</option>
                      {employments
                        .filter((emp) => emp.id !== reassignFromManagerId)
                        .map((emp) => (
                          <option key={emp.id} value={emp.id}>
                            {emp.person_name} ({emp.job_title || emp.employee_number})
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="block text-sm font-medium text-pulse-ink">
                    Reassignment Reason
                    <textarea
                      required
                      rows={2}
                      className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                      value={reassignReason}
                      onChange={(e) => setReassignReason(e.target.value)}
                      placeholder="e.g. Manager extended absence or department transition"
                    />
                  </label>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="secondary" onClick={() => setShowReassignModal(false)}>
                      Cancel
                    </Button>
                    <Button disabled={reassignApprovals.isPending} type="submit">
                      Reassign
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sub-View: Delegations */}
      {subTab === "delegations" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-pulse-ink">Approval Delegations</h2>
              <p className="mt-1 text-xs text-pulse-muted">
                Temporarily delegate approval decisions without exceeding your own permission bounds.
              </p>
            </div>
            <Button onClick={() => setShowDelegationModal(true)}>New Delegation</Button>
          </div>

          {/* New Delegation Modal */}
          {showDelegationModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className="w-full max-w-md rounded-lg border border-pulse-border bg-pulse-surface p-6 shadow-xl">
                <h3 className="text-lg font-semibold text-pulse-ink">Delegate Approval Authority</h3>
                <form
                  className="mt-4 space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    createDelegation.mutate({
                      delegatee_id: delegateeId,
                      scope: delegationScope,
                      starts_on: delegationStartsOn,
                      ends_on: delegationEndsOn,
                      reason: delegationReason,
                    });
                  }}
                >
                  <label className="block text-sm font-medium text-pulse-ink">
                    Delegatee Employee
                    <select
                      required
                      className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                      value={delegateeId}
                      onChange={(e) => setDelegateeId(e.target.value)}
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
                    Delegation Scope
                    <select
                      className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                      value={delegationScope}
                      onChange={(e) => setDelegationScope(e.target.value)}
                    >
                      <option value="all">All Approvals (Leaves & Attendance)</option>
                      <option value="leave">Leave Approvals Only</option>
                      <option value="attendance">Attendance Approvals Only</option>
                    </select>
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block text-sm font-medium text-pulse-ink">
                      Starts On
                      <input
                        type="date"
                        required
                        className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                        value={delegationStartsOn}
                        onChange={(e) => setDelegationStartsOn(e.target.value)}
                      />
                    </label>
                    <label className="block text-sm font-medium text-pulse-ink">
                      Ends On
                      <input
                        type="date"
                        required
                        className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                        value={delegationEndsOn}
                        onChange={(e) => setDelegationEndsOn(e.target.value)}
                      />
                    </label>
                  </div>
                  <label className="block text-sm font-medium text-pulse-ink">
                    Reason
                    <textarea
                      required
                      rows={2}
                      className="mt-1 block w-full rounded-md border border-pulse-border bg-pulse-surface px-3 py-2 text-sm text-pulse-ink"
                      value={delegationReason}
                      onChange={(e) => setDelegationReason(e.target.value)}
                      placeholder="e.g. Annual leave coverage"
                    />
                  </label>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="secondary" onClick={() => setShowDelegationModal(false)}>
                      Cancel
                    </Button>
                    <Button disabled={createDelegation.isPending} type="submit">
                      Create Delegation
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          )}

          <section className={panelClass}>
            {delegations.isLoading ? (
              <LoadingState label="Loading delegations" />
            ) : (delegations.data?.results.length ?? 0) === 0 ? (
              <EmptyState title="No active delegations" body="You haven't delegated approval authority to any peer." />
            ) : (
              <div className="divide-y divide-pulse-border">
                {delegations.data?.results.map((d) => (
                  <div key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                    <div>
                      <p className="font-semibold text-pulse-ink">Delegated to: {d.delegatee_name}</p>
                      <p className="text-xs text-pulse-muted">
                        Scope: {d.scope} · Effective: {d.starts_on} to {d.ends_on}
                      </p>
                      <p className="mt-1 text-xs text-pulse-muted">Reason: {d.reason}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium uppercase ${
                          d.is_active ? "bg-green-100 text-green-800" : "bg-pulse-hover text-pulse-muted"
                        }`}
                      >
                        {d.is_active ? "Active" : "Expired"}
                      </span>
                      {d.is_active ? (
                        <Button
                          variant="danger"
                          disabled={revokeDelegation.isPending}
                          onClick={() => revokeDelegation.mutate(d.id)}
                        >
                          Revoke
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Sub-View: Team Calendar */}
      {subTab === "calendar" && (
        <div className="space-y-4">
          <section className={panelClass}>
            <h2 className="text-base font-semibold text-pulse-ink">Team Time Off & Holiday Calendar</h2>
            <p className="mt-1 text-xs text-pulse-muted">
              Upcoming approved team leaves and declared company holidays.
            </p>

            {teamCalendar.isLoading ? (
              <LoadingState label="Loading calendar events" />
            ) : (teamCalendar.data?.results.length ?? 0) === 0 ? (
              <EmptyState title="No scheduled events" body="No upcoming team leaves or holidays recorded." />
            ) : (
              <div className="mt-4 divide-y divide-pulse-border">
                {teamCalendar.data?.results.map((ev) => (
                  <div key={ev.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
                    <div>
                      <p className="font-medium text-pulse-ink">{ev.label}</p>
                      <p className="text-xs text-pulse-muted">
                        {ev.event_type === "holiday" ? "Company Holiday" : `Team Member: ${ev.employee_name}`}
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-pulse-muted">
                      {ev.start_date === ev.end_date ? ev.start_date : `${ev.start_date} to ${ev.end_date}`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
