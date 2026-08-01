import type { Action, Archetype, Card, GameState, HandLabel } from "../types/poker.ts";
import { legalActions } from "./engine.ts";
import { ARCHETYPES } from "./archetypes.ts";
import { allLabels, cardsToLabel, labelToCombos } from "../engine/notation.ts";
import { equityVsRandom, comboToInts, hashSeed } from "../engine/equity.ts";
import { evaluateInts } from "../engine/evaluator.ts";
import { cardToInt } from "../engine/cards.ts";
import { PREFLOP_100 } from "../data/preflop.ts";

/* ==================================================================
   Bot decision policy.

   Preflop: the real 100bb baseline charts (src/data/preflop.ts) drive
   open / 3-bet / call / fold, with each archetype applying principled
   deviations (Nit continues tighter, Station calls wide but rarely
   raises, LAG adds bluffs) — bots are exploitable BY DESIGN, never
   absurd: premiums never fold preflop, junk never stacks off cold.
   Postflop: Monte-Carlo hand strength (TS engine, fast + synchronous)
   combined with the archetype's aggression and "stickiness" knobs.
   Also returns the perceived range it is representing, which the
   store records for the Peek feature.
   ================================================================== */

interface PreflopDials {
  open: number; // multiplier on RFI frequencies
  threebet: number; // multiplier on 3-bet frequencies
  call: number; // multiplier on calling frequencies
  limpWide: boolean; // limps playable-but-not-opened hands when cheap
}

const DIALS: Record<Archetype, PreflopDials> = {
  TAG: { open: 1.0, threebet: 1.0, call: 1.0, limpWide: false },
  LAG: { open: 1.3, threebet: 1.6, call: 1.15, limpWide: true },
  Nit: { open: 0.7, threebet: 0.55, call: 0.8, limpWide: false },
  Station: { open: 0.45, threebet: 0.3, call: 1.6, limpWide: true },
};

/** Hands that never fold preflop, whatever the price. */
const PREMIUM = new Set<HandLabel>(["AA", "KK", "QQ", "AKs", "AKo"] as HandLabel[]);
const PREMIUM_LIST = [...PREMIUM];

/** Labels a chart plays at least `min` of the time (perceived-range lists). */
function chartLabels(chart: Record<string, number>, min: number): HandLabel[] {
  const out: HandLabel[] = [];
  for (const [l, f] of Object.entries(chart)) if (f >= min) out.push(l as HandLabel);
  return out;
}

export interface BotDecision {
  action: Action;
  /** Perceived holding range (grid labels). null = leave stored range unchanged. */
  range: HandLabel[] | null;
}

const ALL_LABELS = allLabels();

function clampInt(x: number, lo: number, hi: number): number {
  return Math.round(Math.max(lo, Math.min(hi, x)));
}

function setDiff(a: Set<HandLabel>, b: Set<HandLabel>): HandLabel[] {
  const out: HandLabel[] = [];
  for (const x of a) if (!b.has(x)) out.push(x);
  return out;
}

function betOrRaise(s: GameState, to: number): Action {
  return s.currentBet === 0 ? { type: "bet", amount: to } : { type: "raise", amount: to };
}

/** Bot decision plus the range it's representing. The stored range is
    guaranteed to contain the bot's actual hand whenever it continues —
    mixed-frequency actions would otherwise "prove" impossible holdings
    and corrupt Peek grading and the coach. */
export function decideBot(s: GameState, seat: number): BotDecision {
  const d = decideBotInner(s, seat);
  const p = s.players[seat];
  if (d.range != null && d.action.type !== "fold" && p.hole) {
    const label = cardsToLabel(p.hole[0], p.hole[1]);
    if (!d.range.includes(label)) d.range = [...d.range, label];
  }
  return d;
}

