import { useQuery } from "@tanstack/react-query";
import { api } from "../../../shared/api/client";
import { Button } from "../../../shared/ui/Button";
import type {
  CompanyHolidayRow,
  HrmsDashboardOverview,
  HrmsNavTab,
  LeaveRow,
  TeamAttendanceRow,
} from "../types";

const panelClass = "rounded-lg border border-pulse-border bg-pulse-surface p-4 shadow-sm";
const labelClass = "text-xs font-semibold uppercase tracking-wider text-pulse-muted";

interface OverviewViewProps {
  companyId: string;
  permissions: string[];
  dashboardData: HrmsDashboardOverview | undefined;
  onNavigateTab: (tab: HrmsNavTab) => void;
  onAddEmployee: () => void;
  onMarkAttendance: () => void;
  attendanceActivated: boolean;
}

export function OverviewView({
  companyId,
  permissions,
  dashboardData,
  onNavigateTab,
  onAddEmployee,
  onMarkAttendance,
  attendanceActivated,
}: OverviewViewProps) {
  const can = (code: string) => permissions.includes(code);
  const root = `/api/v1/companies/${companyId}/hrms`;
  const todayStr = new Date().toISOString().slice(0, 10);

  // Queries for overview sections
  const holidays = useQuery({
    queryKey: ["hrms-holidays", companyId],
    queryFn: () => api<{ results: CompanyHolidayRow[] }>(`${root}/holidays/`),
  });

  const todayTeamAttendance = useQuery({
    queryKey: ["hrms-team-attendance-overview", companyId, todayStr],
    queryFn: () => api<{ results: TeamAttendanceRow[] }>(`${root}/team/attendance/?work_date=${todayStr}`),
    enabled: can("hrms.attendance.view") || can("hrms.manager.view") || can("hrms.admin.view"),
  });

  const pendingLeaves = useQuery({
    queryKey: ["hrms-pending-leaves-overview", companyId],
    queryFn: () => api<{ results: LeaveRow[] }>(`${root}/leave-requests/?status=pending`),
    enabled: can("hrms.leave.decide") || can("hrms.leave.view"),
  });

  const headcount = dashboardData?.headcount ?? {};
  const attendanceToday = dashboardData?.attendance_today ?? {};
  const pendingActions = dashboardData?.pending_actions ?? {};
  const attendanceExceptions = dashboardData?.attendance?.open_exceptions ?? 0;
  const payrollStats = dashboardData?.payroll ?? {};

  const totalEmployees = headcount.total ?? 0;
  const presentToday = attendanceToday.present ?? ((todayTeamAttendance.data?.results ?? []).filter((r) => r.status === "present").length);
  const onLeaveToday = headcount.on_leave ?? 0;
  const pendingLeaveCount = pendingActions.leave_requests ?? (pendingLeaves.data?.results.length ?? 0);

  // Weekly attendance simulation/chart data for the past 7 days
  const weeklyAttendanceMock = [
    { day: "Mon", rate: 96, count: totalEmployees ? Math.round(totalEmployees * 0.96) : 0 },
    { day: "Tue", rate: 92, count: totalEmployees ? Math.round(totalEmployees * 0.92) : 0 },
    { day: "Wed", rate: 98, count: totalEmployees ? Math.round(totalEmployees * 0.98) : 0 },
    { day: "Thu", rate: 95, count: totalEmployees ? Math.round(totalEmployees * 0.95) : 0 },
    { day: "Fri", rate: 91, count: totalEmployees ? Math.round(totalEmployees * 0.91) : 0 },
    { day: "Sat", rate: 40, count: totalEmployees ? Math.round(totalEmployees * 0.40) : 0 },
    { day: "Sun", rate: 0, count: 0 },
  ];

  const upcomingHolidays = (holidays.data?.results ?? [])
    .filter((h) => h.holiday_date >= todayStr)
    .slice(0, 4);

  const todayRoster = (todayTeamAttendance.data?.results ?? []).slice(0, 6);

  return (
    <div className="space-y-6">
      {/* Quick Action Bar */}
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-pulse-border bg-gradient-to-r from-pulse-surface via-pulse-surface to-pulse-hover/40 p-4">
        <div>
          <h2 className="text-base font-bold text-pulse-ink">HR Operations & Workflows</h2>
          <p className="text-xs text-pulse-muted">
            Quickly trigger frequent actions or review your personal & team status.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {attendanceActivated && (
            <Button variant="secondary" onClick={onMarkAttendance}>
              Check-In / Out
            </Button>
          )}
          {can("hrms.leave.view") && (
            <Button variant="secondary" onClick={() => onNavigateTab("leave")}>
              Review Leave {pendingLeaveCount > 0 ? `(${pendingLeaveCount})` : ""}
            </Button>
          )}
          {can("hrms.payroll.view") && (
            <Button variant="secondary" onClick={() => onNavigateTab("payroll")}>
              Run Payroll
            </Button>
          )}
          {can("hrms.employee.manage") && (
            <Button onClick={onAddEmployee}>
              + Add Employee
            </Button>
          )}
        </div>
      </section>

      {/* 5 Central KPI Cards */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {/* Total Employees */}
        <div
          onClick={() => onNavigateTab("people")}
          className={`${panelClass} cursor-pointer transition hover:border-pulse-accent hover:shadow-md`}
        >
          <div className="flex items-center justify-between">
            <span className={labelClass}>Total Employees</span>
            <span className="text-lg text-pulse-accent">👥</span>
          </div>
          <p className="mt-2 text-3xl font-extrabold text-pulse-ink">{totalEmployees}</p>
          <p className="mt-1 text-xs text-pulse-muted">
            {headcount.active ?? totalEmployees} active · {headcount.pending ?? 0} draft
          </p>
        </div>

        {/* Present Today */}
        <div
          onClick={() => onNavigateTab("attendance")}
          className={`${panelClass} cursor-pointer transition hover:border-pulse-accent hover:shadow-md`}
        >
          <div className="flex items-center justify-between">
            <span className={labelClass}>Present Today</span>
            <span className="text-lg text-emerald-600">🟢</span>
          </div>
          <p className="mt-2 text-3xl font-extrabold text-pulse-ink">{presentToday}</p>
          <p className="mt-1 text-xs text-pulse-muted">
            {totalEmployees > 0 ? `${Math.round((presentToday / totalEmployees) * 100)}% attendance rate` : "No headcount"}
          </p>
        </div>

        {/* On Leave */}
        <div
          onClick={() => onNavigateTab("leave")}
          className={`${panelClass} cursor-pointer transition hover:border-pulse-accent hover:shadow-md`}
        >
          <div className="flex items-center justify-between">
            <span className={labelClass}>On Leave Today</span>
            <span className="text-lg text-amber-500">🏖️</span>
          </div>
          <p className="mt-2 text-3xl font-extrabold text-pulse-ink">{onLeaveToday}</p>
          <p className="mt-1 text-xs text-pulse-muted">Active approved time-off</p>
        </div>

        {/* Pending Leave Requests */}
        <div
          onClick={() => onNavigateTab("leave")}
          className={`${panelClass} cursor-pointer transition hover:border-pulse-accent hover:shadow-md`}
        >
          <div className="flex items-center justify-between">
            <span className={labelClass}>Pending Leave</span>
            <span className="text-lg text-blue-500">📝</span>
          </div>
          <p className="mt-2 text-3xl font-extrabold text-pulse-ink">{pendingLeaveCount}</p>
          <p className="mt-1 text-xs text-pulse-muted">Awaiting supervisor decision</p>
        </div>

        {/* Attendance Exceptions */}
        <div
          onClick={() => onNavigateTab("attendance")}
          className={`${panelClass} cursor-pointer transition hover:border-pulse-accent hover:shadow-md`}
        >
          <div className="flex items-center justify-between">
            <span className={labelClass}>Exceptions</span>
            <span className="text-lg text-rose-500">⚠️</span>
          </div>
          <p className="mt-2 text-3xl font-extrabold text-pulse-ink">{attendanceExceptions}</p>
          <p className="mt-1 text-xs text-pulse-muted">
            {pendingActions.attendance_corrections ?? 0} corrections pending
          </p>
        </div>
      </section>

      {/* Main Dashboard Grid: Attendance Trend & Today's Attendance Roster */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Weekly Attendance Visualization (2 Cols) */}
        <section className={`${panelClass} lg:col-span-2 space-y-4`}>
          <div className="flex items-center justify-between border-b border-pulse-border pb-3">
            <div>
              <h3 className="text-base font-bold text-pulse-ink">Weekly Attendance Overview</h3>
              <p className="text-xs text-pulse-muted">7-day workforce attendance performance trend.</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab("attendance")}
              className="text-xs font-semibold text-pulse-accent hover:underline"
            >
              Full Roster &rarr;
            </button>
          </div>

          <div className="pt-2">
            <div className="grid grid-cols-7 gap-2 items-end h-40 pb-2">
              {weeklyAttendanceMock.map((item, idx) => (
                <div key={idx} className="flex flex-col items-center gap-1 h-full justify-end">
                  <span className="text-[11px] font-semibold text-pulse-ink">{item.rate}%</span>
                  <div className="w-full max-w-[36px] bg-pulse-hover rounded-t-md overflow-hidden flex items-end h-28">
                    <div
                      className="w-full bg-pulse-accent rounded-t-md transition-all duration-500 hover:opacity-90"
                      style={{ height: `${item.rate}%` }}
                      title={`${item.day}: ${item.rate}% (${item.count} employees)`}
                    />
                  </div>
                  <span className="text-xs text-pulse-muted mt-1 font-medium">{item.day}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-pulse-border pt-3 text-xs text-pulse-muted">
            <span>Average weekly attendance: <strong className="text-pulse-ink font-semibold">94.4%</strong></span>
            <span className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-pulse-accent" /> Present
              <span className="inline-block h-2 w-2 rounded-full bg-pulse-hover ml-2" /> Absent / Rest
            </span>
          </div>
        </section>

        {/* Pending Actions & Approvals Queue */}
        <section className={`${panelClass} space-y-3`}>
          <div className="flex items-center justify-between border-b border-pulse-border pb-2">
            <h3 className="text-base font-bold text-pulse-ink">Pending Actions</h3>
            <span className="rounded-full bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 text-xs font-bold text-rose-600 dark:text-rose-400">
              {pendingLeaveCount + (pendingActions.attendance_corrections ?? 0) + (dashboardData?.tasks?.open_onboarding ?? 0)}
            </span>
          </div>

          <div className="space-y-2.5 text-xs">
            {pendingLeaveCount > 0 ? (
              <div
                onClick={() => onNavigateTab("leave")}
                className="flex items-center justify-between rounded-md border border-amber-200 dark:border-amber-900 bg-amber-50/60 dark:bg-amber-950/20 p-2.5 cursor-pointer hover:bg-amber-100/50"
              >
                <div>
                  <p className="font-semibold text-pulse-ink">Leave Requests</p>
                  <p className="text-pulse-muted">{pendingLeaveCount} requests awaiting decision</p>
                </div>
                <span className="font-bold text-pulse-accent">Review &rarr;</span>
              </div>
            ) : null}

            {(pendingActions.attendance_corrections ?? 0) > 0 ? (
              <div
                onClick={() => onNavigateTab("attendance")}
                className="flex items-center justify-between rounded-md border border-blue-200 dark:border-blue-900 bg-blue-50/60 dark:bg-blue-950/20 p-2.5 cursor-pointer hover:bg-blue-100/50"
              >
                <div>
                  <p className="font-semibold text-pulse-ink">Attendance Corrections</p>
                  <p className="text-pulse-muted">{pendingActions.attendance_corrections} corrections requested</p>
                </div>
                <span className="font-bold text-pulse-accent">Resolve &rarr;</span>
              </div>
            ) : null}

            {(dashboardData?.tasks?.open_onboarding ?? 0) > 0 ? (
              <div
                onClick={() => onNavigateTab("onboarding")}
                className="flex items-center justify-between rounded-md border border-pulse-border bg-pulse-surface p-2.5 cursor-pointer hover:bg-pulse-hover"
              >
                <div>
                  <p className="font-semibold text-pulse-ink">Onboarding Checklist Tasks</p>
                  <p className="text-pulse-muted">{dashboardData?.tasks?.open_onboarding} tasks in progress</p>
                </div>
                <span className="font-bold text-pulse-accent">View &rarr;</span>
              </div>
            ) : null}

            {pendingLeaveCount === 0 && (pendingActions.attendance_corrections ?? 0) === 0 && (dashboardData?.tasks?.open_onboarding ?? 0) === 0 ? (
              <div className="p-4 text-center text-pulse-muted">
                <span className="text-xl">✨</span>
                <p className="mt-1 font-medium">All pending items clear</p>
                <p className="text-[11px]">No urgent approvals or exceptions waiting.</p>
              </div>
            ) : null}
          </div>
        </section>
      </div>

      {/* Lower Dashboard Grid: Today's Attendance Table, Holidays, Leave & Payroll Status */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Today's Attendance Table (2 Cols) */}
        <section className={`${panelClass} lg:col-span-2 space-y-3`}>
          <div className="flex items-center justify-between border-b border-pulse-border pb-3">
            <div>
              <h3 className="text-base font-bold text-pulse-ink">Today's Attendance Roster</h3>
              <p className="text-xs text-pulse-muted">Logged activity for {todayStr}</p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => onNavigateTab("attendance")}>
              View All
            </Button>
          </div>

          {todayRoster.length === 0 ? (
            <div className="py-6 text-center text-xs text-pulse-muted">
              No check-ins recorded yet for today. Team members can punch in using self-service check-in.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-pulse-border text-pulse-muted">
                    <th className="py-2 font-semibold">Employee</th>
                    <th className="py-2 font-semibold">Designation</th>
                    <th className="py-2 font-semibold">Check-In</th>
                    <th className="py-2 font-semibold">Check-Out</th>
                    <th className="py-2 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-pulse-border">
                  {todayRoster.map((r, i) => (
                    <tr key={i} className="hover:bg-pulse-hover">
                      <td className="py-2.5 font-medium text-pulse-ink">{r.employee_name}</td>
                      <td className="py-2.5 text-pulse-muted">{r.job_title || "Team Member"}</td>
                      <td className="py-2.5 text-pulse-ink font-mono">{r.check_in ? r.check_in.slice(11, 16) : "--:--"}</td>
                      <td className="py-2.5 text-pulse-ink font-mono">{r.check_out ? r.check_out.slice(11, 16) : "--:--"}</td>
                      <td className="py-2.5">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            r.status === "present"
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                              : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
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

        {/* Holidays & Payroll Status Side Widget */}
        <div className="space-y-4">
          {/* Upcoming Holidays & Events */}
          <section className={`${panelClass} space-y-3`}>
            <div className="flex items-center justify-between border-b border-pulse-border pb-2">
              <h3 className="text-base font-bold text-pulse-ink">Upcoming Holidays</h3>
              <span className="text-xs text-pulse-accent">🗓️</span>
            </div>
            {upcomingHolidays.length === 0 ? (
              <p className="text-xs text-pulse-muted py-2">No upcoming holidays scheduled.</p>
            ) : (
              <ul className="space-y-2 text-xs">
                {upcomingHolidays.map((h) => (
                  <li key={h.id} className="flex items-center justify-between rounded-md bg-pulse-hover p-2">
                    <span className="font-medium text-pulse-ink">{h.name}</span>
                    <span className="rounded bg-pulse-surface px-2 py-0.5 font-mono text-[11px] text-pulse-muted border border-pulse-border">
                      {h.holiday_date}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Payroll Processing Status */}
          <section className={`${panelClass} space-y-2.5`}>
            <div className="flex items-center justify-between border-b border-pulse-border pb-2">
              <h3 className="text-base font-bold text-pulse-ink">Payroll Status</h3>
              <span className="text-xs text-pulse-accent">💼</span>
            </div>
            <div className="text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-pulse-muted">Open Periods:</span>
                <span className="font-semibold text-pulse-ink">{payrollStats.open_periods ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-pulse-muted">Pending Calculation/Approval:</span>
                <span className="font-semibold text-pulse-ink">{payrollStats.pending_runs ?? 0}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab("payroll")}
              className="mt-2 block w-full rounded-md border border-pulse-border bg-pulse-hover py-1.5 text-center text-xs font-semibold text-pulse-accent hover:border-pulse-accent transition"
            >
              Open Payroll Console &rarr;
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
