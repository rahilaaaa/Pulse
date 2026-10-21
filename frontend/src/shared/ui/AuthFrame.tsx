import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { PulseMark } from "./PulseMark";

export function AuthFrame({ children, hero = false }: { children: ReactNode; hero?: boolean }) {
  return (
    <div className="flex min-h-screen flex-col">
      <div className={`mx-auto flex w-full flex-1 flex-col items-center px-4 ${hero ? "justify-center py-16" : "max-w-md py-12"}`}>
        {hero ? null : (
          <Link to="/welcome" className="mb-8" aria-label="Pulse home">
            <PulseMark />
          </Link>
        )}
        {children}
      </div>
      <footer className="px-4 pb-8 text-center text-sm text-slate-500">
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
    <section className="w-full rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
      {description ? <div className="mt-2 text-sm leading-6 text-slate-500">{description}</div> : null}
      <div className="mt-6">{children}</div>
    </section>
  );
}