function decideBotInner(s: GameState, seat: number): BotDecision {
  const p = s.players[seat];
  if (!p.archetype || !p.hole) return { action: { type: "fold" }, range: [] };
  const cfg = ARCHETYPES[p.archetype];
  const la = legalActions(s);
  const label = cardsToLabel(p.hole[0], p.hole[1]);
  const bb = s.bigBlind;
  const rnd = Math.random();

  if (s.street === "preflop") {
    const dial = DIALS[cfg.archetype];
    const facingRaise = s.currentBet > bb;

    if (!facingRaise) {
      if (la.canCheck) {
        // BB with the option: raise premiums over limps, otherwise check.
        const f = Math.min(1, (PREFLOP_100.vsRfi.BB_vs_SB.threebet[label] ?? 0) * dial.threebet);
        if (rnd < f && la.canRaise) {
          const limpers = s.players.filter(
            (q) => !q.hasFolded && q.committed === bb && q.position !== "BB",
          ).length;
          const to = clampInt((3 + limpers) * bb, la.minRaiseTo, la.maxRaiseTo);
          return { action: betOrRaise(s, to), range: chartLabels(PREFLOP_100.vsRfi.BB_vs_SB.threebet, 0.25) };
        }
        return { action: { type: "check" }, range: setDiff(new Set(ALL_LABELS), new Set(chartLabels(PREFLOP_100.vsRfi.BB_vs_SB.threebet, 0.5))) };
      }

      const chart = PREFLOP_100.rfi[p.position] ?? PREFLOP_100.rfi.SB;
      const base = chart[label] ?? 0;
      // Deviations trim the BOTTOM of the range, never the top:
      // premiums always open; Nit/Station kill marginal opens, LAG
      // rounds its mixed opens up.
      let openFreq: number;
      if (PREMIUM.has(label)) openFreq = 1;
      else if (base === 0) openFreq = 0;
      else if (cfg.archetype === "LAG") openFreq = Math.max(base * dial.open, 0.9);
      else if (cfg.archetype === "Nit") openFreq = base >= 1 ? 0.92 : base * 0.35;
      else if (cfg.archetype === "Station") openFreq = base >= 1 ? 0.55 : base * 0.25;
      else openFreq = base;
      openFreq = Math.min(1, openFreq);
      if (rnd < openFreq) {
        const limpers = s.players.filter(
          (q) => !q.hasFolded && q.committed === bb && q.position !== "BB",
        ).length;
        const to = clampInt((2.5 + limpers) * bb, la.minRaiseTo, la.maxRaiseTo);
        return { action: betOrRaise(s, to), range: chartLabels(chart, 0.4) };
      }
      // Loose types limp playable hands when the price is a limp.
      if (dial.limpWide && la.canCall && la.callAmount <= bb && base > 0) {
        return { action: { type: "call", amount: la.callAmount }, range: chartLabels(chart, 0.01) };
      }
      return { action: { type: "fold" }, range: [] };
    }

    // ---- Facing a raise ----
    const aggSeat = s.aggressor;
    const raiserPos = aggSeat != null && aggSeat !== seat ? s.players[aggSeat].position : "CO";
    const facing3bet = s.currentBet > 4.5 * bb; // beyond a standard single open
    const charts = PREFLOP_100.vsRfi[`${p.position}_vs_${raiserPos}`];

    if (!facing3bet && charts) {
      let f3 = charts.threebet[label] ?? 0;
      let fc = charts.call[label] ?? 0;
      if (cfg.archetype === "Station") {
        // Stations flat their whole continue range and only raise monsters.
        fc = Math.min(1, (f3 + fc) * dial.call);
        f3 = label === "AA" || label === "KK" ? 0.5 : 0;
      } else {
        if (cfg.archetype === "Nit" && f3 < 0.9) f3 *= 0.3; // drop bluff 3-bets
        f3 = Math.min(1, f3 * dial.threebet);
        fc = Math.min(1 - f3, fc * dial.call);
      }
      if (PREMIUM.has(label)) f3 = Math.max(f3, 0.85); // premiums stay aggressive
      if (rnd < f3 && la.canRaise) {
        const to = clampInt(s.currentBet * 3.2, la.minRaiseTo, la.maxRaiseTo);
        return { action: betOrRaise(s, to), range: chartLabels(charts.threebet, 0.25) };
      }
      if (rnd < f3 + fc && la.canCall) {
        return { action: { type: "call", amount: la.callAmount }, range: chartLabels(charts.call, 0.25) };
      }
      if (PREMIUM.has(label) && la.canCall) {
        // Safety net: a premium may never fold preflop.
        return { action: { type: "call", amount: la.callAmount }, range: PREMIUM_LIST };
      }
      return { action: { type: "fold" }, range: [] };
    }

    // ---- Facing a 3-bet or bigger (or an uncharted spot) ----
    if (label === "AA" || label === "KK") {
      if (la.canRaise && rnd < 0.8) {
        const to = clampInt(s.currentBet * 2.6, la.minRaiseTo, la.maxRaiseTo);
        return { action: betOrRaise(s, to), range: PREMIUM_LIST };
      }
      if (la.canCall) return { action: { type: "call", amount: la.callAmount }, range: PREMIUM_LIST };
      if (la.canRaise) return { action: betOrRaise(s, la.maxRaiseTo), range: PREMIUM_LIST };
    }
    const f3vs = charts?.threebet[label] ?? (PREMIUM.has(label) ? 1 : 0);
    if (f3vs >= 0.9) {
      // QQ / AK class: continue — occasionally 4-bet, mostly call.
      if (la.canRaise && rnd < 0.1 + 0.35 * cfg.aggression) {
        const to = clampInt(s.currentBet * 2.6, la.minRaiseTo, la.maxRaiseTo);
        return { action: betOrRaise(s, to), range: PREMIUM_LIST };
      }
      if (la.canCall) return { action: { type: "call", amount: la.callAmount }, range: PREMIUM_LIST };
    }
    // Speculative continues vs a 3-bet: only at a sane price, by the
    // hand's own 3-bet-chart frequency, never with pure junk.
    if (f3vs > 0 && la.canCall && la.callAmount <= 12 * bb && rnd < f3vs * (0.4 + cfg.stickiness)) {
      return { action: { type: "call", amount: la.callAmount }, range: chartLabels(charts?.threebet ?? {}, 0.25) };
    }
    return { action: { type: "fold" }, range: [] };
  }

  // ---- Postflop ----
  const holeInts = comboToInts(p.hole);
  const boardInts = s.board.map(cardToInt);
  const e = equityVsRandom(holeInts, boardInts, 320).equity;
  const facingBet = la.toCall > 0;
  // Perceived-range bookkeeping: whatever this bot does, its stored
  // range narrows consistently with the policy that produced the
  // action (and is guaranteed to contain its actual hand).
  const stored = s.botRanges[p.id] ?? [];
  const narrowed = (kind: "aggro" | "call" | "check") => narrowRange(stored, s.board, kind, label);

  if (!facingBet) {
    const wantsValue = e > 0.6;
    const cbet = rnd < cfg.cbetFlop / 100 && e > 0.34;
    const bluff = Math.random() < cfg.aggression * 0.22;
    if ((wantsValue || cbet || bluff) && la.canBet) {
      const to = clampInt(s.pot * 0.6, la.minRaiseTo, la.maxRaiseTo);
      if (to > 0) return { action: { type: "bet", amount: to }, range: narrowed("aggro") };
    }
    return { action: { type: "check" }, range: narrowed("check") };
  }

  // Facing a bet.
  const needed = la.callAmount / (s.pot + la.callAmount);
  if (e > 0.78 && la.canRaise && Math.random() < cfg.aggression) {
    const to = clampInt(s.currentBet + s.pot * 0.8, la.minRaiseTo, la.maxRaiseTo);
    return { action: { type: "raise", amount: to }, range: narrowed("aggro") };
  }
  const callThreshold = needed * (1 - cfg.stickiness * 0.5);
  if (e >= callThreshold && la.canCall) {
    return { action: { type: "call", amount: la.callAmount }, range: narrowed("call") };
  }
  if (cfg.stickiness > 0.7 && la.canCall && la.callAmount <= s.pot * 0.5 && Math.random() < 0.7) {
    return { action: { type: "call", amount: la.callAmount }, range: narrowed("call") };
  }
  return { action: { type: "fold" }, range: [] };
}

