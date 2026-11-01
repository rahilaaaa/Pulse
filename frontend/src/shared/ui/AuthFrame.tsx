import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ThemeToggle } from "../theme/ThemeToggle";
import { PulseMark } from "./PulseMark";

export function AuthFrame({ children, hero = false }: { children: ReactNode; hero?: boolean }) {
  return (
    <div className="relative flex min-h-screen flex-col">
      <div className="absolute right-4 top-4 z-10">
        <ThemeToggle />
      </div>
      <div className={`mx-auto flex w-full flex-1 flex-col items-center px-4 ${hero ? "justify-center py-16" : "max-w-md py-12"}`}>
        {hero ? null : (
          <Link to="/welcome" className="mb-8" aria-label="Pulse home">
            <PulseMark />
          </Link>
        )}
        {children}
      </div>
      <footer className="px-4 pb-8 text-center text-sm text-slate-500 dark:text-slate-400">
        <p>© {new Date().getFullYear()} Pulse</p>
        <p className="mt-2 flex justify-center gap-4">
          <Link className="hover:text-teal-800" to="/privacy">Privacy</Link>
          <Link className="hover:text-teal-800" to="/terms">Terms</Link>
          <Link className="hover:text-teal-800" to="/security">Security</Link>
        </p>
      </footer>
    </div>
  );
}

export function AuthCard({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section className="w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 sm:p-8">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">{title}</h1>
      {description ? <div className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</div> : null}
      <div className="mt-6">{children}</div>
    </section>
  );
}
