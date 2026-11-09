import { useTheme } from "./ThemeProvider";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border border-pulse-border bg-pulse-surface text-pulse-muted transition hover:bg-pulse-hover hover:text-pulse-ink ${className}`}
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Light theme" : "Dark theme"}
    >
      {isDark ? (
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
          <circle cx="10" cy="10" r="3.25" />
          <path d="M10 2.5v1.5M10 16v1.5M2.5 10H4M16 10h1.5M4.6 4.6l1.1 1.1M14.3 14.3l1.1 1.1M15.4 4.6l-1.1 1.1M5.7 14.3l-1.1 1.1" strokeLinecap="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
          <path d="M15.5 11.2A6.2 6.2 0 0 1 8.8 4.5 5.5 5.5 0 1 0 15.5 11.2Z" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}
