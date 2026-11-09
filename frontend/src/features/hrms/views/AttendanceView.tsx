import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, ApiError } from "../../../shared/api/client";
import { Button } from "../../../shared/ui/Button";
import { EmptyState } from "../../../shared/ui/States";
import type {
  AttendanceCorrectionRow,
  AttendanceExceptionRow,
  AttendanceRow,
  TeamAttendanceRow,
} from "../types";

const panelClass = "rounded-lg border border-pulse-border bg-pulse-surface p-4 shadow-sm";

function errorText(error: unknown) {
  return error instanceof ApiError ? error.message : "The request could not be completed.";
}

function localDateTime() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 16);
}

interface AttendanceViewProps {
  companyId: string;
  permissions: string[];
  selectedEmploymentId: string;
}

export function AttendanceView({
  companyId,
  permissions,
  selectedEmploymentId,
}: AttendanceViewProps) {
  const queryClient = useQueryClient();
  const can = (code: string) => permissions.includes(code);
  const root = `/api/v1/companies/${companyId}/hrms`;
  const todayStr = new Date().toISOString().slice(0, 10);

  const canManageExceptions = can("hrms.attendance.manage");
  const canApproveCorrections = can("hrms.attendance.correction.approve") || can("hrms.manager.view");
  const isManagerOrAdmin = canApproveCorrections || canManageExceptions;

  // Tabs within Attendance
  type AttTab = "self" | "team_roster" | "corrections_queue" | "exceptions_queue";
  const [activeSubTab, setActiveSubTab] = useState<AttTab>("self");

  // Punch form state
  const [occurredAt, setOccurredAt] = useState(localDateTime());
  const [verificationMethod, setVerificationMethod] = useState("manual");
  const [feedback, setFeedback] = useState<string | null>(null);

  // Correction Request Modal
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);
  const [corrCheckIn, setCorrCheckIn] = useState(localDateTime());
  const [corrCheckOut, setCorrCheckOut] = useState(localDateTime());
  const [corrReason, setCorrReason] = useState("");

  // Filter for team roster
  const [selectedDate, setSelectedDate] = useState(todayStr);

  // Exception resolution state
  const [selectedException, setSelectedException] = useState<AttendanceExceptionRow | null>(null);
  const [resolutionNote, setResolutionNote] = useState("");

  // Queries
  const myAttendance = useQuery({
    queryKey: ["hrms-my-attendance", companyId, selectedEmploymentId],
    queryFn: () => api<{ results: AttendanceRow[] }>(`${root}/me/attendance/?employment_id=${selectedEmploymentId}`),
    enabled: Boolean(selectedEmploymentId),
  });

  const teamRoster = useQuery({
    queryKey: ["hrms-team-attendance", companyId, selectedDate],
    queryFn: () => api<{ results: TeamAttendanceRow[] }>(`${root}/team/attendance/?work_date=${selectedDate}`),
    enabled: isManagerOrAdmin,
  });

  const pendingCorrectionsQueue = useQuery({
    queryKey: ["hrms-pending-corrections-queue", companyId],
    queryFn: () => api<{ results: AttendanceCorrectionRow[] }>(`${root}/attendance/corrections/?status=pending`),
    enabled: canApproveCorrections,
  });

  const openExceptions = useQuery({
    queryKey: ["hrms-open-exceptions", companyId],
    queryFn: () => api<{ results: AttendanceExceptionRow[] }>(`${root}/attendance/exceptions/?status=open`),
    enabled: canManageExceptions,
  });

  // Mutations
  const punch = useMutation({
    mutationFn: (direction: "check-in" | "check-out") =>
      api(`${root}/employments/${selectedEmploymentId}/attendance/${direction}/`, {
        method: "POST",
        body: JSON.stringify({
          occurred_at: new Date(occurredAt).toISOString(),
          event_key: crypto.randomUUID(),
          verification_method: verificationMethod,
        }),
      }),
    onSuccess: async (_, direction) => {
      setFeedback(`Attendance ${direction === "check-in" ? "check-in" : "check-out"} recorded successfully.`);
      setOccurredAt(localDateTime());
      await queryClient.invalidateQueries({ queryKey: ["hrms-my-attendance", companyId, selectedEmploymentId] });
      await queryClient.invalidateQueries({ queryKey: ["hrms-team-attendance", companyId, todayStr] });
      await queryClient.invalidateQueries({ queryKey: ["hrms-dashboard", companyId] });
    },
    onError: (err) => setFeedback(errorText(err)),
  });

  const submitCorrection = useMutation({
    mutationFn: () =>
      api(`${root}/attendance/corrections/`, {
        method: "POST",
        body: JSON.stringify({
          employment_id: selectedEmploymentId,
          requested_check_in: corrCheckIn ? new Date(corrCheckIn).toISOString() : null,
          requested_check_out: corrCheckOut ? new Date(corrCheckOut).toISOString() : null,
          reason: corrReason,
        }),
      }),
    onSuccess: async () => {
      setFeedback("Attendance correction request submitted to supervisor.");
      setShowCorrectionModal(false);
      setCorrReason("");
      await queryClient.invalidateQueries({ queryKey: ["hrms-my-corrections", companyId, selectedEmploymentId] });
      await queryClient.invalidateQueries({ queryKey: ["hrms-pending-corrections-queue", companyId] });
    },
    onError: (err) => setFeedback(errorText(err)),
  });

  const decideCorrection = useMutation({
    mutationFn: ({ id, status, note }: { id: string; status: "approved" | "rejected"; note: string }) =>
      api(`${root}/attendance/corrections/${id}/decision/`, {
        method: "POST",
        body: JSON.stringify({ status, note }),
      }),
    onSuccess: async () => {
      setFeedback("Correction request decision saved.");
      await queryClient.invalidateQueries({ queryKey: ["hrms-pending-corrections-queue", companyId] });
      await queryClient.invalidateQueries({ queryKey: ["hrms-my-corrections", companyId] });
    },
    onError: (err) => setFeedback(errorText(err)),
  });

  const resolveException = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      api(`${root}/attendance/exceptions/${id}/resolve/`, {
        method: "POST",
        body: JSON.stringify({ resolution: note }),
      }),
    onSuccess: async () => {
      setFeedback("Attendance exception resolved.");
      setSelectedException(null);
      setResolutionNote("");
      await queryClient.invalidateQueries({ queryKey: ["hrms-open-exceptions", companyId] });
      await queryClient.invalidateQueries({ queryKey: ["hrms-dashboard", companyId] });
    },
    onError: (err) => setFeedback(errorText(err)),
  });

  const pendingCorrCount = pendingCorrectionsQueue.data?.results.length ?? 0;
  const openExcCount = openExceptions.data?.results.length ?? 0;

  return (
    <div className="space-y-4">
      {/* Feedback Alert */}
      {feedback && (
        <div className="flex items-center justify-between rounded-lg border border-teal-200 bg-teal-50 p-3 text-xs text-teal-800 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-200">
          <span>{feedback}</span>
          <button type="button" onClick={() => setFeedback(null)} className="font-semibold underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Navigation Sub-Tabs if Manager/Admin */}
      {isManagerOrAdmin && (
        <div className="flex flex-wrap items-center gap-2 border-b border-pulse-border pb-2 text-xs">
          <button
            type="button"
            onClick={() => setActiveSubTab("self")}
            className={`rounded-md px-3 py-1.5 font-semibold transition ${
              activeSubTab === "self" ? "bg-pulse-accent text-white shadow-sm" : "bg-pulse-hover text-pulse-muted hover:text-pulse-ink"
            }`}
          >
            My Attendance Punch & Log
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab("team_roster")}
            className={`rounded-md px-3 py-1.5 font-semibold transition ${
              activeSubTab === "team_roster" ? "bg-pulse-accent text-white shadow-sm" : "bg-pulse-hover text-pulse-muted hover:text-pulse-ink"
            }`}
          >
            Team Attendance Roster
          </button>
          {canApproveCorrections && (
            <button
              type="button"
              onClick={() => setActiveSubTab("corrections_queue")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-semibold transition ${
                activeSubTab === "corrections_queue"
                  ? "bg-pulse-accent text-white shadow-sm"
                  : "bg-pulse-hover text-pulse-muted hover:text-pulse-ink"
              }`}
            >
              <span>Correction Approvals</span>
              {pendingCorrCount > 0 && (
                <span className="rounded-full bg-white/20 px-1.5 py-0.2 text-[10px] font-bold">
                  {pendingCorrCount}
                </span>
              )}
            </button>
          )}
          {canManageExceptions && (
            <button
              type="button"
              onClick={() => setActiveSubTab("exceptions_queue")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-semibold transition ${
                activeSubTab === "exceptions_queue"
                  ? "bg-pulse-accent text-white shadow-sm"
                  : "bg-pulse-hover text-pulse-muted hover:text-pulse-ink"
              }`}
            >
              <span>Attendance Exceptions</span>
              {openExcCount > 0 && (
                <span className="rounded-full bg-rose-500 text-white px-1.5 py-0.2 text-[10px] font-bold">
                  {openExcCount}
                </span>
              )}
            </button>
          )}
        </div>
      )}

      {/* SUB-TAB 1: Self-Service Punch & History */}
      {activeSubTab === "self" && (
        <div className="space-y-4">
          {/* Punch In / Out Card */}
          <section className={panelClass}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-pulse-border pb-3">
              <div>
                <h3 className="text-base font-bold text-pulse-ink">Attendance Punch Clock</h3>
                <p className="text-xs text-pulse-muted">
                  Log your daily attendance check-in and check-out.
                </p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => setShowCorrectionModal(true)}>
                + Request Correction
              </Button>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-semibold text-pulse-ink">
                  Punch Timestamp
                  <input
                    type="datetime-local"
                    value={occurredAt}
                    onChange={(e) => setOccurredAt(e.target.value)}
                    className="mt-1 block w-full rounded border border-pulse-border bg-pulse-surface px-2.5 py-1.5 text-xs text-pulse-ink"
                  />
                </label>
              </div>

              <div>
                <label className="block text-xs font-semibold text-pulse-ink">
                  Verification Method
                  <select
                    value={verificationMethod}
                    onChange={(e) => setVerificationMethod(e.target.value)}
                    className="mt-1 block w-full rounded border border-pulse-border bg-pulse-surface px-2.5 py-1.5 text-xs text-pulse-ink"
                  >
                    <option value="manual">Manual (Self-Declared)</option>
                    <option value="qr">QR Code Scanner</option>
                    <option value="gps">GPS Geofence Location</option>
                  </select>
                </label>
              </div>

              <div className="flex items-end gap-2">
                <Button
                  className="flex-1"
                  disabled={punch.isPending || !selectedEmploymentId}
                  onClick={() => punch.mutate("check-in")}
                >
                  🟢 Check In
                </Button>
                <Button
                  variant="secondary"
                  className="flex-1"
                  disabled={punch.isPending || !selectedEmploymentId}
                  onClick={() => punch.mutate("check-out")}
                >
                  🔴 Check Out
                </Button>
              </div>
            </div>
          </section>

          {/* Personal Attendance Log Table */}
          <section className={panelClass}>
            <h3 className="text-base font-bold text-pulse-ink mb-3">My Attendance Log</h3>
            {(myAttendance.data?.results ?? []).length === 0 ? (
              <EmptyState
                title="No attendance records"
                body="You haven't recorded attendance punches yet for this employment context."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-pulse-border bg-pulse-hover/50 text-pulse-muted">
                      <th className="px-3 py-2.5 font-semibold">Date</th>
                      <th className="px-3 py-2.5 font-semibold">Shift</th>
                      <th className="px-3 py-2.5 font-semibold">Check-In</th>
                      <th className="px-3 py-2.5 font-semibold">Check-Out</th>
                      <th className="px-3 py-2.5 font-semibold">Minutes</th>
                      <th className="px-3 py-2.5 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-pulse-border">
                    {(myAttendance.data?.results ?? []).map((row) => (
                      <tr key={row.id} className="hover:bg-pulse-hover/60">
                        <td className="px-3 py-2.5 font-medium text-pulse-ink">{row.work_date}</td>
                        <td className="px-3 py-2.5 text-pulse-muted">{row.shift || "Regular"}</td>
                        <td className="px-3 py-2.5 font-mono text-pulse-ink">
                          {row.check_in ? row.check_in.slice(11, 16) : "--:--"}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-pulse-ink">
                          {row.check_out ? row.check_out.slice(11, 16) : "--:--"}
                        </td>
                        <td className="px-3 py-2.5 text-pulse-muted font-mono">
                          {row.minutes_worked ? `${Math.floor(row.minutes_worked / 60)}h ${row.minutes_worked % 60}m` : "—"}
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              row.status === "present"
                                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                                : row.status === "late"
                                ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                                : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
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

      {/* SUB-TAB 2: Team Attendance Roster */}
      {activeSubTab === "team_roster" && (
        <section className={panelClass}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-pulse-border pb-3">
            <div>
              <h3 className="text-base font-bold text-pulse-ink">Daily Team Attendance Roster</h3>
              <p className="text-xs text-pulse-muted">Review attendance timestamps for team personnel.</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-pulse-muted">Select Date:</span>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="rounded border border-pulse-border bg-pulse-surface px-2.5 py-1 text-xs text-pulse-ink"
              />
            </div>
          </div>

          {(teamRoster.data?.results ?? []).length === 0 ? (
            <div className="py-8 text-center text-xs text-pulse-muted">
              No team attendance records found for {selectedDate}.
            </div>
          ) : (
            <div className="overflow-x-auto mt-3">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-pulse-border bg-pulse-hover/50 text-pulse-muted">
                    <th className="px-3 py-2.5 font-semibold">Employee</th>
                    <th className="px-3 py-2.5 font-semibold">Job Title</th>
                    <th className="px-3 py-2.5 font-semibold">Check In</th>
                    <th className="px-3 py-2.5 font-semibold">Check Out</th>
                    <th className="px-3 py-2.5 font-semibold">Hours</th>
                    <th className="px-3 py-2.5 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-pulse-border">
                  {(teamRoster.data?.results ?? []).map((row, i) => (
                    <tr key={i} className="hover:bg-pulse-hover/60">
                      <td className="px-3 py-2.5 font-medium text-pulse-ink">{row.employee_name}</td>
                      <td className="px-3 py-2.5 text-pulse-muted">{row.job_title}</td>
                      <td className="px-3 py-2.5 font-mono text-pulse-ink">{row.check_in ? row.check_in.slice(11, 16) : "--:--"}</td>
                      <td className="px-3 py-2.5 font-mono text-pulse-ink">{row.check_out ? row.check_out.slice(11, 16) : "--:--"}</td>
                      <td className="px-3 py-2.5 font-mono text-pulse-muted">
                        {row.minutes_worked ? `${(row.minutes_worked / 60).toFixed(1)}h` : "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            row.status === "present"
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                              : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
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
      )}

      {/* SUB-TAB 3: Correction Approvals Queue */}
      {activeSubTab === "corrections_queue" && (
        <section className={panelClass}>
          <h3 className="text-base font-bold text-pulse-ink mb-3">Pending Attendance Corrections</h3>
          {(pendingCorrectionsQueue.data?.results ?? []).length === 0 ? (
            <div className="py-8 text-center text-xs text-pulse-muted">
              ✨ No pending attendance correction requests to review.
            </div>
          ) : (
            <div className="space-y-3">
              {(pendingCorrectionsQueue.data?.results ?? []).map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border border-pulse-border bg-pulse-hover/30 p-3.5 space-y-2 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-bold text-pulse-ink text-sm">{item.employee_name}</span>
                      <span className="ml-2 text-pulse-muted">requested a punch adjustment</span>
                    </div>
                    <span className="text-[11px] text-pulse-muted">{item.created_at?.slice(0, 10)}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 rounded bg-pulse-surface p-2 border border-pulse-border text-[11px]">
                    <div>
                      <span className="text-pulse-muted">Requested In: </span>
                      <span className="font-mono font-medium text-pulse-ink">{item.requested_check_in ? item.requested_check_in.slice(0, 16) : "None"}</span>
                    </div>
                    <div>
                      <span className="text-pulse-muted">Requested Out: </span>
                      <span className="font-mono font-medium text-pulse-ink">{item.requested_check_out ? item.requested_check_out.slice(0, 16) : "None"}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-pulse-muted">Reason: </span>
                      <span className="text-pulse-ink font-medium">{item.reason}</span>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => decideCorrection.mutate({ id: item.id, status: "rejected", note: "Correction rejected" })}
                    >
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => decideCorrection.mutate({ id: item.id, status: "approved", note: "Approved by supervisor" })}
                    >
                      Approve Correction
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* SUB-TAB 4: Attendance Exceptions Queue */}
      {activeSubTab === "exceptions_queue" && (
        <section className={panelClass}>
          <h3 className="text-base font-bold text-pulse-ink mb-3">Open Attendance Exceptions</h3>
          {(openExceptions.data?.results ?? []).length === 0 ? (
            <div className="py-8 text-center text-xs text-pulse-muted">
              ✨ No open attendance exceptions. All records resolved.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-pulse-border bg-pulse-hover/50 text-pulse-muted">
                    <th className="px-3 py-2.5 font-semibold">Employee</th>
                    <th className="px-3 py-2.5 font-semibold">Exception Type</th>
                    <th className="px-3 py-2.5 font-semibold">Date Logged</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-pulse-border">
                  {(openExceptions.data?.results ?? []).map((exc) => (
                    <tr key={exc.id} className="hover:bg-pulse-hover/60">
                      <td className="px-3 py-2.5 font-semibold text-pulse-ink">{exc.employee_name}</td>
                      <td className="px-3 py-2.5 text-rose-600 font-medium capitalize">{exc.exception_type}</td>
                      <td className="px-3 py-2.5 text-pulse-muted">{exc.created_at?.slice(0, 10)}</td>
                      <td className="px-3 py-2.5 text-right">
                        <Button size="sm" onClick={() => setSelectedException(exc)}>
                          Resolve Exception
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Request Correction Modal */}
      {showCorrectionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg border border-pulse-border bg-pulse-surface p-5 shadow-xl space-y-3">
            <h3 className="text-base font-bold text-pulse-ink">Request Attendance Correction</h3>
            <p className="text-xs text-pulse-muted">
              Submit an adjustment request for supervisor review.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitCorrection.mutate();
              }}
              className="space-y-3 text-xs"
            >
              <label className="block">
                <span className="font-semibold text-pulse-ink">Requested Check-In</span>
                <input
                  type="datetime-local"
                  value={corrCheckIn}
                  onChange={(e) => setCorrCheckIn(e.target.value)}
                  className="mt-1 block w-full rounded border border-pulse-border bg-pulse-surface px-2.5 py-1.5 text-xs text-pulse-ink"
                />
              </label>

              <label className="block">
                <span className="font-semibold text-pulse-ink">Requested Check-Out</span>
                <input
                  type="datetime-local"
                  value={corrCheckOut}
                  onChange={(e) => setCorrCheckOut(e.target.value)}
                  className="mt-1 block w-full rounded border border-pulse-border bg-pulse-surface px-2.5 py-1.5 text-xs text-pulse-ink"
                />
              </label>

              <label className="block">
                <span className="font-semibold text-pulse-ink">Reason *</span>
                <textarea
                  required
                  rows={2}
                  placeholder="e.g. Forgot to check out before leaving client site"
                  value={corrReason}
                  onChange={(e) => setCorrReason(e.target.value)}
                  className="mt-1 block w-full rounded border border-pulse-border bg-pulse-surface px-2.5 py-1.5 text-xs text-pulse-ink"
                />
              </label>

              <div className="flex justify-end gap-2 pt-2 border-t border-pulse-border">
                <Button variant="secondary" type="button" onClick={() => setShowCorrectionModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitCorrection.isPending}>
                  Submit Request
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Resolve Exception Modal */}
      {selectedException && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg border border-pulse-border bg-pulse-surface p-5 shadow-xl space-y-3">
            <h3 className="text-base font-bold text-pulse-ink">Resolve Attendance Exception</h3>
            <p className="text-xs text-pulse-muted">
              Exception for <strong>{selectedException.employee_name}</strong> ({selectedException.exception_type}).
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                resolveException.mutate({
                  id: selectedException.id,
                  note: resolutionNote,
                });
              }}
              className="space-y-3 text-xs"
            >
              <label className="block">
                <span className="font-semibold text-pulse-ink">Resolution Note *</span>
                <textarea
                  required
                  rows={2}
                  placeholder="e.g. Confirmed on duty via client meeting logs"
                  value={resolutionNote}
                  onChange={(e) => setResolutionNote(e.target.value)}
                  className="mt-1 block w-full rounded border border-pulse-border bg-pulse-surface px-2.5 py-1.5 text-xs text-pulse-ink"
                />
              </label>
              <div className="flex justify-end gap-2 pt-2 border-t border-pulse-border">
                <Button variant="secondary" type="button" onClick={() => setSelectedException(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={resolveException.isPending}>
                  Confirm Resolution
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
