import { Link } from "react-router-dom";
import { ModuleIcon } from "./ModuleIcon";
import type { ModuleDetailData } from "../types";

interface PostInstallSuccessProps {
  module: ModuleDetailData;
  companyId: string;
  onClose: () => void;
  onOpenTutorials: () => void;
}

export function PostInstallSuccess({
  module,
  onClose,
  onOpenTutorials,
}: PostInstallSuccessProps) {
  const checklist = module.onboarding_checklist || [];
  const completedCount = checklist.filter((item) => item.completed).length;
  const totalCount = checklist.length;
  const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // Primary workspace route
  const workspaceRoute =
    module.slug === "hrms"
      ? "/app/hrms"
      : module.slug === "crm"
      ? "/app/crm"
      : module.slug === "projects"
      ? "/app/projects"
      : module.slug === "commerce"
      ? "/app/commerce"
      : "/app";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-pulse-border bg-pulse-surface shadow-2xl">
        {/* Celebration Header */}
        <div className="border-b border-pulse-border bg-gradient-to-r from-teal-500/10 via-emerald-500/10 to-transparent p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3.5">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-600 text-white shadow-lg shadow-teal-600/30">
                <ModuleIcon name={module.icon} size="lg" />
              </div>
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping"></span>
                  Installation Successful
                </span>
                <h2 className="mt-1 text-xl font-black text-pulse-ink">
                  {module.name} is Ready for Use
                </h2>
                <p className="text-xs text-pulse-muted">
                  Version {module.version} has been enabled and scoped to your workspace.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-pulse-muted hover:bg-pulse-hover hover:text-pulse-ink transition"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Quick Action Buttons */}
          <div className="mt-5 flex flex-wrap gap-2.5">
            <Link
              to={workspaceRoute}
              className="rounded-lg bg-teal-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-teal-700 transition flex items-center gap-1.5"
            >
              <span>Open {module.name} Workspace</span>
              <span>&rarr;</span>
            </Link>
            <button
              type="button"
              onClick={onOpenTutorials}
              className="rounded-lg border border-pulse-border bg-pulse-surface px-4 py-2 text-xs font-semibold text-pulse-ink hover:bg-pulse-hover transition flex items-center gap-1.5"
            >
              <span>View Tutorials & Guides</span>
            </button>
          </div>
        </div>

        {/* Guided Onboarding Checklist Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="flex items-end justify-between">
            <div>
              <h3 className="text-sm font-bold text-pulse-ink">
                Recommended Onboarding Checklist
              </h3>
              <p className="text-xs text-pulse-muted">
                Complete these initial milestones to fully operationalize {module.name}.
              </p>
            </div>
            {totalCount > 0 && (
              <span className="text-xs font-bold text-teal-700">
                {completedCount} of {totalCount} completed ({percent}%)
              </span>
            )}
          </div>

          {/* Progress Bar */}
          {totalCount > 0 && (
            <div className="h-2 w-full overflow-hidden rounded-full bg-pulse-bg border border-pulse-border">
              <div
                className="h-full bg-teal-600 transition-all duration-500"
                style={{ width: `${percent}%` }}
              />
            </div>
          )}

          {/* Checklist Items */}
          <div className="space-y-2.5 pt-1">
            {checklist.map((item, idx) => (
              <div
                key={item.id}
                className={`flex items-start justify-between rounded-xl border p-3.5 transition ${
                  item.completed
                    ? "border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/20"
                    : "border-pulse-border bg-pulse-surface hover:border-pulse-accent/50"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
                      item.completed ? "bg-emerald-500" : "bg-pulse-border text-pulse-muted"
                    }`}
                  >
                    {item.completed ? "✓" : idx + 1}
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className={`text-xs font-bold ${item.completed ? "text-emerald-900 dark:text-emerald-300 line-through opacity-85" : "text-pulse-ink"}`}>
                        {item.title}
                      </p>
                      {item.completed && (
                        <span className="rounded bg-emerald-100 px-1.5 py-0.2 text-[9px] font-bold text-emerald-800">
                          DONE
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-pulse-muted mt-0.5">{item.description}</p>
                  </div>
                </div>

                {!item.completed && item.action_url && (
                  <Link
                    to={item.action_url}
                    className="ml-3 shrink-0 rounded-md border border-pulse-border bg-pulse-surface px-2.5 py-1 text-[11px] font-semibold text-pulse-accent hover:bg-pulse-hover transition"
                  >
                    Set up &rarr;
                  </Link>
                )}
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-pulse-border bg-pulse-bg p-3.5 text-xs text-pulse-muted">
            <span className="font-semibold text-pulse-ink">Security note: </span>
            Installing a module never grants administrative permissions to regular company members automatically. Role permissions can be tailored under Roles & Permissions.
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex justify-end border-t border-pulse-border bg-pulse-bg px-6 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-pulse-accent px-4 py-1.5 text-xs font-semibold text-white hover:opacity-90 transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

