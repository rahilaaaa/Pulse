import type { ReactNode } from "react";
import { ThemeToggle } from "../../shared/theme/ThemeToggle";
import { PulseMark } from "../../shared/ui/PulseMark";
import { Button } from "../../shared/ui/Button";

export type OnboardingPhase = "company" | "information" | "review" | "modules" | "creating" | "ready";

const STEPS = [
  ["company", "Company"],
  ["information", "Information"],
  ["review", "Review"],
  ["modules", "Modules"],
  ["ready", "Workspace"],
] as const;

function stepStatus(key: string, phase: OnboardingPhase): "done" | "current" | "upcoming" {
  const order = STEPS.map(([id]) => id);
  const currentKey = phase === "creating" ? "ready" : phase;
  const current = order.indexOf(currentKey as (typeof STEPS)[number][0]);
  const index = order.indexOf(key as (typeof STEPS)[number][0]);
  if (index < current) {
    return "done";
  }
  if (index === current) {
    return phase === "ready" ? "done" : "current";
  }
  return "upcoming";
}

export function OnboardingShell({
  email,
  initials,
  phase,
  title,
  description,
  wide = false,
  heading = true,
  onSignOut,
  signingOut,
  children,
}: {
  email: string;
  initials: string;
  phase: OnboardingPhase;
  title: string;
  description: string;
  wide?: boolean;
  heading?: boolean;
  onSignOut: () => void;
  signingOut: boolean;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <PulseMark wordmark size="sm" />
          <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
            <span className="hidden sm:inline">Signed in as {email}</span>
            <ThemeToggle />
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-teal-800 text-xs font-semibold text-white">{initials}</span>
            <Button type="button" variant="ghost" disabled={signingOut} onClick={onSignOut}>
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <nav aria-label="Company setup progress" className="border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
        <ol className="mx-auto flex max-w-7xl gap-5 overflow-x-auto px-4 py-4 sm:px-6">
          {STEPS.map(([key, label], index) => {
            const status = stepStatus(key, phase);
            const current = status === "current";
            return (
              <li key={key} className="flex shrink-0 items-center gap-2 text-sm">
                <span
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                    status === "upcoming" ? "bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400" : current ? "border-2 border-teal-800 text-teal-800" : "bg-teal-800 text-white"
                  }`}
                >
                  {status === "done" ? (
                    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
                      <path d="M5 10.5l3.2 3.2L15 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    index + 1
                  )}
                </span>
                <span className={current ? "font-semibold text-slate-900 dark:text-slate-100" : "text-slate-500 dark:text-slate-400"}>{label}</span>
              </li>
            );
          })}
        </ol>
      </nav>
      <main className={`mx-auto w-full px-4 py-10 sm:px-6 ${wide ? "max-w-7xl" : "max-w-3xl"}`}>
        {heading ? (
          <>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">{title}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p>
          </>
        ) : null}
        <div className={heading ? "mt-8" : ""}>{children}</div>
      </main>
    </div>
  );
}
