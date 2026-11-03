import type { ProjectsNavTab } from "./types";

interface ProjectsNavigationProps {
  activeTab: ProjectsNavTab;
  onTabChange: (tab: ProjectsNavTab) => void;
  permissions: string[];
  badges?: {
    my_work?: number;
    tasks?: number;
    timesheets?: number;
  };
  roleBadgeText?: string;
}

export function ProjectsNavigation({
  activeTab,
  onTabChange,
  permissions,
  badges = {},
  roleBadgeText = "Team Member",
}: ProjectsNavigationProps) {
  const can = (code: string) => permissions.includes(code);

  const tabs: Array<{ id: ProjectsNavTab; label: string; badge?: number; visible: boolean }> = [
    { id: "overview", label: "Overview", visible: true },
    { id: "my_work", label: "My Work", badge: badges.my_work, visible: true },
    { id: "projects", label: "Projects", visible: true },
    { id: "tasks", label: "Tasks", badge: badges.tasks, visible: true },
    { id: "my_team", label: "My Team", visible: can("projects.manage") || can("departments.view") },
    { id: "calendar", label: "Calendar", visible: true },
    { id: "timesheets", label: "Timesheets", badge: badges.timesheets, visible: true },
    { id: "reports", label: "Reports", visible: can("projects.reports.view") || can("projects.manage") },
    { id: "settings", label: "Settings", visible: can("projects.admin") || can("projects.manage") },
  ];

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-pulse-border pb-3">
      {/* 9-Item Nav Pills */}
      <nav className="flex flex-wrap items-center gap-1.5" aria-label="Projects Work Navigation">
        {tabs
          .filter((t) => t.visible)
          .map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange(tab.id)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  isActive
                    ? "bg-pulse-accent text-white shadow-sm"
                    : "bg-pulse-surface text-pulse-muted hover:bg-pulse-hover hover:text-pulse-ink"
                }`}
              >
                <span>{tab.label}</span>
                {typeof tab.badge === "number" && tab.badge > 0 && (
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                      isActive
                        ? "bg-white text-pulse-accent"
                        : "bg-pulse-hover text-pulse-ink"
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
      </nav>

      {/* Role Context Indicator */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium text-pulse-muted">Role Perspective:</span>
        <span className="rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-bold text-teal-800 dark:bg-teal-950/40 dark:text-teal-300 border border-teal-200/50">
          {roleBadgeText}
        </span>
      </div>
    </div>
  );
}

