import type { ButtonHTMLAttributes } from "react";

const styles = {
  primary: "bg-pulse-accent text-white hover:bg-pulse-accent-strong focus-visible:ring-2 focus-visible:ring-[var(--pulse-ring)]",
  secondary:
    "border border-pulse-border bg-pulse-surface text-pulse-ink hover:bg-pulse-hover focus-visible:ring-2 focus-visible:ring-[var(--pulse-ring)]",
  ghost: "text-pulse-ink hover:bg-pulse-hover focus-visible:ring-2 focus-visible:ring-[var(--pulse-ring)]",
  danger: "bg-pulse-danger text-white hover:opacity-90 focus-visible:ring-2 focus-visible:ring-rose-400/40",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof styles;
};

export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-55 ${styles[variant]} ${className}`}
      {...props}
    />
  );
}
