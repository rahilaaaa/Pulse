import { useQuery } from "@tanstack/react-query";
import { Component, useEffect, useState, type ReactNode } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../../shared/api/client";
import { ErrorState, LoadingState } from "../../shared/ui/States";
import { HrmsNavigation } from "../hrms/HrmsNavigation";
import type {
  Activation,
  Employment,
  HrmsDashboardOverview,
  HrmsNavTab,
} from "../hrms/types";
import { AttendanceView } from "../hrms/views/AttendanceView";
import { HelpdeskView } from "../hrms/views/HelpdeskView";
import { LeaveView } from "../hrms/views/LeaveView";
import { OnboardingView } from "../hrms/views/OnboardingView";
import { OverviewView } from "../hrms/views/OverviewView";
import { PayrollView } from "../hrms/views/PayrollView";
import { PeopleView } from "../hrms/views/PeopleView";
import { ReportsView } from "../hrms/views/ReportsView";
import { SettingsView } from "../hrms/views/SettingsView";
import type { WorkspacePayload } from "./types";

const labelClass = "text-xs font-semibold uppercase tracking-wider text-pulse-muted";

function errorText(error: unknown) {
  return error instanceof ApiError ? error.message : "The request could not be completed.";
}

type ErrorBoundaryProps = { children: ReactNode };
type ErrorBoundaryState = { hasError: boolean; error: Error | null };

class WorkspaceErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error("HRMS workspace render error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorState
          title="Section temporarily unavailable"
          body={this.state.error?.message || "An unexpected error occurred while rendering this section."}
        />
      );
    }
    return this.props.children;
  }
}

interface HrmsPageProps {
  defaultTab?: HrmsNavTab;
}

