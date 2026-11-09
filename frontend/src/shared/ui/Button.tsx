import type { ButtonHTMLAttributes } from "react";

const styles = {
  primary: "bg-pulse-accent text-white hover:bg-pulse-accent-strong focus-visible:ring-2 focus-visible:ring-[var(--pulse-ring)]",
  secondary:
    "border border-pulse-border bg-pulse-surface text-pulse-ink hover:bg-pulse-hover focus-visible:ring-2 focus-visible:ring-[var(--pulse-ring)]",
  ghost: "text-pulse-ink hover:bg-pulse-hover focus-visible:ring-2 focus-visible:ring-[var(--pulse-ring)]",
  danger: "bg-pulse-danger text-white hover:opacity-90 focus-visible:ring-2 focus-visible:ring-rose-400/40",
};

const sizes = {
  sm: "px-2.5 py-1 text-xs",
  md: "px-3 py-2 text-sm",
  lg: "px-4 py-2.5 text-base",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof styles;
  size?: keyof typeof sizes;
};

export function Button({ variant = "primary", size = "md", className = "", ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-md font-semibold transition disabled:cursor-not-allowed disabled:opacity-55 ${styles[variant]} ${sizes[size]} ${className}`}
      {...props}
    />
  );
}
