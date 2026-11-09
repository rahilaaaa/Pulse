import type { HrmsNavTab } from "./types";

interface NavItem {
  id: HrmsNavTab;
  label: string;
  badge?: number | null;
  requiresPermission?: string[];
}

interface HrmsNavigationProps {
  activeTab: HrmsNavTab;
  onTabChange: (tab: HrmsNavTab) => void;
  permissions: string[];
  badges?: {
    leave?: number;
    attendance?: number;
    onboarding?: number;
    helpdesk?: number;
  };
  roleBadgeText?: string;
}

export function HrmsNavigation({
  activeTab,
  onTabChange,
  permissions,
  badges,
  roleBadgeText,
}: HrmsNavigationProps) {
  const can = (code: string) => permissions.includes(code);

  const canViewPayroll =
    can("hrms.payroll.view") ||
    can("hrms.compensation.view") ||
    can("hrms.payroll.calculate") ||
    can("hrms.compensation.own.view") ||
    can("hrms.payroll.payslip.own");

  const canViewSettings =
    can("hrms.admin.view") ||
    can("hrms.activation.view") ||
    can("hrms.activation.manage") ||
    can("hrms.location.manage");

  const canViewReports =
    can("hrms.employee.view") ||
    can("hrms.admin.view") ||
    can("hrms.manager.view");

  const items: NavItem[] = [
    { id: "overview", label: "Overview" },
    { id: "people", label: "People" },
    { id: "attendance", label: "Attendance", badge: badges?.attendance },
    { id: "leave", label: "Leave & Time Off", badge: badges?.leave },
    ...(canViewPayroll ? [{ id: "payroll" as HrmsNavTab, label: "Payroll" }] : []),
    { id: "onboarding", label: "Onboarding", badge: badges?.onboarding },
    { id: "helpdesk", label: "Helpdesk", badge: badges?.helpdesk },
    ...(canViewReports ? [{ id: "reports" as HrmsNavTab, label: "Reports" }] : []),
    ...(canViewSettings ? [{ id: "settings" as HrmsNavTab, label: "Settings" }] : []),
  ];

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-pulse-border pb-1">
      <nav className="flex items-center gap-1 overflow-x-auto no-scrollbar py-1" aria-label="HRMS Navigation">
        {items.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onTabChange(item.id)}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition ${
                isActive
                  ? "bg-pulse-accent text-white shadow-sm font-semibold"
                  : "text-pulse-muted hover:bg-pulse-hover hover:text-pulse-ink"
              }`}
            >
              <span>{item.label}</span>
              {Boolean(item.badge && item.badge > 0) && (
                <span
                  className={`inline-flex items-center justify-center rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                    isActive ? "bg-white text-pulse-accent" : "bg-pulse-accent/15 text-pulse-accent"
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {roleBadgeText && (
        <div className="flex items-center gap-2 self-end sm:self-center">
          <span className="rounded-full border border-pulse-border bg-pulse-surface px-2.5 py-1 text-xs font-medium text-pulse-muted">
            Role: <strong className="text-pulse-ink">{roleBadgeText}</strong>
          </span>
        </div>
      )}
    </div>
  );
}

