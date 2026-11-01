import { useQuery } from "@tanstack/react-query";
import { Link, Navigate } from "react-router-dom";
import { api } from "../../shared/api/client";
import type { CurrentUser } from "../../shared/api/types";
import { AuthFrame } from "../../shared/ui/AuthFrame";
import { PulseMark } from "../../shared/ui/PulseMark";
import { LoadingState } from "../../shared/ui/States";

export function WelcomePage() {
  const current = useQuery({
    queryKey: ["me"],
    queryFn: () => api<CurrentUser>("/api/v1/auth/me/"),
    retry: false,
  });

  if (current.isLoading) {
    return (
      <main className="grid min-h-screen place-items-center">
        <LoadingState label="Checking your session" />
      </main>
    );
  }
  if (current.data?.platform_permissions.includes("platform.companies.view")) {
    return <Navigate to="/platform" replace />;
  }
  if (current.data) {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <AuthFrame hero>
      <div className="mx-auto flex max-w-xl flex-col items-center text-center">
        <PulseMark size="lg" />
        <h1 className="mt-6 text-4xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">Pulse</h1>
        <p className="mt-3 text-lg text-slate-500 dark:text-slate-400">Workforce & Company Management Platform</p>
        <p className="mt-4 max-w-md text-base leading-7 text-slate-500 dark:text-slate-400">
          Create and manage your company workspace, people, organization, work, and optional business modules in one place.
        </p>
        <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:justify-center">
          <Link
            to="/register"
            className="inline-flex items-center justify-center rounded-lg bg-teal-800 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-900"
          >
            Create a New Company
            <span aria-hidden="true" className="ml-2">→</span>
          </Link>
          <Link
            to="/login"
            className="inline-flex items-center justify-center rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-5 py-3 text-sm font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Sign In
          </Link>
        </div>
        <p className="mt-8 inline-flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
            <path d="M12 3l7 3v6c0 4.5-2.8 7.4-7 9-4.2-1.6-7-4.5-7-9V6l7-3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          </svg>
          Every company gets its own isolated workspace.
        </p>
      </div>
    </AuthFrame>
  );
}
