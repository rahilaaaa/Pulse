import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api, clearCsrfToken } from "../../shared/api/client";
import { ThemeToggle } from "../../shared/theme/ThemeToggle";
import { PulseMark } from "../../shared/ui/PulseMark";
import { LoadingState } from "../../shared/ui/States";
import { initials, personName, relativeTime } from "./format";
import { NavIcon, SHELL_LINKS } from "./navigation";
import type { MePayload, PersonRow, WorkspacePayload } from "./types";

const TITLES: Record<string, string> = {
  "/app": "Workspace",
  "/app/people": "People",
  "/app/organization": "Organization",
  "/app/studio": "Admin Studio",
  "/app/modules": "Modules",
  "/app/roles": "Roles & Permissions",
  "/app/settings": "Configuration",
  "/app/custom-entities": "Custom Records",
  "/app/billing": "Billing & Plan",
  "/app/notifications": "Notifications",
  "/app/audit": "Audit",
  "/app/hrms": "Leave",
  "/app/parties": "Parties",
  "/app/projects": "Projects",
  "/app/crm": "CRM",
  "/app/commerce": "Commerce",
};

export function WorkspaceLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [companyMenuOpen, setCompanyMenuOpen] = useState(false);
  const workspace = useQuery({ queryKey: ["workspace"], queryFn: () => api<WorkspacePayload>("/api/v1/workspace/") });
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<MePayload>("/api/v1/auth/me/") });
  const enter = useMutation({ mutationFn: () => api("/api/v1/workspace/enter/", { method: "POST" }) });
  const switchCompany = useMutation({
    mutationFn: (nextCompanyId: string) =>
      api<WorkspacePayload>("/api/v1/workspace/switch/", {
        method: "POST",
        body: JSON.stringify({ company_id: nextCompanyId }),
      }),
    onSuccess: (payload) => {
      queryClient.setQueryData(["workspace"], payload);
      queryClient.removeQueries({ queryKey: ["company-overview"] });
      setCompanyMenuOpen(false);
      setOpen(false);
    },
  });
  const logout = useMutation({
    mutationFn: () => api<void>("/api/v1/auth/logout/", { method: "POST" }),
    onSuccess: () => {
      clearCsrfToken();
      queryClient.clear();
      navigate("/welcome", { replace: true });
    },
  });

  const companyId = workspace.data?.company.id ?? "";
  const directory = useQuery({
    queryKey: ["people", companyId],
    queryFn: () => api<{ results: PersonRow[] }>(`/api/v1/companies/${companyId}/people/`),
    enabled: Boolean(companyId),
    retry: false,
  });
  const notices = useQuery({
    queryKey: ["notifications", companyId],
    queryFn: () => api<{ results: Array<{ id: string; title: string; read: boolean; created_at: string }>; unread_count: number }>(`/api/v1/companies/${companyId}/notifications/`),
    enabled: Boolean(companyId),
  });

  useEffect(() => {
    if (workspace.data) {
      enter.mutate();
    }
  }, [workspace.data]);

  if (workspace.isLoading) {
    return (
      <main className="grid min-h-screen place-items-center">
        <LoadingState label="Loading the company dashboard" />
      </main>
    );
  }
  if (workspace.isError || !workspace.data) {
    return <Navigate to="/onboarding" replace />;
  }
  const data = workspace.data;
  const companies = me.data?.memberships ?? [];
  const allowed = new Set(data.navigation.map((item) => item.code));
  const links = SHELL_LINKS.filter((item) => {
    if (item.code === "notifications") return allowed.has("dashboard");
    if (item.code === "billing") return allowed.has("settings") || data.permissions.includes("billing.view");
    if (item.code === "users") return allowed.has("users") || data.permissions.includes("people.view");
    return allowed.has(item.code);
  });
  const self = directory.data?.results.find((person) => person.email === me.data?.email);
  const displayName = personName(me.data?.first_name ?? "", me.data?.last_name ?? "", me.data?.email ?? "");
  const designation = (self?.job_title ?? "").trim();
  const profileSubtitle = designation || data.company.display_name;
  const title =
    TITLES[location.pathname] ??
    (location.pathname.startsWith("/app/custom-entities/") ? "Custom Records" : "Workspace");
  const crumb = location.pathname === "/app" ? [{ label: "Workspace", to: "/app" }] : [{ label: "Workspace", to: "/app" }, { label: title, to: location.pathname }];
  const needle = query.trim().toLowerCase();
  const pageHits = needle ? links.filter((item) => item.label.toLowerCase().includes(needle)) : [];
  const peopleHits = needle
    ? (directory.data?.results ?? []).filter((person) => personName(person.first_name, person.last_name, person.email).toLowerCase().includes(needle) || person.email.toLowerCase().includes(needle)).slice(0, 6)
    : [];

  return (
    <div className="min-h-screen bg-pulse-canvas lg:grid lg:grid-cols-[15.5rem_1fr]">
      <aside className={`${open ? "block" : "hidden"} border-r border-pulse-border bg-pulse-sidebar lg:block lg:min-h-screen`}>
        <div className="flex h-full flex-col">
          <div className="flex items-center gap-2 px-4 py-4">
            <PulseMark size="sm" />
            <span className="text-base font-semibold text-pulse-ink">Pulse</span>
          </div>
          <div className="px-3">
            {companies.length > 1 ? (
              <div className="relative">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 rounded-lg border border-pulse-border bg-pulse-surface px-3 py-2 text-left text-sm font-medium text-pulse-ink hover:bg-pulse-hover"
                  aria-expanded={companyMenuOpen}
                  aria-haspopup="listbox"
                  aria-label="Switch company"
                  onClick={() => setCompanyMenuOpen((value) => !value)}
                >
                  <span className="truncate">{data.company.display_name}</span>
                  <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-pulse-muted" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                    <path d="m5 8 5 5 5-5" />
                  </svg>
                </button>
                {companyMenuOpen ? (
                  <ul role="listbox" aria-label="Companies" className="absolute left-0 right-0 z-30 mt-1 rounded-lg border border-pulse-border bg-pulse-surface py-1 shadow-lg">
                    {companies.map((company) => {
                      const selected = company.company_id === data.company.id;
                      return (
                        <li key={company.company_id}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={selected}
                            className={`block w-full truncate px-3 py-2 text-left text-sm ${selected ? "font-medium text-teal-800" : "text-pulse-ink hover:bg-pulse-hover"}`}
                            disabled={switchCompany.isPending}
                            onClick={() => {
                              if (selected) {
                                setCompanyMenuOpen(false);
                                return;
                              }
                              switchCompany.mutate(company.company_id);
                            }}
                          >
                            {company.company_display_name}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </div>
            ) : (
              <p className="truncate rounded-lg border border-pulse-border bg-pulse-surface px-3 py-2 text-sm font-medium text-pulse-ink">{data.company.display_name}</p>
            )}
          </div>
          <nav className="mt-3 flex-1 space-y-4 overflow-y-auto px-3 pb-4" aria-label="Company">
            {(["Workspace", "Administration"] as const).map((section) => {
              const items = links.filter((item) => item.section === section);
              if (items.length === 0) return null;
              return (
                <div key={section}>
                  <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-pulse-muted">{section}</p>
                  <div className="space-y-0.5">
                    {items.map((item) => (
                      <NavLink
                        key={item.code}
                        to={item.to}
                        end={item.end}
                        className={({ isActive }) =>
                          `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
                            isActive
                              ? "bg-teal-50 font-medium text-teal-900 dark:bg-teal-950 dark:text-teal-300"
                              : "text-pulse-muted hover:bg-pulse-hover hover:text-pulse-ink"
                          }`
                        }
                        onClick={() => setOpen(false)}
                      >
                        <NavIcon name={item.icon} />
                        {item.label}
                      </NavLink>
                    ))}
                  </div>
                </div>
              );
            })}
          </nav>
          <div className="border-t border-pulse-border p-3">
            <div className="flex items-center gap-2 rounded-lg px-2 py-1.5">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-pulse-accent text-xs font-semibold text-white">{initials(displayName)}</span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-pulse-ink">{displayName}</span>
                <span className="block truncate text-xs text-pulse-muted">
                  {designation ? `${data.company.display_name} · ${designation}` : data.company.display_name}
                </span>
              </span>
            </div>
          </div>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-pulse-border bg-pulse-surface/95 px-4 py-3 backdrop-blur sm:px-6">
          <button className="rounded-md border border-pulse-border px-2 py-1 text-sm text-pulse-ink hover:bg-pulse-hover lg:hidden" type="button" onClick={() => setOpen((value) => !value)}>Menu</button>
          <nav aria-label="Breadcrumb" className="min-w-0 text-sm text-pulse-muted">
            <ol className="flex items-center gap-2">
              {crumb.map((item, index) => (
                <li key={item.to} className="flex items-center gap-2">
                  {index > 0 ? <span aria-hidden="true">›</span> : null}
                  {index === crumb.length - 1 ? <span className="font-medium text-pulse-ink">{item.label}</span> : <Link to={item.to} className="hover:text-pulse-ink">{item.label}</Link>}
                </li>
              ))}
            </ol>
          </nav>
          <div className="relative ml-auto hidden w-full max-w-sm sm:block">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-pulse-muted">
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="8.5" cy="8.5" r="5" /><path d="m12.5 12.5 4 4" /></svg>
            </span>
            <input
              className="w-full rounded-lg border border-pulse-border bg-pulse-hover/60 py-2 pl-9 pr-3 text-sm text-pulse-ink outline-none transition placeholder:text-pulse-muted focus:border-pulse-accent focus:bg-pulse-surface focus:ring-2 focus:ring-[var(--pulse-ring)]"
              placeholder="Search people and pages"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search people and pages"
            />
            {needle ? (
              <div className="absolute right-0 z-30 mt-1 w-full rounded-lg border border-pulse-border bg-pulse-surface py-1 shadow-lg">
                {pageHits.length === 0 && peopleHits.length === 0 ? <p className="px-3 py-2 text-sm text-pulse-muted">No matches</p> : null}
                {pageHits.map((item) => (
                  <Link key={item.code} to={item.to} className="block px-3 py-2 text-sm text-pulse-ink hover:bg-pulse-hover" onClick={() => setQuery("")}>{item.label}</Link>
                ))}
                {peopleHits.map((person) => (
                  <Link key={person.id} to="/app/people" className="block px-3 py-2 text-sm hover:bg-pulse-hover" onClick={() => setQuery("")}>
                    <span className="text-pulse-ink">{personName(person.first_name, person.last_name, person.email)}</span>
                    <span className="block text-xs text-pulse-muted">{person.email || "No email"}</span>
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
          <ThemeToggle />
          <div className="relative">
            <button type="button" className="relative rounded-lg p-2 text-pulse-muted transition hover:bg-pulse-hover hover:text-pulse-ink" aria-label="Notifications" onClick={() => { setBellOpen((value) => !value); setMenuOpen(false); }}>
              <NavIcon name="notifications" />
              {(notices.data?.unread_count ?? 0) > 0 ? <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500" /> : null}
            </button>
            {bellOpen ? (
              <div className="absolute right-0 z-30 mt-1 w-80 rounded-lg border border-pulse-border bg-pulse-surface p-3 shadow-lg">
                <p className="text-sm font-semibold text-pulse-ink">Notifications</p>
                <div className="mt-2 space-y-2">
                  {(notices.data?.results ?? []).slice(0, 3).map((item) => (
                    <Link key={item.id} to="/app/notifications?tab=inbox" className="block rounded-md px-1 py-1 hover:bg-pulse-hover" onClick={() => setBellOpen(false)}>
                      <span className="block text-sm text-pulse-ink">{item.title}</span>
                      <span className="text-xs text-pulse-muted">{relativeTime(item.created_at)}</span>
                    </Link>
                  ))}
                  {(notices.data?.results.length ?? 0) === 0 ? <p className="text-sm text-pulse-muted">No notifications yet.</p> : null}
                </div>
                <Link to="/app/notifications?tab=announcements" className="mt-3 inline-block text-sm font-medium text-pulse-accent" onClick={() => setBellOpen(false)}>Announcements</Link>
              </div>
            ) : null}
          </div>
          <div className="relative">
            <button type="button" className="flex items-center gap-2 rounded-full py-1 pl-1 pr-1 text-left transition hover:bg-pulse-hover sm:pr-2" aria-label="Account menu" onClick={() => { setMenuOpen((value) => !value); setBellOpen(false); }}>
              <span className="grid h-8 w-8 place-items-center rounded-full bg-pulse-accent text-xs font-semibold text-white">{initials(displayName)}</span>
              <span className="hidden min-w-0 sm:block">
                <span className="block max-w-36 truncate text-sm font-medium text-pulse-ink">{displayName}</span>
                <span className="block max-w-36 truncate text-xs text-pulse-muted">{profileSubtitle}</span>
              </span>
            </button>
            {menuOpen ? (
              <div className="absolute right-0 z-30 mt-1 w-44 rounded-lg border border-pulse-border bg-pulse-surface py-1 shadow-lg">
                <p className="px-3 py-2 text-xs text-pulse-muted">{me.data?.email}</p>
                <button type="button" className="block w-full px-3 py-2 text-left text-sm text-pulse-ink hover:bg-pulse-hover" disabled={logout.isPending} onClick={() => logout.mutate()}>Sign out</button>
              </div>
            ) : null}
          </div>
        </header>
        <main className="px-4 py-6 sm:px-6">
          <Outlet context={data} />
        </main>
      </div>
    </div>
  );
}
