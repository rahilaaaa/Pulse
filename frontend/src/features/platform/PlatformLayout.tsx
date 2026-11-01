import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { api, clearCsrfToken } from "../../shared/api/client";
import type { CurrentUser } from "../../shared/api/types";
import { ThemeToggle } from "../../shared/theme/ThemeToggle";
import { Button } from "../../shared/ui/Button";
import { ConfirmDialog } from "../../shared/ui/ConfirmDialog";

const NAV = [
  { to: "/platform", label: "Overview", end: true },
  { to: "/platform/companies", label: "Companies", end: false },
  { to: "/platform/users", label: "Users", end: false },
  { to: "/platform/billing", label: "Subscriptions and billing", end: false },
  { to: "/platform/modules", label: "Modules", end: false },
  { to: "/platform/audit", label: "Audit logs", end: false },
  { to: "/platform/settings", label: "Platform settings", end: false },
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
    <div className="min-h-screen bg-pulse-canvas lg:grid lg:grid-cols-[16rem_1fr]">
      <aside className="pulse-chrome-sidebar lg:min-h-screen">
        <div className="flex items-center justify-between px-4 py-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-teal-300">Pulse</p>
            <p className="text-lg font-semibold">Platform</p>
          </div>
          <button className="rounded-md border border-slate-700 px-2 py-1 text-sm text-slate-200 lg:hidden" type="button" onClick={() => setOpen((value) => !value)}>
            Menu
          </button>
        </div>
        <nav className={`${open ? "block" : "hidden"} space-y-1 px-3 pb-4 lg:block`} aria-label="Platform">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `block rounded-md px-3 py-2 text-sm transition ${isActive ? "bg-teal-600 text-white" : "text-slate-300 hover:bg-slate-800 hover:text-white"}`
              }
              onClick={() => setOpen(false)}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="min-w-0">
        <header className="flex items-center justify-between gap-3 border-b border-pulse-border bg-pulse-surface px-4 py-3 sm:px-6">
          <p className="text-sm text-pulse-muted">Operator console</p>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <Button variant="secondary" type="button">
                  {user?.email ?? "Account"}
                </Button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content className="z-20 min-w-56 rounded-md border border-pulse-border bg-pulse-surface p-2 shadow-lg" align="end">
                  <p className="px-2 py-1 text-xs text-pulse-muted">Signed in</p>
                  <p className="px-2 pb-2 text-sm text-pulse-ink">{user?.email}</p>
                  <ConfirmDialog
                    title="Sign out"
                    body="This ends the platform session on this browser."
                    confirmLabel="Sign out"
                    onConfirm={() => logout.mutate()}
                    trigger={
                      <button className="w-full rounded-md px-2 py-2 text-left text-sm text-pulse-ink hover:bg-pulse-hover" type="button">
                        Sign out
                      </button>
                    }
                  />
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </header>
        <main className="px-4 py-6 sm:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
