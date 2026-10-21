type PulseMarkProps = {
  wordmark?: boolean;
  size?: "sm" | "md" | "lg";
};

const sizes = {
  sm: "h-8 w-8 rounded-lg",
  md: "h-11 w-11 rounded-xl",
  lg: "h-14 w-14 rounded-2xl",
};

export function PulseMark({ wordmark = false, size = "md" }: PulseMarkProps) {
  return (
    <span className="inline-flex items-center gap-2.5 text-slate-900">
      <span className={`inline-flex items-center justify-center bg-teal-800 text-white ${sizes[size]}`}>
        <svg viewBox="0 0 24 24" className={size === "sm" ? "h-4 w-4" : "h-6 w-6"} fill="none" aria-hidden="true">
          <path d="M3 12h4.2l2.1-5.2 3.6 10.4 2.2-5.2H21" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      {wordmark ? <span className="text-lg font-semibold tracking-tight">Pulse</span> : null}
    </span>
  );
}
