/** Formatting helpers — poker players think in big blinds. */
export function fmtBb(chips: number, bb: number): string {
  const v = chips / bb;
  const rounded = Math.round(v * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function fmtChips(n: number): string {
  return Math.round(n).toLocaleString();
}

export function fmtSigned(n: number, digits = 1): string {
  const v = Math.round(n * 10 ** digits) / 10 ** digits;
  return (v >= 0 ? "+" : "") + v.toFixed(digits);
}

export function fmtPct(frac: number, digits = 0): string {
  return `${(frac * 100).toFixed(digits)}%`;
}

/** Beginner-first frequency phrasing (per TONE.md): probabilities as
    counts — "about 1 time in 4", "about 7 times in 10". */
export function fmtTimes(p: number): string {
  if (p >= 0.93) return "almost every time";
  if (p <= 0.04) return "almost never";
  if (p >= 0.45) {
    const n = Math.round(p * 10);
    return `about ${n} times in 10`;
  }
  const n = Math.round(1 / p);
  return n <= 10 ? `about 1 time in ${n}` : `about 1 time in ${n}`;
}

/** "you need to win about 1 time in N" for a break-even fraction. */
export function fmtNeed(potOdds: number): string {
  if (potOdds <= 0) return "any win rate";
  const n = 1 / potOdds;
  const rounded = Math.round(n * 2) / 2;
  return `about 1 time in ${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}`;
}
