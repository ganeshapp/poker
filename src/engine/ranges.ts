import type { HandLabel, Position } from "../types/poker.ts";
import { RANKS_DESC } from "../types/poker.ts";
import { allLabels, comboCount, kindOf, TOTAL_COMBOS } from "./notation.ts";

/* ------------------------------------------------------------------
   Preflop hand strength + range construction.

   We use the Chen formula (a well-known preflop heuristic) to order
   the 169 starting hands, then build position/archetype-aware ranges
   by taking the strongest hands up to a target % of all combos.
   This keeps ranges principled and explainable (and reusable in the
   Study module) without hardcoding 169 hands by hand.
   ------------------------------------------------------------------ */

function rankValue(r: string): number {
  return RANKS_DESC.length - 1 - RANKS_DESC.indexOf(r as any) + 2; // 2..14
}

/** Chen formula score for a starting-hand label. Higher = stronger. */
export function chenScore(label: HandLabel): number {
  const kind = kindOf(label);
  const hi = label[0];
  const hiVal = rankValue(hi);

  // Base value of the highest card.
  const highCardScore = (v: number): number => {
    if (v === 14) return 10; // Ace
    if (v === 13) return 8; // King
    if (v === 12) return 7; // Queen
    if (v === 11) return 6; // Jack
    return v / 2; // Ten=5, Nine=4.5, ... Two=1
  };

  if (kind === "pair") {
    return Math.max(5, highCardScore(hiVal) * 2);
  }

  const lo = label[1];
  const loVal = rankValue(lo);
  let score = highCardScore(hiVal);
  if (kind === "suited") score += 2;

  const gap = hiVal - loVal - 1;
  if (gap === 1) score -= 1;
  else if (gap === 2) score -= 2;
  else if (gap === 3) score -= 4;
  else if (gap >= 4) score -= 5;

  // Straight bonus: 0/1 gap and both cards below Queen.
  if (gap <= 1 && hiVal < 12) score += 1;

  return score;
}

interface RankedHand {
  label: HandLabel;
  score: number;
  combos: number;
}

let _ranked: RankedHand[] | null = null;

/** All 169 hands sorted strongest → weakest. */
export function rankedHands(): RankedHand[] {
  if (_ranked) return _ranked;
  _ranked = allLabels()
    .map((label) => ({ label, score: chenScore(label), combos: comboCount(label) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // tie-break: pairs > suited > offsuit, then high card
      const order = { pair: 0, suited: 1, offsuit: 2 } as const;
      const ka = order[kindOf(a.label)];
      const kb = order[kindOf(b.label)];
      if (ka !== kb) return ka - kb;
      return rankValue(b.label[0]) - rankValue(a.label[0]);
    });
  return _ranked;
}

/** Map of label -> 1-based strength rank (1 = AA). */
export function strengthRankMap(): Map<HandLabel, number> {
  const m = new Map<HandLabel, number>();
  rankedHands().forEach((h, i) => m.set(h.label, i + 1));
  return m;
}

/** Strongest hands up to `pct`% of all 1326 combos. */
export function topPercentRange(pct: number): Set<HandLabel> {
  const target = (Math.max(0, Math.min(100, pct)) / 100) * TOTAL_COMBOS;
  const out = new Set<HandLabel>();
  let acc = 0;
  for (const h of rankedHands()) {
    if (acc >= target) break;
    out.add(h.label);
    acc += h.combos;
  }
  return out;
}

/** Position widens/tightens a base frequency. 1.0 = neutral. */
export function positionMultiplier(pos: Position): number {
  switch (pos) {
    case "UTG": return 0.5;
    case "MP": return 0.68;
    case "CO": return 0.9;
    case "BTN": return 1.25;
    case "SB": return 0.85;
    case "BB": return 1.0;
  }
}

export interface PreflopRanges {
  /** Hands the player will voluntarily play (call or raise). */
  play: Set<HandLabel>;
  /** Hands the player will raise / re-raise with. */
  raise: Set<HandLabel>;
}

/**
 * Build a player's preflop ranges from archetype VPIP/PFR and seat position.
 * VPIP sizes the play range; PFR sizes the (stronger) raising range.
 */
export function buildPreflopRanges(vpip: number, pfr: number, pos: Position): PreflopRanges {
  const mult = positionMultiplier(pos);
  const playPct = Math.max(4, Math.min(90, vpip * mult));
  const raisePct = Math.max(2, Math.min(playPct, pfr * mult));
  return {
    play: topPercentRange(playPct),
    raise: topPercentRange(raisePct),
  };
}

/** Canonical example ranges used by the Study curriculum. */
export const STUDY_RANGES: { title: string; pct: number; note: string }[] = [
  { title: "UTG Open (~14%)", pct: 14, note: "Tightest opening range — premium pairs, big broadways, AK–AQ." },
  { title: "CO Open (~27%)", pct: 27, note: "Widen with suited connectors and more broadways." },
  { title: "BTN Open (~45%)", pct: 45, note: "Steal wide — any pair, most suited hands, many offsuit broadways." },
  { title: "BB Defend (~55%)", pct: 55, note: "Closing the action with a price; defend wide vs a single raise." },
];
