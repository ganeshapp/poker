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
