import { useQuery } from "@tanstack/react-query";
import { useState, useMemo, useEffect } from "react";
import { useOutletContext, useSearchParams, useParams, Link } from "react-router-dom";
import { api } from "../../shared/api/client";
import { LoadingState } from "../../shared/ui/States";
import type { WorkspacePayload } from "./types";
import type { ModuleCardItem, ModuleDetailData } from "../modules/types";
import { ModuleCard } from "../modules/components/ModuleCard";
import { ModuleIcon } from "../modules/components/ModuleIcon";
import { ModuleDetailModal } from "../modules/components/ModuleDetailModal";
import { GuidedInstallWizard } from "../modules/components/GuidedInstallWizard";
import { PostInstallSuccess } from "../modules/components/PostInstallSuccess";

type CategoryFilter = "all" | "installed" | "HR & People" | "Operations" | "Sales & CRM" | "Finance";

export function ModulesPage() {
  const workspace = useOutletContext<WorkspacePayload>();
  const companyId = workspace.company.id;
  const companyName = workspace.company.display_name;
  const permissions = workspace.permissions;
  const canInstall = permissions.includes("modules.install");
  const canUninstall = permissions.includes("modules.uninstall");

  // URL Deep-linking support
  const { slug: routeSlug } = useParams<{ slug?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const querySlug = searchParams.get("module");
  const activeSlug = routeSlug || querySlug;

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>("all");

  // Modal active states
  const [selectedModuleSlug, setSelectedModuleSlug] = useState<string | null>(activeSlug || null);
  const [installWizardModule, setInstallWizardModule] = useState<ModuleDetailData | null>(null);
  const [postInstallModule, setPostInstallModule] = useState<ModuleDetailData | null>(null);

  useEffect(() => {
    if (activeSlug) {
      setSelectedModuleSlug(activeSlug);
    }
  }, [activeSlug]);

  const handleOpenDetail = (slug: string) => {
    setSelectedModuleSlug(slug);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("module", slug);
      return next;
    });
  };

  const handleCloseDetail = () => {
    setSelectedModuleSlug(null);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("module");
      return next;
    });
  };

  // Queries
  const modulesQuery = useQuery({
    queryKey: ["company-modules", companyId],
    queryFn: () => api<{ results: ModuleCardItem[] }>(`/api/v1/companies/${companyId}/modules/`),
  });

  const allModules = modulesQuery.data?.results ?? [];

  // Filter & Search Logic
  const filteredModules = useMemo(() => {
    return allModules.filter((m) => {
      // Category filter
      if (activeCategory === "installed" && !m.installed) return false;
      if (activeCategory !== "all" && activeCategory !== "installed" && m.category !== activeCategory) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const inName = m.name.toLowerCase().includes(q);
        const inDesc = m.description.toLowerCase().includes(q);
        const inCategory = m.category.toLowerCase().includes(q);
        const inFeatures = (m.features_preview || []).some((f) => f.toLowerCase().includes(q));
        if (!inName && !inDesc && !inCategory && !inFeatures) return false;
      }

      return true;
    });
  }, [allModules, activeCategory, searchQuery]);

  const installedModules = filteredModules.filter((m) => m.installed);
  const availableModules = filteredModules.filter((m) => !m.installed && !m.coming_soon);
  const comingSoonModules = filteredModules.filter((m) => m.coming_soon);

  // Featured Module (HRMS or first featured)
  const featuredModule = useMemo(() => {
    return allModules.find((m) => m.slug === "hrms") || allModules.find((m) => m.featured);
  }, [allModules]);

  if (modulesQuery.isLoading) {
    return <LoadingState label="Loading Pulse Module Marketplace..." />;
  }

  return (
    <div className="space-y-8">
      {/* Marketplace Top Header */}
      <header className="border-b border-pulse-border pb-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-pulse-accent/10 px-2.5 py-0.5 text-xs font-bold text-pulse-accent">
                Pulse App Marketplace
              </span>
              <span className="text-xs text-pulse-muted">· {companyName}</span>
            </div>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-pulse-ink">
              Enterprise Module Directory
            </h1>
            <p className="mt-1 text-xs text-pulse-muted max-w-2xl leading-relaxed">
              Discover, install, and manage official business modules for workforce management, delivery operations, CRM, and finance. All modules run with strict tenant security and zero duplicate identity records.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/app/billing"
              className="rounded-lg border border-pulse-border bg-pulse-surface px-3 py-1.5 text-xs font-semibold text-pulse-muted hover:text-pulse-ink hover:bg-pulse-hover transition"
            >
              Subscription & Plan &rarr;
            </Link>
          </div>
        </div>

        {/* Search & Category Filter Pills */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveCategory("all")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                activeCategory === "all"
                  ? "bg-pulse-accent text-white shadow-sm"
                  : "bg-pulse-surface text-pulse-muted hover:bg-pulse-hover hover:text-pulse-ink"
              }`}
            >
              All Modules ({allModules.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveCategory("installed")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                activeCategory === "installed"
                  ? "bg-pulse-accent text-white shadow-sm"
                  : "bg-pulse-surface text-pulse-muted hover:bg-pulse-hover hover:text-pulse-ink"
              }`}
            >
              Installed ({allModules.filter((m) => m.installed).length})
            </button>
            <button
              type="button"
              onClick={() => setActiveCategory("HR & People")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                activeCategory === "HR & People"
                  ? "bg-pulse-accent text-white shadow-sm"
                  : "bg-pulse-surface text-pulse-muted hover:bg-pulse-hover hover:text-pulse-ink"
              }`}
            >
              HR & People
            </button>
            <button
              type="button"
              onClick={() => setActiveCategory("Operations")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                activeCategory === "Operations"
                  ? "bg-pulse-accent text-white shadow-sm"
                  : "bg-pulse-surface text-pulse-muted hover:bg-pulse-hover hover:text-pulse-ink"
              }`}
            >
              Operations
            </button>
            <button
              type="button"
              onClick={() => setActiveCategory("Sales & CRM")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                activeCategory === "Sales & CRM"
                  ? "bg-pulse-accent text-white shadow-sm"
                  : "bg-pulse-surface text-pulse-muted hover:bg-pulse-hover hover:text-pulse-ink"
              }`}
            >
              Sales & CRM
            </button>
            <button
              type="button"
              onClick={() => setActiveCategory("Finance")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                activeCategory === "Finance"
                  ? "bg-pulse-accent text-white shadow-sm"
                  : "bg-pulse-surface text-pulse-muted hover:bg-pulse-hover hover:text-pulse-ink"
              }`}
            >
              Finance
            </button>
          </div>

          {/* Search Input */}
          <div className="relative w-full max-w-xs">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-pulse-muted">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search modules or features..."
              className="w-full rounded-lg border border-pulse-border bg-pulse-surface pl-9 pr-3 py-1.5 text-xs text-pulse-ink placeholder-pulse-muted focus:border-pulse-accent focus:outline-none"
            />
          </div>
        </div>
      </header>

      {/* FEATURED MODULE SPOTLIGHT HERO (when viewing All or HR & People and search is empty) */}
      {!searchQuery && activeCategory !== "installed" && featuredModule && (
        <section className="relative overflow-hidden rounded-2xl border border-teal-500/30 bg-gradient-to-r from-teal-900/10 via-emerald-900/5 to-transparent p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-teal-600 text-white shadow-lg shadow-teal-600/30">
                <ModuleIcon name={featuredModule.icon} size="xl" />
              </div>
              <div className="max-w-2xl">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-800">
                    FLAGSHIP MODULE
                  </span>
                  <span className="text-xs font-semibold text-pulse-muted">
                    v{featuredModule.version}
                  </span>
                </div>
                <h2 className="mt-1 text-xl font-black text-pulse-ink">
                  {featuredModule.name} · Human Resource Management System
                </h2>
                <p className="mt-1 text-xs text-pulse-muted leading-relaxed">
                  {featuredModule.problem_solved || featuredModule.description}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(featuredModule.features_preview || []).map((feat, idx) => (
                    <span
                      key={idx}
                      className="rounded-md bg-pulse-surface px-2 py-0.5 text-[11px] font-medium text-pulse-ink border border-pulse-border shadow-xs"
                    >
                      ✓ {feat}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="shrink-0 flex items-center gap-3">
              <button
                type="button"
                onClick={() => handleOpenDetail(featuredModule.slug)}
                className="rounded-xl bg-teal-600 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-teal-600/20 hover:bg-teal-700 transition flex items-center gap-1.5"
              >
                <span>{featuredModule.installed ? "Open HRMS & Documentation" : "Explore HRMS & Install"}</span>
                <span>&rarr;</span>
              </button>
            </div>
          </div>
        </section>
      )}

      {/* INSTALLED MODULES SECTION */}
      {installedModules.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-pulse-ink">
              Installed in Workspace ({installedModules.length})
            </h2>
            <span className="text-xs text-pulse-muted">Active and ready for authorized team members</span>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {installedModules.map((item) => (
              <ModuleCard
                key={item.slug}
                module={item}
                canInstall={canInstall}
                onOpenDetail={handleOpenDetail}
              />
            ))}
          </div>
        </section>
      )}

      {/* AVAILABLE MODULES SECTION */}
      {availableModules.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-pulse-ink">
              Available for Installation ({availableModules.length})
            </h2>
            <span className="text-xs text-pulse-muted">Ready to deploy with guided multi-stage wizard</span>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {availableModules.map((item) => (
              <ModuleCard
                key={item.slug}
                module={item}
                canInstall={canInstall}
                onOpenDetail={handleOpenDetail}
              />
            ))}
          </div>
        </section>
      )}

      {/* COMING SOON SECTION */}
      {comingSoonModules.length > 0 && (
        <section className="space-y-4 pt-2">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-pulse-ink">
              Roadmap & Coming Soon ({comingSoonModules.length})
            </h2>
            <span className="text-xs text-pulse-muted">Under active engineering for future platform releases</span>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {comingSoonModules.map((item) => (
              <ModuleCard
                key={item.slug}
                module={item}
                canInstall={canInstall}
                onOpenDetail={handleOpenDetail}
              />
            ))}
          </div>
        </section>
      )}

      {/* ZERO RESULTS EMPTY STATE */}
      {filteredModules.length === 0 && (
        <div className="rounded-2xl border border-pulse-border bg-pulse-surface p-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-pulse-bg text-pulse-muted">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <h3 className="mt-3 text-base font-bold text-pulse-ink">No modules found</h3>
          <p className="mt-1 text-xs text-pulse-muted">
            No modules matched your search query "{searchQuery}". Try searching for another term or selecting "All Modules".
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery("");
              setActiveCategory("all");
            }}
            className="mt-4 rounded-lg bg-pulse-accent px-4 py-2 text-xs font-semibold text-white shadow-sm hover:opacity-90 transition"
          >
            Clear Filters
          </button>
        </div>
      )}

      {/* MODULE DETAIL MODAL */}
      {selectedModuleSlug && (
        <ModuleDetailModal
          slug={selectedModuleSlug}
          companyId={companyId}
          companyName={companyName}
          canInstall={canInstall}
          canUninstall={canUninstall}
          onClose={handleCloseDetail}
          onStartInstallWizard={(modData) => {
            setSelectedModuleSlug(null);
            setInstallWizardModule(modData);
          }}
          onOpenOnboarding={(modData) => {
            setSelectedModuleSlug(null);
            setPostInstallModule(modData);
          }}
        />
      )}

      {/* GUIDED INSTALLATION WIZARD */}
      {installWizardModule && (
        <GuidedInstallWizard
          module={installWizardModule}
          companyId={companyId}
          companyName={companyName}
          onClose={() => setInstallWizardModule(null)}
          onInstallSuccess={(installedMod) => {
            setInstallWizardModule(null);
            setPostInstallModule(installedMod);
          }}
        />
      )}

      {/* POST-INSTALL ONBOARDING & CELEBRATION */}
      {postInstallModule && (
        <PostInstallSuccess
          module={postInstallModule}
          companyId={companyId}
          onClose={() => setPostInstallModule(null)}
          onOpenTutorials={() => {
            const currentSlug = postInstallModule.slug;
            setPostInstallModule(null);
            handleOpenDetail(currentSlug);
          }}
        />
      )}
    </div>
  );
}
