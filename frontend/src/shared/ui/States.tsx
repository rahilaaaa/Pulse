import type { ReactNode } from "react";

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-pulse-border bg-pulse-surface px-6 py-16 text-center">
      <h2 className="text-lg font-semibold text-pulse-ink">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-pulse-muted">{body}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50 px-6 py-10 dark:border-rose-900 dark:bg-rose-950">
      <h2 className="text-lg font-semibold text-rose-900 dark:text-rose-100">{title}</h2>
      <p className="mt-2 text-sm text-rose-800 dark:text-rose-200">{body}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-pulse-border bg-pulse-surface px-4 py-8 text-sm text-pulse-muted" role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-pulse-border border-t-pulse-accent" />
      {label}
    </div>
  );
}
