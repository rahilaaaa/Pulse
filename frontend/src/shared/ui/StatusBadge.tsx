const tones: Record<string, string> = {
  draft: "bg-pulse-hover text-pulse-muted",
  active: "bg-teal-50 text-teal-800 dark:bg-teal-950 dark:text-teal-300",
  accepted: "bg-teal-50 text-teal-800 dark:bg-teal-950 dark:text-teal-300",
  pending: "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  ready: "bg-sky-50 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  suspended: "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  expired: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  revoked: "bg-rose-50 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
  closed: "bg-rose-50 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
  inactive: "bg-rose-50 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
};

const labels: Record<string, string> = {
  ready: "Not sent",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${tones[status] ?? tones.draft}`}>
      {labels[status] ?? status}
    </span>
  );
}
