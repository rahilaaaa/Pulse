import { ModuleIcon } from "./ModuleIcon";
import type { ModuleCardItem } from "../types";

interface ModuleCardProps {
  module: ModuleCardItem;
  canInstall: boolean;
  onOpenDetail: (slug: string) => void;
  onQuickAction?: (module: ModuleCardItem) => void;
}

export function ModuleCard({ module, canInstall, onOpenDetail }: ModuleCardProps) {
  // Category styling
  const categoryColors: Record<string, string> = {
    "HR & People": "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-200/60",
    "Sales & CRM": "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400 border-indigo-200/60",
    "Operations": "bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400 border-sky-200/60",
    "Finance": "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400 border-violet-200/60",
    "Customer Service": "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border-amber-200/60",
  };

  const iconColors: Record<string, string> = {
    "HR & People": "bg-emerald-600 text-white shadow-emerald-500/20",
    "Sales & CRM": "bg-indigo-600 text-white shadow-indigo-500/20",
    "Operations": "bg-sky-600 text-white shadow-sky-500/20",
    "Finance": "bg-violet-600 text-white shadow-violet-500/20",
    "Customer Service": "bg-amber-600 text-white shadow-amber-500/20",
  };

  const categoryBadge = categoryColors[module.category] || "bg-pulse-hover text-pulse-muted border-pulse-border";
  const iconBg = iconColors[module.category] || "bg-pulse-ink text-white";

  // Status Badge
  const renderStatusBadge = () => {
    if (module.installed) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-700 dark:bg-teal-950/50 dark:text-teal-300">
          <span className="h-1.5 w-1.5 rounded-full bg-teal-500"></span>
          Installed · v{module.version}
        </span>
      );
    }
    if (module.status === "installing") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 animate-pulse">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
          Installing...
        </span>
      );
    }
    if (module.coming_soon) {
      return (
        <span className="rounded-full bg-pulse-hover px-2 py-0.5 text-xs font-medium text-pulse-muted">
          Coming Soon
        </span>
      );
    }
    if (!module.eligible) {
      return (
        <span className="rounded-full bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-950/40 dark:text-purple-300">
          Upgrade Required
        </span>
      );
    }
    return (
      <span className="rounded-full bg-pulse-hover px-2 py-0.5 text-xs font-semibold text-pulse-accent">
        Ready to Install
      </span>
    );
  };

  return (
    <div
      onClick={() => onOpenDetail(module.slug)}
      className="group relative flex flex-col justify-between rounded-xl border border-pulse-border bg-pulse-surface p-5 shadow-sm transition hover:border-pulse-accent/60 hover:shadow-md cursor-pointer"
    >
      <div>
        {/* Top Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`flex h-11 w-11 items-center justify-center rounded-xl shadow-sm transition group-hover:scale-105 ${iconBg}`}>
              <ModuleIcon name={module.icon} size="md" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-pulse-ink group-hover:text-pulse-accent transition">
                  {module.name}
                </h3>
                {module.featured && (
                  <span className="rounded-full bg-amber-100 px-1.5 py-0.2 text-[10px] font-bold text-amber-800">
                    FEATURED
                  </span>
                )}
              </div>
              <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${categoryBadge}`}>
                {module.category}
              </span>
            </div>
          </div>
          {renderStatusBadge()}
        </div>

        {/* Description */}
        <p className="mt-3 text-xs leading-relaxed text-pulse-muted line-clamp-2">
          {module.description}
        </p>

        {/* Features Preview */}
        {module.features_preview && module.features_preview.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {module.features_preview.map((feat, idx) => (
              <span
                key={idx}
                className="rounded-md bg-pulse-bg px-2 py-0.5 text-[11px] font-medium text-pulse-muted border border-pulse-border"
              >
                ✓ {feat}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Footer / Action */}
      <div className="mt-5 pt-3.5 border-t border-pulse-border flex items-center justify-between text-xs">
        <span className="text-[11px] text-pulse-muted font-medium">
          {module.installed
            ? "Workspace active"
            : module.coming_soon
            ? "In roadmap"
            : module.eligible
            ? "Included in current plan"
            : "Requires plan upgrade"}
        </span>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenDetail(module.slug);
          }}
          className={`font-semibold transition flex items-center gap-1 group-hover:translate-x-0.5 ${
            module.installed
              ? "text-teal-700 dark:text-teal-400 hover:text-teal-800"
              : module.coming_soon
              ? "text-pulse-muted hover:text-pulse-ink"
              : module.eligible && canInstall
              ? "text-pulse-accent hover:opacity-85"
              : "text-purple-600 hover:text-purple-700"
          }`}
        >
          {module.installed ? "Manage & Docs" : module.coming_soon ? "Learn More" : "View Details & Install"}
          <span>&rarr;</span>
        </button>
      </div>
    </div>
  );
}

