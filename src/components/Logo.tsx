import { useId } from "react";
import { cx } from "@/lib/cx";

interface LogoProps {
  size?: number;
  withWordmark?: boolean;
  className?: string;
}

/** Poker-chip mark with an optional "All-In · Poker Dojo" wordmark. */
export function Logo({ size = 40, withWordmark = false, className }: LogoProps) {
  const uid = useId().replace(/:/g, "");
  const body = `body-${uid}`;
  const gold = `gold-${uid}`;
  return (
    <div className={cx("flex items-center gap-3", className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        role="img"
        aria-label="All-In logo"
        style={{ filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.45))" }}
      >
        <defs>
          <radialGradient id={body} cx="50%" cy="36%" r="72%">
            <stop offset="0%" stopColor="#15935f" />
            <stop offset="60%" stopColor="#0e6b46" />
            <stop offset="100%" stopColor="#093d2a" />
          </radialGradient>
          <linearGradient id={gold} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f4dd92" />
            <stop offset="100%" stopColor="#c79a36" />
          </linearGradient>
        </defs>
        <circle cx="32" cy="32" r="30" fill={`url(#${body})`} stroke="#072a1d" strokeWidth="2" />
        <circle cx="32" cy="32" r="25.5" fill="none" stroke="#f4dd92" strokeWidth="5" strokeDasharray="6 7.34" />
        <circle cx="32" cy="32" r="19" fill="#0a4f34" stroke="#f4dd92" strokeWidth="1.4" />
        <path
          d="M32 16 C 26 24, 16 30, 16 37 C 16 42, 20 45, 24.5 43.5 C 24 46, 22 48.5, 19.5 50 L 44.5 50 C 42 48.5, 40 46, 39.5 43.5 C 44 45, 48 42, 48 37 C 48 30, 38 24, 32 16 Z"
          fill={`url(#${gold})`}
        />
      </svg>
      {withWordmark && (
        <div className="leading-none">
          <div className="font-display text-[1.4rem] font-extrabold tracking-tight text-[var(--text)]">
            All-In
          </div>
          <div className="mt-1 text-[0.6rem] font-semibold uppercase tracking-[0.34em] text-gold/80">
            Poker Dojo
          </div>
        </div>
      )}
    </div>
  );
}
