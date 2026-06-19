import type { Action, GameState, HandLabel } from "../types/poker.ts";
import { legalActions } from "./engine.ts";
import { ARCHETYPES } from "./archetypes.ts";
import { buildPreflopRanges, positionMultiplier, topPercentRange } from "../engine/ranges.ts";
import { allLabels, cardsToLabel } from "../engine/notation.ts";
import { equityVsRandom, comboToInts } from "../engine/equity.ts";
import { cardToInt } from "../engine/cards.ts";

/* ==================================================================
   Bot decision policy.

   Preflop: position/archetype-aware ranges (Chen-ranked) drive open /
   3-bet / call / fold. Postflop: Monte-Carlo hand strength (TS engine,
   fast + synchronous) combined with the archetype's aggression and
   "stickiness" knobs. Also returns the perceived range it is
   representing, which the store records for the Peek feature.
   ================================================================== */

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

export function decideBot(s: GameState, seat: number): BotDecision {
  const p = s.players[seat];
  if (!p.archetype || !p.hole) return { action: { type: "fold" }, range: [] };
  const cfg = ARCHETYPES[p.archetype];
  const la = legalActions(s);
  const label = cardsToLabel(p.hole[0], p.hole[1]);
  const bb = s.bigBlind;
  const rnd = Math.random();

  if (s.street === "preflop") {
    const ranges = buildPreflopRanges(cfg.vpip, cfg.pfr, p.position);
    const inPlay = ranges.play.has(label);
    const inRaise = ranges.raise.has(label);
    const callRange = setDiff(ranges.play, ranges.raise);
    const facingRaise = s.currentBet > bb;

    if (!facingRaise) {
      if (inRaise) {
        const limpers = s.players.filter(
          (q) => !q.hasFolded && q.committed === bb && q.position !== "BB",
        ).length;
        const to = clampInt((2.5 + limpers) * bb, la.minRaiseTo, la.maxRaiseTo);
        return { action: betOrRaise(s, to), range: [...ranges.raise] };
      }
      if (la.canCheck) {
        // BB with the option: range is everything not raised.
        return { action: { type: "check" }, range: setDiff(new Set(ALL_LABELS), ranges.raise) };
      }
      if (inPlay && la.canCall && la.callAmount <= bb && (cfg.archetype === "Station" || cfg.archetype === "LAG")) {
        return { action: { type: "call", amount: la.callAmount }, range: callRange };
      }
      return { action: { type: "fold" }, range: [] };
    }

    // Facing a raise.
    const threeBetPct = Math.max(2, cfg.pfr * positionMultiplier(p.position) * 0.4);
    const threeBet = topPercentRange(threeBetPct);
    if (threeBet.has(label) && rnd < cfg.aggression) {
      const to = clampInt(s.currentBet * 3, la.minRaiseTo, la.maxRaiseTo);
      return { action: betOrRaise(s, to), range: [...threeBet] };
    }
    if (inPlay && la.canCall) {
      const priceOk = la.callAmount <= bb * 4 || cfg.stickiness > 0.6;
      if (priceOk) return { action: { type: "call", amount: la.callAmount }, range: callRange };
    }
    return { action: { type: "fold" }, range: [] };
  }

  // ---- Postflop ----
  const holeInts = comboToInts(p.hole);
  const boardInts = s.board.map(cardToInt);
  const e = equityVsRandom(holeInts, boardInts, 320).equity;
  const facingBet = la.toCall > 0;

  if (!facingBet) {
    const wantsValue = e > 0.6;
    const cbet = rnd < cfg.cbetFlop / 100 && e > 0.34;
    const bluff = Math.random() < cfg.aggression * 0.22;
    if ((wantsValue || cbet || bluff) && la.canBet) {
      const to = clampInt(s.pot * 0.6, la.minRaiseTo, la.maxRaiseTo);
      if (to > 0) return { action: { type: "bet", amount: to }, range: null };
    }
    return { action: { type: "check" }, range: null };
  }

  // Facing a bet.
  const needed = la.callAmount / (s.pot + la.callAmount);
  if (e > 0.78 && la.canRaise && Math.random() < cfg.aggression) {
    const to = clampInt(s.currentBet + s.pot * 0.8, la.minRaiseTo, la.maxRaiseTo);
    return { action: { type: "raise", amount: to }, range: null };
  }
  const callThreshold = needed * (1 - cfg.stickiness * 0.5);
  if (e >= callThreshold && la.canCall) {
    return { action: { type: "call", amount: la.callAmount }, range: null };
  }
  if (cfg.stickiness > 0.7 && la.canCall && la.callAmount <= s.pot * 0.5 && Math.random() < 0.7) {
    return { action: { type: "call", amount: la.callAmount }, range: null };
  }
  return { action: { type: "fold" }, range: null };
}
