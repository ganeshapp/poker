import type { Card, HandLabel, Rank } from "../types/poker.ts";
import { RANKS_DESC, SUITS } from "../types/poker.ts";

/* ------------------------------------------------------------------
   13x13 starting-hand grid utilities.
   Convention: rows/cols indexed by RANKS_DESC (A=0 .. 2=12).
     r == c           -> pair        ("AA")
     c  > r (upper)   -> suited      ("AKs")
     r  > c (lower)   -> offsuit     ("AKo")
   ------------------------------------------------------------------ */

export type ComboKind = "pair" | "suited" | "offsuit";

export function labelAt(row: number, col: number): HandLabel {
  const hi = RANKS_DESC[Math.min(row, col)];
  const lo = RANKS_DESC[Math.max(row, col)];
  if (row === col) return `${hi}${hi}`;
  if (col > row) return `${hi}${lo}s`;
  return `${hi}${lo}o`;
}

export function kindOf(label: HandLabel): ComboKind {
  if (label.length === 2) return "pair";
  return label.endsWith("s") ? "suited" : "offsuit";
}

export function comboCount(label: HandLabel): number {
  const k = kindOf(label);
  return k === "pair" ? 6 : k === "suited" ? 4 : 12;
}

/** All 169 labels in grid order (row-major). */
export function allLabels(): HandLabel[] {
  const out: HandLabel[] = [];
  for (let r = 0; r < 13; r++) for (let c = 0; c < 13; c++) out.push(labelAt(r, c));
  return out;
}

/** Total number of two-card combos represented by a set of labels. */
export function combosInSet(labels: Iterable<HandLabel>): number {
  let n = 0;
  for (const l of labels) n += comboCount(l);
  return n;
}

export const TOTAL_COMBOS = 1326; // C(52,2)

/** Expand a label into its concrete two-card combos. */
export function labelToCombos(label: HandLabel): [Card, Card][] {
  const out: [Card, Card][] = [];
  const k = kindOf(label);
  const hi = label[0] as Rank;
  if (k === "pair") {
    for (let i = 0; i < SUITS.length; i++)
      for (let j = i + 1; j < SUITS.length; j++)
        out.push([hi + SUITS[i], hi + SUITS[j]]);
    return out;
  }
  const lo = label[1] as Rank;
  if (k === "suited") {
    for (const s of SUITS) out.push([hi + s, lo + s]);
  } else {
    for (const s1 of SUITS)
      for (const s2 of SUITS)
        if (s1 !== s2) out.push([hi + s1, lo + s2]);
  }
  return out;
}

/** Two concrete cards -> their grid label, e.g. ["As","Kd"] -> "AKo". */
export function cardsToLabel(a: Card, b: Card): HandLabel {
  const ra = a[0] as Rank;
  const rb = b[0] as Rank;
  const ia = RANKS_DESC.indexOf(ra);
  const ib = RANKS_DESC.indexOf(rb);
  const hi = ia <= ib ? ra : rb;
  const lo = ia <= ib ? rb : ra;
  if (ra === rb) return `${hi}${hi}`;
  const suited = a[1] === b[1];
  return `${hi}${lo}${suited ? "s" : "o"}`;
}

/** Human-friendly pretty label, e.g. "AKs" stays, "AA" stays. */
export function prettyLabel(label: HandLabel): string {
  return label;
}
