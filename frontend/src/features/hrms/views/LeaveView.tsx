import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, ApiError } from "../../../shared/api/client";
import { Button } from "../../../shared/ui/Button";
import type { BalanceRow, CompanyHolidayRow, LeaveRow, TeamCalendarEvent } from "../types";

const panelClass = "rounded-lg border border-pulse-border bg-pulse-surface p-4 shadow-sm";
const labelClass = "text-xs font-semibold uppercase tracking-wider text-pulse-muted";

function errorText(error: unknown) {
  return error instanceof ApiError ? error.message : "The request could not be completed.";
}

interface LeaveViewProps {
  companyId: string;
  permissions: string[];
}

export function LeaveView({ companyId, permissions }: LeaveViewProps) {
  const queryClient = useQueryClient();
  const can = (code: string) => permissions.includes(code);
  const root = `/api/v1/companies/${companyId}/hrms`;

  const canRequest = can("hrms.leave.request");
  const canDecide = can("hrms.leave.decide") || can("hrms.manager.view") || can("hrms.admin.view");

  type SubTab = "my_leave" | "approvals" | "calendar" | "holidays";
  const [activeTab, setActiveTab] = useState<SubTab>("my_leave");

  // Request Leave Modal
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [reason, setReason] = useState("");

  // Feedback
  const [feedback, setFeedback] = useState<string | null>(null);

  // Add Holiday Modal (Admin)
  const [showHolidayModal, setShowHolidayModal] = useState(false);
  const [holidayName, setHolidayName] = useState("");
  const [holidayDate, setHolidayDate] = useState("");

  // Queries
  const leaveRequests = useQuery({
    queryKey: ["hrms-leave-requests", companyId],
    queryFn: () => api<{ results: LeaveRow[] }>(`${root}/leave-requests/`),
  });

  const leaveBalances = useQuery({
    queryKey: ["hrms-leave-balances", companyId],
    queryFn: () => api<{ results: BalanceRow[] }>(`${root}/leave-balances/`),
  });

  const teamCalendar = useQuery({
    queryKey: ["hrms-team-calendar", companyId],
    queryFn: () => api<{ results: TeamCalendarEvent[] }>(`${root}/team/calendar/`),
  });

  const holidays = useQuery({
    queryKey: ["hrms-holidays", companyId],
    queryFn: () => api<{ results: CompanyHolidayRow[] }>(`${root}/holidays/`),
  });

  // Mutations
  const requestLeave = useMutation({
    mutationFn: (values: { starts_on: string; ends_on: string; reason: string }) =>
      api(`${root}/leave-requests/`, {
        method: "POST",
        body: JSON.stringify(values),
      }),
    onSuccess: async () => {
      setFeedback("Leave request submitted successfully.");
      setShowRequestModal(false);
      setStartsOn("");
      setEndsOn("");
      setReason("");
      await queryClient.invalidateQueries({ queryKey: ["hrms-leave-requests", companyId] });
      await queryClient.invalidateQueries({ queryKey: ["hrms-leave-balances", companyId] });
      await queryClient.invalidateQueries({ queryKey: ["hrms-dashboard", companyId] });
    },
    onError: (err) => setFeedback(errorText(err)),
  });

  const decideLeave = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "approved" | "rejected" }) =>
      api(`${root}/leave-requests/${id}/decision/`, {
        method: "POST",
        body: JSON.stringify({ status }),
      }),
    onSuccess: async (_, { status }) => {
      setFeedback(`Leave request marked as ${status}.`);
      await queryClient.invalidateQueries({ queryKey: ["hrms-leave-requests", companyId] });
      await queryClient.invalidateQueries({ queryKey: ["hrms-leave-balances", companyId] });
      await queryClient.invalidateQueries({ queryKey: ["hrms-dashboard", companyId] });
    },
    onError: (err) => setFeedback(errorText(err)),
  });

  const createHoliday = useMutation({
    mutationFn: (data: { name: string; holiday_date: string }) =>
      api(`${root}/holidays/`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: async () => {
      setFeedback("Holiday added to company calendar.");
      setShowHolidayModal(false);
      setHolidayName("");
      setHolidayDate("");
      await queryClient.invalidateQueries({ queryKey: ["hrms-holidays", companyId] });
    },
    onError: (err) => setFeedback(errorText(err)),
  });

  const allRequests = leaveRequests.data?.results ?? [];
  const balanceRows = leaveBalances.data?.results ?? [];
  const pendingRequests = allRequests.filter((r) => r.status === "pending");
  const calendarEvents = teamCalendar.data?.results ?? [];
  const holidayRows = holidays.data?.results ?? [];

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

      {/* Leave Sub-Nav & Action Header */}
      <section className={panelClass}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-pulse-ink">Leave & Time-Off Portal</h2>
            <p className="text-xs text-pulse-muted">
              Manage time-off requests, personal balances, supervisor approvals, and team schedule.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {canRequest && (
              <Button onClick={() => setShowRequestModal(true)}>
                + Request Time Off
              </Button>
            )}
          </div>
        </div>

        {/* Sub-Tabs Bar */}
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-pulse-border pt-3 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab("my_leave")}
            className={`rounded-md px-3 py-1.5 font-semibold transition ${
              activeTab === "my_leave"
                ? "bg-pulse-accent text-white shadow-sm"
                : "bg-pulse-hover text-pulse-muted hover:text-pulse-ink"
            }`}
          >
            My Balances & Requests
          </button>

          {canDecide && (
            <button
              type="button"
              onClick={() => setActiveTab("approvals")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-semibold transition ${
                activeTab === "approvals"
                  ? "bg-pulse-accent text-white shadow-sm"
                  : "bg-pulse-hover text-pulse-muted hover:text-pulse-ink"
              }`}
            >
              <span>Approval Queue</span>
              {pendingRequests.length > 0 && (
                <span className="rounded-full bg-amber-500 text-white px-1.5 py-0.2 text-[10px] font-bold">
                  {pendingRequests.length}
                </span>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={() => setActiveTab("calendar")}
            className={`rounded-md px-3 py-1.5 font-semibold transition ${
              activeTab === "calendar"
                ? "bg-pulse-accent text-white shadow-sm"
                : "bg-pulse-hover text-pulse-muted hover:text-pulse-ink"
            }`}
          >
            Team Leave Calendar
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("holidays")}
            className={`rounded-md px-3 py-1.5 font-semibold transition ${
              activeTab === "holidays"
                ? "bg-pulse-accent text-white shadow-sm"
                : "bg-pulse-hover text-pulse-muted hover:text-pulse-ink"
            }`}
          >
            Company Holidays
          </button>
        </div>
      </section>

      {/* SUB-TAB 1: My Leave & Balances */}
      {activeTab === "my_leave" && (
        <div className="space-y-4">
          {/* Leave Balances Grid */}
          {balanceRows.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {balanceRows.map((b) => (
                <div key={b.id} className={panelClass}>
                  <div className="flex items-center justify-between">
                    <span className={labelClass}>{b.policy}</span>
                    <span className="text-xs text-pulse-muted">{b.year}</span>
                  </div>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-2xl font-black text-pulse-ink">{b.remaining_days}</span>
                    <span className="text-xs text-pulse-muted">/ {b.allocated_days} days left</span>
                  </div>
                  <div className="mt-2 h-1.5 w-full bg-pulse-hover rounded-full overflow-hidden">
                    <div
                      className="h-full bg-pulse-accent rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.min(100, Math.max(0, (b.remaining_days / (b.allocated_days || 1)) * 100))}%`,
                      }}
                    />
                  </div>
                  <p className="mt-1.5 text-[11px] text-pulse-muted">
                    {b.used_days} days utilized this year
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Leave Requests Table */}
          <section className={`${panelClass} overflow-hidden p-0`}>
            <div className="p-4 border-b border-pulse-border">
              <h3 className="text-base font-bold text-pulse-ink">Time-Off Request History</h3>
            </div>
            {allRequests.length === 0 ? (
              <div className="p-8 text-center text-xs text-pulse-muted">
                No leave requests found. Click "+ Request Time Off" above to submit a new request.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-pulse-border bg-pulse-hover/50 text-pulse-muted">
                      <th className="px-4 py-3 font-semibold">Applicant</th>
                      <th className="px-4 py-3 font-semibold">Policy</th>
                      <th className="px-4 py-3 font-semibold">Duration</th>
                      <th className="px-4 py-3 font-semibold">Days</th>
                      <th className="px-4 py-3 font-semibold">Reason</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-pulse-border">
                    {allRequests.map((r) => (
                      <tr key={r.id} className="hover:bg-pulse-hover/60">
                        <td className="px-4 py-3 font-medium text-pulse-ink">{r.person_name || r.person}</td>
                        <td className="px-4 py-3 text-pulse-muted">{r.leave_type_name || r.policy}</td>
                        <td className="px-4 py-3 font-mono text-pulse-ink">
                          {r.starts_on || r.start_date} &rarr; {r.ends_on || r.end_date}
                        </td>
                        <td className="px-4 py-3 font-semibold text-pulse-ink">{r.days ?? "—"}</td>
                        <td className="px-4 py-3 text-pulse-muted max-w-xs truncate">{r.reason || "—"}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              r.status === "approved"
                                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                                : r.status === "pending"
                                ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                                : "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                            }`}
                          >
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
        </div>
      )}

      {/* SUB-TAB 2: Approval Queue (Manager/Admin) */}
      {activeTab === "approvals" && (
        <section className={panelClass}>
          <h3 className="text-base font-bold text-pulse-ink mb-3">Pending Supervisor Approvals</h3>
          {pendingRequests.length === 0 ? (
            <div className="py-8 text-center text-xs text-pulse-muted">
              ✨ No pending leave requests to decide. All employee time-off queues are clear.
            </div>
          ) : (
            <div className="space-y-3">
              {pendingRequests.map((req) => (
                <div
                  key={req.id}
                  className="rounded-lg border border-pulse-border bg-pulse-hover/30 p-4 space-y-2 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-bold text-pulse-ink text-sm">{req.person_name || req.person}</span>
                      <span className="ml-2 text-pulse-muted">({req.leave_type_name || req.policy})</span>
                    </div>
                    <span className="rounded bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">
                      Pending Decision
                    </span>
                  </div>

                  <div className="rounded bg-pulse-surface p-2.5 border border-pulse-border space-y-1 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-pulse-muted">Dates:</span>
                      <span className="font-mono font-medium text-pulse-ink">
                        {req.starts_on || req.start_date} to {req.ends_on || req.end_date}
                      </span>
                      {req.days && <span className="font-semibold text-pulse-accent">({req.days} days)</span>}
                    </div>
                    <div>
                      <span className="text-pulse-muted">Reason: </span>
                      <span className="text-pulse-ink font-medium">{req.reason || "None specified"}</span>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={decideLeave.isPending}
                      onClick={() => decideLeave.mutate({ id: req.id, status: "rejected" })}
                    >
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      disabled={decideLeave.isPending}
                      onClick={() => decideLeave.mutate({ id: req.id, status: "approved" })}
                    >
                      Approve Time-Off
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* SUB-TAB 3: Team Leave Calendar */}
      {activeTab === "calendar" && (
        <section className={panelClass}>
          <div className="flex items-center justify-between border-b border-pulse-border pb-3 mb-3">
            <div>
              <h3 className="text-base font-bold text-pulse-ink">Team Time-Off Calendar</h3>
              <p className="text-xs text-pulse-muted">Scheduled employee leaves and company public holidays.</p>
            </div>
          </div>

          {calendarEvents.length === 0 ? (
            <div className="py-8 text-center text-xs text-pulse-muted">
              No upcoming scheduled time-off events on the team calendar.
            </div>
          ) : (
            <div className="space-y-2">
              {calendarEvents.map((evt) => (
                <div
                  key={evt.id}
                  className="flex items-center justify-between rounded-lg border border-pulse-border bg-pulse-hover/40 p-3 text-xs"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-base">{evt.event_type === "holiday" ? "🎉" : "🏖️"}</span>
                    <div>
                      <p className="font-semibold text-pulse-ink">{evt.employee_name || evt.label}</p>
                      <p className="text-pulse-muted">{evt.label}</p>
                    </div>
                  </div>
                  <div className="font-mono text-pulse-ink font-medium text-[11px] bg-pulse-surface px-2.5 py-1 rounded border border-pulse-border">
                    {evt.start_date} {evt.end_date !== evt.start_date ? `→ ${evt.end_date}` : ""}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* SUB-TAB 4: Company Holidays */}
      {activeTab === "holidays" && (
        <section className={panelClass}>
          <div className="flex items-center justify-between border-b border-pulse-border pb-3 mb-3">
            <div>
              <h3 className="text-base font-bold text-pulse-ink">Company Holidays</h3>
              <p className="text-xs text-pulse-muted">Official observed non-working days for all personnel.</p>
            </div>
            {can("hrms.admin.view") && (
              <Button size="sm" onClick={() => setShowHolidayModal(true)}>
                + Add Holiday
              </Button>
            )}
          </div>

          {holidayRows.length === 0 ? (
            <div className="py-8 text-center text-xs text-pulse-muted">
              No company holidays configured.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-pulse-border bg-pulse-hover/50 text-pulse-muted">
                    <th className="px-4 py-2.5 font-semibold">Holiday Name</th>
                    <th className="px-4 py-2.5 font-semibold">Observed Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-pulse-border">
                  {holidayRows.map((h) => (
                    <tr key={h.id} className="hover:bg-pulse-hover/60">
                      <td className="px-4 py-2.5 font-semibold text-pulse-ink">{h.name}</td>
                      <td className="px-4 py-2.5 font-mono text-pulse-muted">{h.holiday_date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Request Leave Modal */}
      {showRequestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg border border-pulse-border bg-pulse-surface p-5 shadow-xl space-y-3">
            <h3 className="text-base font-bold text-pulse-ink">Request Time Off</h3>
            <p className="text-xs text-pulse-muted">
              Submit your absence request for supervisor approval.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                requestLeave.mutate({ starts_on: startsOn, ends_on: endsOn, reason });
              }}
              className="space-y-3 text-xs"
            >
              <label className="block">
                <span className="font-semibold text-pulse-ink">Start Date *</span>
                <input
                  type="date"
                  required
                  value={startsOn}
                  onChange={(e) => setStartsOn(e.target.value)}
                  className="mt-1 block w-full rounded border border-pulse-border bg-pulse-surface px-2.5 py-1.5 text-xs text-pulse-ink"
                />
              </label>

              <label className="block">
                <span className="font-semibold text-pulse-ink">End Date *</span>
                <input
                  type="date"
                  required
                  value={endsOn}
                  onChange={(e) => setEndsOn(e.target.value)}
                  className="mt-1 block w-full rounded border border-pulse-border bg-pulse-surface px-2.5 py-1.5 text-xs text-pulse-ink"
                />
              </label>

              <label className="block">
                <span className="font-semibold text-pulse-ink">Reason</span>
                <textarea
                  rows={2}
                  placeholder="e.g. Annual family vacation"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="mt-1 block w-full rounded border border-pulse-border bg-pulse-surface px-2.5 py-1.5 text-xs text-pulse-ink"
                />
              </label>

              <div className="flex justify-end gap-2 pt-2 border-t border-pulse-border">
                <Button variant="secondary" type="button" onClick={() => setShowRequestModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={requestLeave.isPending}>
                  {requestLeave.isPending ? "Submitting..." : "Submit Request"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Holiday Modal */}
      {showHolidayModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg border border-pulse-border bg-pulse-surface p-5 shadow-xl space-y-3">
            <h3 className="text-base font-bold text-pulse-ink">Add Company Holiday</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createHoliday.mutate({ name: holidayName, holiday_date: holidayDate });
              }}
              className="space-y-3 text-xs"
            >
              <label className="block">
                <span className="font-semibold text-pulse-ink">Holiday Name *</span>
                <input
                  type="text"
                  required
                  placeholder="e.g. New Year's Day"
                  value={holidayName}
                  onChange={(e) => setHolidayName(e.target.value)}
                  className="mt-1 block w-full rounded border border-pulse-border bg-pulse-surface px-2.5 py-1.5 text-xs text-pulse-ink"
                />
              </label>
              <label className="block">
                <span className="font-semibold text-pulse-ink">Date *</span>
                <input
                  type="date"
                  required
                  value={holidayDate}
                  onChange={(e) => setHolidayDate(e.target.value)}
                  className="mt-1 block w-full rounded border border-pulse-border bg-pulse-surface px-2.5 py-1.5 text-xs text-pulse-ink"
                />
              </label>
              <div className="flex justify-end gap-2 pt-2 border-t border-pulse-border">
                <Button variant="secondary" type="button" onClick={() => setShowHolidayModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createHoliday.isPending}>
                  Save Holiday
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
