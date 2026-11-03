import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { api, clearCsrfToken } from "../../shared/api/client";
import type { CurrentUser } from "../../shared/api/types";
import { ThemeToggle } from "../../shared/theme/ThemeToggle";
import { ConfirmDialog } from "../../shared/ui/ConfirmDialog";

type NavItem = {
  to: string;
  label: string;
  end?: boolean;
};

type NavGroup = {
  title: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    title: "PLATFORM",
    items: [{ to: "/platform", label: "Overview", end: true }],
  },
  {
    title: "COMPANY MANAGEMENT",
    items: [
      { to: "/platform/companies", label: "Companies" },
      { to: "/platform/onboarding", label: "Onboarding Monitor" },
    ],
  },
  {
    title: "COMMERCIAL",
    items: [
      { to: "/platform/billing", label: "Subscriptions & Billing", end: true },
      { to: "/platform/billing/plans", label: "Subscription Plans" },
    ],
  },
  {
    title: "PLATFORM CONFIGURATION",
    items: [
      { to: "/platform/modules", label: "Module Catalog" },
      { to: "/platform/settings", label: "Platform Settings" },
    ],
  },
  {
    title: "ACCESS MANAGEMENT",
    items: [
      { to: "/platform/users", label: "Platform Operators" },
      { to: "/platform/permissions", label: "Permissions Catalog" },
    ],
  },
  {
    title: "OPERATIONS",
    items: [
      { to: "/platform/audit", label: "Audit Logs" },
      { to: "/platform/health", label: "Platform Health" },
    ],
  },
];

export function PlatformLayout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const current = useQuery({ queryKey: ["me"], queryFn: () => api<CurrentUser>("/api/v1/auth/me/") });
  const logout = useMutation({
    mutationFn: () => api<void>("/api/v1/auth/logout/", { method: "POST" }),
    onSuccess: () => {
      clearCsrfToken();
      queryClient.clear();
      navigate("/login", { replace: true });
    },
  });
  const user = current.data;

  return (
    <div className="min-h-screen bg-pulse-canvas lg:grid lg:grid-cols-[17rem_1fr]">
      {/* Sidebar */}
      <aside className="pulse-chrome-sidebar flex flex-col justify-between border-r border-slate-800 lg:min-h-screen">
        <div>
          {/* Logo / Branding */}
          <div className="flex items-center justify-between border-b border-slate-800/80 px-5 py-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-600 font-bold text-white shadow-xs">
                P
              </div>
              <div>
                <p className="text-sm font-semibold tracking-wide text-white">Pulse ERP</p>
                <div className="flex items-center gap-1.5">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-teal-400"></span>
                  <p className="text-[11px] font-medium tracking-wider text-teal-300 uppercase">Platform Admin</p>
                </div>
              </div>
            </div>
            <button
              className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 lg:hidden hover:bg-slate-800"
              type="button"
              onClick={() => setOpen((value) => !value)}
            >
              {open ? "Close" : "Menu"}
            </button>
          </div>

          {/* Nav Groups */}
          <nav
            className={`${open ? "block" : "hidden"} space-y-5 px-3 py-4 lg:block`}
            aria-label="Platform Administration"
          >
            {NAV_GROUPS.map((group) => (
              <div key={group.title} className="space-y-1">
                <p className="px-3 text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                  {group.title}
                </p>
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      `flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                        isActive
                          ? "bg-teal-600/90 text-white shadow-xs"
                          : "text-slate-300 hover:bg-slate-800/80 hover:text-white"
                      }`
                    }
                    onClick={() => setOpen(false)}
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
        </div>

        {/* Footer / Operator pill */}
        <div className="border-t border-slate-800/80 p-3 hidden lg:block">
          <div className="rounded-lg bg-slate-900/60 p-2.5 border border-slate-800">
            <p className="text-[11px] font-medium text-slate-300 truncate">{user?.email || "Operator"}</p>
            <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400">
              <span>{user?.platform_permissions?.length || 0} Platform Grants</span>
              <span className="text-teal-400 font-semibold">Active</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Container */}
      <div className="min-w-0 flex flex-col">
        {/* Top Header */}
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between gap-4 border-b border-pulse-border bg-pulse-surface px-4 py-2 sm:px-6 shadow-2xs">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-md bg-teal-50 dark:bg-teal-950/60 px-2 py-0.5 text-xs font-medium text-teal-700 dark:text-teal-300 border border-teal-200/60 dark:border-teal-800/60">
              Platform Console
            </span>
            <span className="text-xs text-pulse-muted hidden sm:inline">Cross-tenant management & operations</span>
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-md border border-pulse-border bg-pulse-surface px-2.5 py-1.5 text-xs font-medium text-pulse-ink hover:bg-pulse-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600"
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-700 text-[10px] font-bold text-white">
                    {(user?.first_name?.[0] || user?.email?.[0] || "O").toUpperCase()}
                  </span>
                  <span className="max-w-[140px] truncate">{user?.email ?? "Account"}</span>
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  className="z-30 min-w-56 rounded-md border border-pulse-border bg-pulse-surface p-1.5 shadow-lg"
                  align="end"
                >
                  <div className="px-2 py-1.5 border-b border-pulse-border/60">
                    <p className="text-[11px] text-pulse-muted">Signed in as</p>
                    <p className="text-xs font-semibold text-pulse-ink truncate">{user?.email}</p>
                  </div>
                  <div className="py-1">
                    <ConfirmDialog
                      title="Sign out of Platform"
                      body="This will end your platform administration session on this browser."
                      confirmLabel="Sign out"
                      onConfirm={() => logout.mutate()}
                      trigger={
                        <button
                          className="w-full rounded px-2 py-1.5 text-left text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition"
                          type="button"
                        >
                          Sign out
                        </button>
                      }
                    />
                  </div>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
