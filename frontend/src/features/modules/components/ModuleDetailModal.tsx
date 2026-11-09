import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../../../shared/api/client";
import { ModuleIcon } from "./ModuleIcon";
import { LoadingState } from "../../../shared/ui/States";
import type { ModuleDetailData } from "../types";

interface ModuleDetailModalProps {
  slug: string;
  companyId: string;
  companyName: string;
  canInstall: boolean;
  canUninstall: boolean;
  onClose: () => void;
  onStartInstallWizard: (module: ModuleDetailData) => void;
  onOpenOnboarding: (module: ModuleDetailData) => void;
}

type DetailTab = "overview" | "features" | "preview" | "tutorials" | "requirements";

export function ModuleDetailModal({
  slug,
  companyId,
  canInstall,
  canUninstall,
  onClose,
  onStartInstallWizard,
  onOpenOnboarding,
}: ModuleDetailModalProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<DetailTab>("overview");
  const [activeScreenshotIdx, setActiveScreenshotIdx] = useState(0);

  // Lesson progress tracking stored locally
  const [completedLessons, setCompletedLessons] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem(`pulse_module_lessons_${slug}`);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  const toggleLesson = (id: string) => {
    setCompletedLessons((prev) => {
      const updated = { ...prev, [id]: !prev[id] };
      try {
        localStorage.setItem(`pulse_module_lessons_${slug}`, JSON.stringify(updated));
      } catch {
        // ignore
      }
      return updated;
    });
  };

  const detailQuery = useQuery({
    queryKey: ["module-detail", companyId, slug],
    queryFn: () => api<ModuleDetailData>(`/api/v1/companies/${companyId}/modules/${slug}/`),
  });

  const uninstallMutation = useMutation({
    mutationFn: () => api(`/api/v1/companies/${companyId}/modules/${slug}/uninstall/`, { method: "POST" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["company-modules", companyId] });
      await queryClient.invalidateQueries({ queryKey: ["module-detail", companyId, slug] });
      await queryClient.invalidateQueries({ queryKey: ["workspace"] });
    },
  });

  if (detailQuery.isLoading || !detailQuery.data) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
        <div className="w-full max-w-xl rounded-2xl border border-pulse-border bg-pulse-surface p-8 shadow-2xl">
          <LoadingState label="Loading module specifications..." />
        </div>
      </div>
    );
  }

  const mod = detailQuery.data;
  const workspaceRoute =
    mod.slug === "hrms"
      ? "/app/hrms"
      : mod.slug === "crm"
      ? "/app/crm"
      : mod.slug === "projects"
      ? "/app/projects"
      : mod.slug === "commerce"
      ? "/app/commerce"
      : "/app";

  const totalLessons = mod.tutorials.length;
  const completedLessonCount = mod.tutorials.filter((t) => completedLessons[t.id]).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col rounded-2xl border border-pulse-border bg-pulse-surface shadow-2xl overflow-hidden">
        {/* Top Hero Banner */}
        <div className="border-b border-pulse-border bg-pulse-bg p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-pulse-ink text-white shadow-md">
                <ModuleIcon name={mod.icon} size="lg" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2 className="text-xl font-black text-pulse-ink">{mod.name}</h2>
                  <span className="rounded-full bg-pulse-hover px-2 py-0.5 text-xs font-semibold text-pulse-muted">
                    v{mod.version}
                  </span>
                  <span className="rounded-md border border-pulse-border bg-pulse-surface px-2 py-0.5 text-[11px] font-semibold text-pulse-muted">
                    {mod.category}
                  </span>
                  {mod.featured && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                      FEATURED
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-pulse-muted max-w-xl leading-relaxed">
                  {mod.description}
                </p>
              </div>
            </div>

            {/* Close Button */}
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

          {/* Action Bar */}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-pulse-border">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-semibold text-pulse-muted">Status:</span>
              {mod.installed ? (
                <span className="inline-flex items-center gap-1 font-bold text-teal-700 dark:text-teal-400">
                  <span className="h-2 w-2 rounded-full bg-teal-500"></span>
                  Installed in Workspace
                </span>
              ) : mod.coming_soon ? (
                <span className="font-semibold text-pulse-muted">In Roadmap · Coming Soon</span>
              ) : mod.eligible ? (
                <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                  ✓ Included in Active Plan
                </span>
              ) : (
                <span className="font-semibold text-purple-700 dark:text-purple-400">
                  Requires Plan Upgrade
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {mod.installed ? (
                <>
                  <Link
                    to={workspaceRoute}
                    className="rounded-lg bg-pulse-accent px-4 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90 transition flex items-center gap-1.5"
                  >
                    <span>Open {mod.name}</span>
                    <span>&rarr;</span>
                  </Link>
                  {mod.onboarding_checklist && mod.onboarding_checklist.length > 0 && (
                    <button
                      type="button"
                      onClick={() => onOpenOnboarding(mod)}
                      className="rounded-lg border border-pulse-border bg-pulse-surface px-3 py-2 text-xs font-semibold text-pulse-ink hover:bg-pulse-hover transition"
                    >
                      Onboarding Checklist
                    </button>
                  )}
                  {canUninstall && (
                    <button
                      type="button"
                      disabled={uninstallMutation.isPending}
                      onClick={() => {
                        if (confirm(`Uninstall ${mod.name}? Historical business data will be safely preserved.`)) {
                          uninstallMutation.mutate();
                        }
                      }}
                      className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 dark:bg-rose-950/30 dark:text-rose-300 transition"
                    >
                      {uninstallMutation.isPending ? "Uninstalling..." : "Uninstall"}
                    </button>
                  )}
                </>
              ) : mod.coming_soon ? (
                <span className="rounded-lg bg-pulse-hover px-4 py-2 text-xs font-medium text-pulse-muted">
                  Coming Soon
                </span>
              ) : mod.eligible ? (
                canInstall ? (
                  <button
                    type="button"
                    onClick={() => onStartInstallWizard(mod)}
                    className="rounded-lg bg-teal-600 px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-teal-700 transition flex items-center gap-1.5"
                  >
                    <span>Install Module</span>
                    <span>&rarr;</span>
                  </button>
                ) : (
                  <span className="text-xs text-pulse-muted font-medium">
                    Admin permission required to install
                  </span>
                )
              ) : (
                <Link
                  to="/app/billing"
                  className="rounded-lg bg-purple-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-purple-700 transition"
                >
                  View Subscription Options
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-pulse-border bg-pulse-surface px-6 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab("overview")}
            className={`border-b-2 py-3 px-3 transition ${
              activeTab === "overview"
                ? "border-pulse-accent text-pulse-accent"
                : "border-transparent text-pulse-muted hover:text-pulse-ink"
            }`}
          >
            Overview
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("features")}
            className={`border-b-2 py-3 px-3 transition ${
              activeTab === "features"
                ? "border-pulse-accent text-pulse-accent"
                : "border-transparent text-pulse-muted hover:text-pulse-ink"
            }`}
          >
            Features ({mod.features.length})
          </button>
          {mod.screenshots && mod.screenshots.length > 0 && (
            <button
              type="button"
              onClick={() => setActiveTab("preview")}
              className={`border-b-2 py-3 px-3 transition ${
                activeTab === "preview"
                  ? "border-pulse-accent text-pulse-accent"
                  : "border-transparent text-pulse-muted hover:text-pulse-ink"
              }`}
            >
              UI Preview ({mod.screenshots.length})
            </button>
          )}
          {mod.tutorials && mod.tutorials.length > 0 && (
            <button
              type="button"
              onClick={() => setActiveTab("tutorials")}
              className={`border-b-2 py-3 px-3 transition ${
                activeTab === "tutorials"
                  ? "border-pulse-accent text-pulse-accent"
                  : "border-transparent text-pulse-muted hover:text-pulse-ink"
              }`}
            >
              Tutorials & Docs ({completedLessonCount}/{totalLessons})
            </button>
          )}
          <button
            type="button"
            onClick={() => setActiveTab("requirements")}
            className={`border-b-2 py-3 px-3 transition ${
              activeTab === "requirements"
                ? "border-pulse-accent text-pulse-accent"
                : "border-transparent text-pulse-muted hover:text-pulse-ink"
            }`}
          >
            Requirements & Compatibility
          </button>
        </div>

        {/* Tab Content Body */}
        <div className="flex-1 overflow-y-auto p-6 text-sm">
          {/* OVERVIEW TAB */}
          {activeTab === "overview" && (
            <div className="space-y-6">
              <div className="rounded-xl border border-pulse-border bg-pulse-bg p-5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-pulse-muted">
                  What Business Problem It Solves
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-pulse-ink font-medium">
                  {mod.problem_solved || mod.description}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-6 border-t border-pulse-border pt-3 text-xs">
                  <div>
                    <span className="text-pulse-muted">Target Users: </span>
                    <span className="font-semibold text-pulse-ink">{mod.target_users}</span>
                  </div>
                  <div>
                    <span className="text-pulse-muted">Security Boundary: </span>
                    <span className="font-semibold text-emerald-700">Strict Tenant Isolation</span>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold text-pulse-ink mb-3">Key Highlights</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {mod.features.slice(0, 4).map((feat, idx) => (
                    <div key={idx} className="flex items-start gap-3 rounded-xl border border-pulse-border bg-pulse-surface p-3.5 shadow-sm">
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-pulse-hover text-pulse-accent">
                        <ModuleIcon name={feat.icon} size="sm" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-pulse-ink">{feat.title}</h4>
                        <p className="mt-0.5 text-xs text-pulse-muted leading-relaxed">{feat.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* FEATURES TAB */}
          {activeTab === "features" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {mod.features.map((feat, idx) => (
                <div key={idx} className="rounded-xl border border-pulse-border bg-pulse-surface p-4 shadow-sm hover:border-pulse-accent/40 transition">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-pulse-hover text-pulse-accent">
                      <ModuleIcon name={feat.icon} size="md" />
                    </div>
                    <h4 className="text-sm font-bold text-pulse-ink">{feat.title}</h4>
                  </div>
                  <p className="mt-2.5 text-xs leading-relaxed text-pulse-muted">
                    {feat.description}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* UI PREVIEW TAB */}
          {activeTab === "preview" && (
            <div className="space-y-4">
              <div className="flex gap-2 border-b border-pulse-border pb-3">
                {mod.screenshots.map((s, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setActiveScreenshotIdx(idx)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      activeScreenshotIdx === idx
                        ? "bg-pulse-accent text-white"
                        : "bg-pulse-bg text-pulse-muted hover:text-pulse-ink"
                    }`}
                  >
                    {s.title}
                  </button>
                ))}
              </div>

              {mod.screenshots[activeScreenshotIdx] && (
                <div className="rounded-xl border border-pulse-border bg-pulse-bg p-6 text-center space-y-3">
                  <span className="inline-block rounded-full bg-pulse-surface border border-pulse-border px-3 py-1 text-xs font-semibold text-pulse-accent">
                    {mod.screenshots[activeScreenshotIdx].badge}
                  </span>
                  <h4 className="text-base font-bold text-pulse-ink">
                    {mod.screenshots[activeScreenshotIdx].title}
                  </h4>
                  <p className="text-xs text-pulse-muted max-w-md mx-auto">
                    {mod.screenshots[activeScreenshotIdx].description}
                  </p>

                  {/* Mock Workspace Graphic */}
                  <div className="mt-4 rounded-xl border border-pulse-border bg-pulse-surface p-6 shadow-inner text-left font-mono text-xs">
                    <div className="flex items-center gap-2 border-b border-pulse-border pb-3 text-pulse-muted text-[11px]">
                      <span className="h-2.5 w-2.5 rounded-full bg-rose-400"></span>
                      <span className="h-2.5 w-2.5 rounded-full bg-amber-400"></span>
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-400"></span>
                      <span className="ml-2">Pulse ERP · /app/{mod.slug}</span>
                    </div>
                    <div className="py-8 text-center font-sans space-y-2">
                      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-pulse-accent/10 text-pulse-accent">
                        <ModuleIcon name={mod.icon} size="lg" />
                      </div>
                      <p className="text-xs font-semibold text-pulse-ink">
                        Active UI Preview: {mod.screenshots[activeScreenshotIdx].title}
                      </p>
                      <p className="text-[11px] text-pulse-muted">
                        Full interactive view available upon module installation.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TUTORIALS TAB */}
          {activeTab === "tutorials" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-xl border border-pulse-border bg-pulse-bg p-4">
                <div>
                  <h4 className="text-xs font-bold text-pulse-ink">Learning Center Progress</h4>
                  <p className="text-[11px] text-pulse-muted">Complete these guides to master {mod.name}.</p>
                </div>
                <span className="text-xs font-bold text-teal-700">
                  {completedLessonCount} of {totalLessons} lessons completed
                </span>
              </div>

              <div className="space-y-4">
                {mod.tutorials.map((tut) => {
                  const isDone = Boolean(completedLessons[tut.id]);
                  return (
                    <div key={tut.id} className="rounded-xl border border-pulse-border bg-pulse-surface p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-bold text-pulse-ink">{tut.title}</h4>
                            <span className="rounded-md bg-pulse-hover px-2 py-0.5 text-[10px] font-semibold text-pulse-muted">
                              {tut.duration}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-pulse-muted">{tut.summary}</p>
                        </div>

                        <label className="flex items-center gap-1.5 cursor-pointer text-xs font-semibold shrink-0">
                          <input
                            type="checkbox"
                            checked={isDone}
                            onChange={() => toggleLesson(tut.id)}
                            className="h-4 w-4 rounded border-pulse-border text-pulse-accent focus:ring-pulse-accent"
                          />
                          <span className={isDone ? "text-emerald-700 font-bold" : "text-pulse-muted"}>
                            {isDone ? "Completed" : "Mark Done"}
                          </span>
                        </label>
                      </div>

                      {/* Step-by-Step Instructions */}
                      <div className="rounded-lg bg-pulse-bg p-3 space-y-1.5">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-pulse-muted">Steps:</p>
                        <ol className="list-decimal list-inside space-y-1 text-xs text-pulse-ink">
                          {tut.steps.map((st, sIdx) => (
                            <li key={sIdx} className="leading-relaxed">{st}</li>
                          ))}
                        </ol>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* REQUIREMENTS TAB */}
          {activeTab === "requirements" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-xl border border-pulse-border bg-pulse-surface p-4">
                <div>
                  <h4 className="text-xs font-bold text-pulse-ink">Subscription Entitlement</h4>
                  <p className="text-[11px] text-pulse-muted">
                    {mod.requirements_status.subscription_eligible
                      ? "Your company plan includes full access to this module."
                      : "Upgrade your plan to unlock this module."}
                  </p>
                </div>
                <span className={`text-xs font-bold ${mod.requirements_status.subscription_eligible ? "text-emerald-700" : "text-rose-700"}`}>
                  {mod.requirements_status.subscription_eligible ? "✓ Entitled" : "✕ Upgrade Required"}
                </span>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-pulse-border bg-pulse-surface p-4">
                <div>
                  <h4 className="text-xs font-bold text-pulse-ink">Installation Permission</h4>
                  <p className="text-[11px] text-pulse-muted">Requires 'modules.install' authorization.</p>
                </div>
                <span className={`text-xs font-bold ${mod.requirements_status.has_install_permission ? "text-emerald-700" : "text-rose-700"}`}>
                  {mod.requirements_status.has_install_permission ? "✓ Authorized" : "✕ Missing Permission"}
                </span>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-pulse-border bg-pulse-surface p-4">
                <div>
                  <h4 className="text-xs font-bold text-pulse-ink">Module Dependencies</h4>
                  <p className="text-[11px] text-pulse-muted">
                    {mod.dependencies.length === 0
                      ? "Zero external dependencies required."
                      : mod.dependencies.map((d) => `${d.name} (${d.installed ? "Installed" : "Missing"})`).join(", ")}
                  </p>
                </div>
                <span className={`text-xs font-bold ${mod.requirements_status.dependencies_met ? "text-emerald-700" : "text-rose-700"}`}>
                  {mod.requirements_status.dependencies_met ? "✓ Satisfied" : "✕ Missing Dependencies"}
                </span>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-pulse-border bg-pulse-surface p-4">
                <div>
                  <h4 className="text-xs font-bold text-pulse-ink">Platform Version Compatibility</h4>
                  <p className="text-[11px] text-pulse-muted">Verified compatible with Pulse ERP 2.0+ core.</p>
                </div>
                <span className="text-xs font-bold text-emerald-700">✓ Compatible</span>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex justify-end border-t border-pulse-border bg-pulse-bg px-6 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-pulse-border bg-pulse-surface px-4 py-1.5 text-xs font-semibold text-pulse-ink hover:bg-pulse-hover transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

