import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "@/lib/cx";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success" | "outline";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-gold text-ink-900 hover:bg-gold-light shadow-card",
  secondary: "bg-ink-600 text-[var(--text)] hover:bg-ink-500 border border-[var(--line)]",
  ghost: "text-muted hover:text-[var(--text)] hover:bg-white/5",
  danger: "bg-chip-red text-white hover:brightness-110",
  success: "bg-felt-light text-white hover:brightness-110",
  outline: "border border-gold/50 text-gold hover:bg-gold/10",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-[0.8rem]",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-5 text-[0.95rem]",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button({ variant = "primary", size = "md", className, children, ...rest }: ButtonProps) {
  return (
    <button
      className={cx(
        "inline-flex select-none items-center justify-center gap-2 rounded-[10px] font-semibold transition",
        "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Badge({
  children,
  color,
  className,
}: {
  children: ReactNode;
  color?: string;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.68rem] font-semibold leading-none",
        className,
      )}
      style={color ? { background: `${color}22`, color } : undefined}
    >
      {children}
    </span>
  );
}

export function ProgressBar({
  value,
  max = 100,
  className,
  tone = "var(--gold)",
}: {
  value: number;
  max?: number;
  className?: string;
  tone?: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div
      className={cx("h-2 overflow-hidden rounded-full bg-ink-600", className)}
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemax={max}
    >
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: tone }} />
    </div>
  );
}

export function Card({
  children,
  className,
  glass,
}: {
  children: ReactNode;
  className?: string;
  glass?: boolean;
}) {
  return (
    <div
      className={cx(
        "rounded-[16px] border border-[var(--line)] p-5",
        glass ? "glass" : "bg-ink-800/80",
        className,
      )}
    >
      {children}
    </div>
  );
}