/* ==================================================================
   Street-by-street range narrowing.

   Ranks every label in the stored range by its strength on the board
   (exact made-hand score on the river; a short seeded equity sample —
   which sees draws — on the flop/turn) and keeps the slice consistent
   with the action: aggression keeps the strong part plus a bluff tail,
   calling keeps the middle-and-up, checking sheds the very top. The
   bot's actual label is always retained.
   ================================================================== */

function representativeCombo(label: HandLabel, blocked: Set<number>): [number, number] | null {
  for (const [a, b] of labelToCombos(label)) {
    const ai = cardToInt(a);
    const bi = cardToInt(b);
    if (!blocked.has(ai) && !blocked.has(bi)) return [ai, bi];
  }
  return null;
}

export function narrowRange(
  stored: HandLabel[],
  board: Card[],
  kind: "aggro" | "call" | "check",
  actualLabel: HandLabel,
): HandLabel[] {
  if (stored.length <= 8) return stored.includes(actualLabel) ? stored : [...stored, actualLabel];
  const boardInts = board.map(cardToInt);
  const blocked = new Set(boardInts);
  const isRiver = board.length === 5;

  const scored: { label: HandLabel; v: number }[] = [];
  for (const l of stored) {
    const combo = representativeCombo(l, blocked);
    if (!combo) continue; // fully blocked by the board
    const v = isRiver
      ? evaluateInts([combo[0], combo[1], ...boardInts]).score
      : equityVsRandom(combo, boardInts, 80, hashSeed(`${l}|${board.join("")}`)).equity;
    scored.push({ label: l, v });
  }
  scored.sort((a, b) => b.v - a.v);

  const n = scored.length;
  let kept: HandLabel[];
  if (kind === "aggro") {
    // Value region + a thin bluff tail from the bottom (bots do bluff).
    const top = scored.slice(0, Math.max(5, Math.round(n * 0.45))).map((x) => x.label);
    const tail = scored.slice(Math.round(n * 0.85)).map((x) => x.label);
    kept = [...top, ...tail];
  } else if (kind === "call") {
    kept = scored.slice(0, Math.max(6, Math.round(n * 0.65))).map((x) => x.label);
  } else {
    // Checking sheds the very strongest slice, keeps the rest.
    kept = scored.slice(Math.round(n * 0.12)).map((x) => x.label);
  }
  if (!kept.includes(actualLabel) && stored.includes(actualLabel)) kept.push(actualLabel);
  return kept;
}
