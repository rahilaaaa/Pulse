const tones: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  active: "bg-teal-50 text-teal-800",
  suspended: "bg-amber-50 text-amber-800",
  closed: "bg-rose-50 text-rose-800",
  inactive: "bg-rose-50 text-rose-800",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${tones[status] ?? tones.draft}`}>
      {status}
    </span>
  );
}