export function HrmsPage({ defaultTab }: HrmsPageProps) {
  const workspace = useOutletContext<WorkspacePayload>();
  const companyId = workspace.company.id;
  const permissions = workspace.permissions;
  const can = (code: string) => permissions.includes(code);
  const root = `/api/v1/companies/${companyId}/hrms`;

  // Search parameters for deep linking
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get("tab") as HrmsNavTab | null;
  const activeTab: HrmsNavTab = urlTab || defaultTab || "overview";

  const handleTabChange = (tab: HrmsNavTab) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", tab);
      return next;
    });
  };

  // Queries
  const activation = useQuery({
    queryKey: ["hrms-activation", companyId],
    queryFn: () => api<Activation>(`${root}/activation/`),
    enabled: can("hrms.activation.view") || can("hrms.admin.view"),
  });

  const myEmployments = useQuery({
    queryKey: ["hrms-my-employments", companyId],
    queryFn: () => api<{ results: Employment[] }>(`${root}/me/employments/`),
  });

  const allEmployments = useQuery({
    queryKey: ["hrms-employments-directory", companyId],
    queryFn: () => api<{ results: Employment[] }>(`${root}/employments/`),
    enabled: can("hrms.employee.view"),
  });

  const dashboardQuery = useQuery({
    queryKey: ["hrms-dashboard", companyId],
    queryFn: () => api<HrmsDashboardOverview>(`${root}/dashboard/`),
    enabled: can("hrms.leave.view"),
  });

  const ownEmployments = myEmployments.data?.results ?? [];
  const activeOwn = ownEmployments.filter((row) => row.status === "active");
  const directoryEmployments = allEmployments.data?.results ?? ownEmployments;

  // Selected Employment Context (support multiple concurrent or historical employments)
  const [selectedEmploymentId, setSelectedEmploymentId] = useState("");
  useEffect(() => {
    if (!selectedEmploymentId && activeOwn.length > 0) {
      setSelectedEmploymentId(activeOwn[0].id);
    } else if (!selectedEmploymentId && ownEmployments.length > 0) {
      setSelectedEmploymentId(ownEmployments[0].id);
    }
  }, [selectedEmploymentId, activeOwn, ownEmployments]);

  // Quick Action triggered states
  const [showAddEmpFromQuickAction, setShowAddEmpFromQuickAction] = useState(false);

  // Determine user role badge
  const isHrAdmin = can("hrms.admin.view") || can("hrms.employee.manage") || can("hrms.activation.view");
  const isManager = can("hrms.manager.view") || can("hrms.leave.decide") || can("hrms.attendance.manage");
  const roleBadgeText = isHrAdmin ? "HR Administrator" : isManager ? "Manager" : "Employee";

  const attendanceActivated = Boolean(activation.data?.readiness?.attendance?.activated);
  const dbData = dashboardQuery.data;

  // Calculate live badge counts
  const badges = {
    leave: dbData?.pending_actions?.leave_requests,
    attendance: (dbData?.attendance?.open_exceptions ?? 0) + (dbData?.pending_actions?.attendance_corrections ?? 0),
    onboarding: dbData?.tasks?.open_onboarding,
    helpdesk: dbData?.requests?.open_hr_requests,
  };

  if (myEmployments.isLoading) {
    return <LoadingState label="Loading HR profile..." />;
  }

  return (
    <div className="space-y-5">
      {/* Non-blocking Activation notice if configuration needs attention */}
      {activation.isError && can("hrms.activation.view") && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 flex items-center justify-between">
          <span>HRMS feature configuration notice: {errorText(activation.error)}</span>
          <button
            type="button"
            onClick={() => activation.refetch()}
            className="ml-3 font-semibold underline hover:text-amber-950"
          >
            Retry
          </button>
        </div>
      )}

      {/* Main Top Header */}
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-pulse-border pb-4">
        <div>
          <p className={labelClass}>Human Resource Management System</p>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="text-2xl font-black tracking-tight text-pulse-ink">HRMS Workspace</h1>
            <span className="rounded-full bg-pulse-hover px-2.5 py-0.5 text-xs font-semibold text-pulse-muted">
              {workspace.company.display_name}
            </span>
          </div>
        </div>

        {/* Active Employment Context Selector (if multiple records exist) */}
        {ownEmployments.length > 1 && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-pulse-muted font-medium">Context:</span>
            <select
              value={selectedEmploymentId}
              onChange={(e) => setSelectedEmploymentId(e.target.value)}
              className="rounded-md border border-pulse-border bg-pulse-surface px-2.5 py-1 text-xs font-semibold text-pulse-ink"
            >
              {ownEmployments.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.employee_number} · {emp.job_title}
                </option>
              ))}
            </select>
          </div>
        )}
      </header>

      {/* Unified 9-Item HRMS Navigation Bar */}
      <HrmsNavigation
        activeTab={activeTab}
        onTabChange={handleTabChange}
        permissions={permissions}
        badges={badges}
        roleBadgeText={roleBadgeText}
      />

      {/* Section View wrapped in Error Boundary */}
      <WorkspaceErrorBoundary key={activeTab}>
        {activeTab === "overview" && (
          <OverviewView
            companyId={companyId}
            permissions={permissions}
            dashboardData={dbData}
            onNavigateTab={handleTabChange}
            onAddEmployee={() => {
              setShowAddEmpFromQuickAction(true);
              handleTabChange("people");
            }}
            onMarkAttendance={() => handleTabChange("attendance")}
            attendanceActivated={attendanceActivated}
          />
        )}

        {activeTab === "people" && (
          <PeopleView
            companyId={companyId}
            permissions={permissions}
            employments={directoryEmployments}
            onRefreshEmployments={() => {
              allEmployments.refetch();
              myEmployments.refetch();
              dashboardQuery.refetch();
            }}
            showAddModalInitial={showAddEmpFromQuickAction}
            onCloseAddModal={() => setShowAddEmpFromQuickAction(false)}
          />
        )}

        {activeTab === "attendance" && (
          <AttendanceView
            companyId={companyId}
            permissions={permissions}
            selectedEmploymentId={selectedEmploymentId}
          />
        )}

        {activeTab === "leave" && (
          <LeaveView
            companyId={companyId}
            permissions={permissions}
          />
        )}

        {activeTab === "payroll" && (
          <PayrollView
            companyId={companyId}
            permissions={permissions}
            employments={directoryEmployments}
          />
        )}

        {activeTab === "onboarding" && (
          <OnboardingView
            companyId={companyId}
            permissions={permissions}
            employments={directoryEmployments}
            selectedEmploymentId={selectedEmploymentId}
          />
        )}

        {activeTab === "helpdesk" && (
          <HelpdeskView
            companyId={companyId}
            permissions={permissions}
            selectedEmploymentId={selectedEmploymentId}
          />
        )}

        {activeTab === "reports" && (
          <ReportsView
            companyId={companyId}
          />
        )}

        {activeTab === "settings" && (
          <SettingsView
            companyId={companyId}
            activation={activation.data}
            onRefreshActivation={() => activation.refetch()}
          />
        )}
      </WorkspaceErrorBoundary>
    </div>
  );
}
