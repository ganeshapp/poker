/**
 * What an action is worth, in chips.
 *
 * The bots used to decide by looking a frequency up in a chart and rolling a
 * die against it. That works where the chart has a row and collapses where it
 * does not — and the fallback was to fold. Two things followed from that, both
 * visible in real sessions:
 *
 *   - A re-raise is looked up as `myPosition_vs_raiserPosition`, and every one
 *     of those charts is "defender versus an EARLIER seat". When the hero
 *     3-bets, the raiser is in a LATER seat, so the lookup misses every time
 *     and every adaptation term multiplies a zero. Bots folded 94.5% of the
 *     time to a 7bb 3-bet across 769 hands and never adjusted.
 *   - A bot folded for 12 chips into a pot of 534. That is not a mistuned
 *     frequency. It is the absence of arithmetic.
 *
 * So this module is the evaluation function the policy was missing — the thing
 * centipawn loss is computed FROM, not a rule about any particular spot. Give
 * it the price, the pot, an equity estimate and a read on who is left, and it
 * prices fold / call / raise. The charts stay as a fast path for the spots
 * they cover; out of book now falls through to thinking rather than folding.
 */
import type { Player, Street } from "../types/poker.ts";
import { readPlayer, type Read } from "./profile.ts";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * How often this player lets a bet through, for a bet of `price` into `pot`.
 *
 * Built from what they have actually been folding, then bent by the size:
 * everyone folds more to a bigger bet, but the curve flattens — doubling a
 * bet does not double the folds. With no read yet it starts at a plain
 * opponent rather than at either extreme.
 */
export function foldChance(
  read: Read,
  street: Street,
  price: number,
  pot: number,
): number {
  const base =
    street === "preflop"
      ? read.confidence > 0.2
        ? read.foldToRaise
        : 0.55
      : read.confidence > 0.2
        ? read.foldToCbet
        : 0.5;
  // Half pot is the reference. A pot-sized bet folds out a little more, a
  // third-pot a little less; the exponent keeps it from running away.
  const ratio = pot > 0 ? clamp(price / pot, 0.1, 2.5) : 0.5;
  const sized = base * Math.pow(ratio / 0.5, 0.35);
  return clamp(sized, 0.02, 0.95);
}

/** The chance EVERY one of these players folds — what a bluff needs. */
export function allFoldChance(
  opponents: Player[],
  street: Street,
  price: number,
  pot: number,
): number {
  let p = 1;
  for (const q of opponents) {
    if (q.hasFolded || q.sittingOut) continue;
    // Somebody already all-in cannot fold, so "everybody folds" is simply
    // impossible and the bluff has no fold equity at all. Without this the
    // 0.02 floor inside foldChance credited a raise with fold equity against
    // a player who is contesting the pot no matter what, and bots 4-bet 72o
    // into a standing all-in.
    if (q.isAllIn) return 0;
    p *= foldChance(readPlayer(q), street, price, pot);
  }
  return p;
}

/**
 * How much of its raw equity a hand actually collects.
 *
 * A hand that is 40% to win does not win 40% of the pot: it gets outplayed
 * out of position, folds some of its equity away on later streets, and is
 * worth less against several opponents than against one. Roughly 1 in
 * position heads-up, falling from there.
 */
export function realisation(
  opponents: number,
  inPosition: boolean,
  /** Chips behind, over the pot you would be playing for. */
  spr = 2,
): number {
  const seats = Math.max(1, opponents);
  // Deep money is worse for the caller, and much worse out of position:
  // more streets to be outplayed on, and every one of them acted on first.
  // Without this the evaluator treated calling as "see five cards and claim
  // your share", which is how bots ended up stacking off 13% of hands.
  const depth = clamp((spr - 2) * (inPosition ? 0.016 : 0.03), 0, 0.3);
  // The bases are deliberately pessimistic. Raw equity assumes you get to
  // see five cards and claim your share, and a caller does neither: there
  // are two more rounds of betting in which the hand can be given up or
  // charged, every one of them acted on first when out of position. Setting
  // these generously had the bots call off 13% of hands.
  return clamp(
    (inPosition ? 0.9 : 0.72) - (seats - 1) * 0.08 - depth,
    0.4,
    1,
  );
}

/** Chips won or lost, on average, by calling `cost` to contest `pot`. */
export function callEv(
  equity: number,
  pot: number,
  cost: number,
  realise = 1,
): number {
  const share = clamp(equity * realise, 0, 1);
  return share * (pot + cost) - cost;
}

/**
 * Chips won or lost by raising, counting both ways it can end: everybody
 * folds, or somebody continues and the hand plays on for a bigger pot.
 */
export function raiseEv(
  equity: number,
  pot: number,
  /** Extra chips this raise puts in beyond what is already committed. */
  cost: number,
  foldsEverybody: number,
  realise = 1,
  /**
   * What WE already owed before raising. The caller is matching our raise
   * from a position further along than ours: they have the current bet in
   * already, so they put in `cost - toCall`, not `cost`. Treating their call
   * as the full `cost` inflated the called pot by exactly this much — enough
   * to make the raise outrank the call for a band of equities where the
   * branch's own arithmetic says call.
   */
  toCall = 0,
): number {
  const fe = clamp(foldsEverybody, 0, 1);
  const share = clamp(equity * realise, 0, 1);
  // Called: our raise plus theirs, and theirs is short by what we owed.
  const theirs = Math.max(0, cost - toCall);
  const called = share * (pot + cost + theirs) - cost;
  return fe * pot + (1 - fe) * called;
}

/** One priced option. */
export interface PricedAction {
  kind: "fold" | "call" | "raise";
  ev: number;
  /** Total chips this street for a raise; the call amount for a call. */
  to?: number;
}

/**
 * Rank fold / call / raise by what each is worth.
 *
 * Folding is the zero: chips already in the pot are not yours and do not
 * enter the comparison. That single convention is what makes a fold for 12
 * into 534 impossible to choose — any hand with more than about 2% equity
 * prices the call above zero, and no rule about "small bets" is needed.
 */
export function priceActions(opts: {
  equity: number;
  pot: number;
  callCost: number;
  canCall: boolean;
  canRaise: boolean;
  raiseTo?: number;
  raiseCost?: number;
  foldsEverybody?: number;
  realise?: number;
  /** What we owe before acting — see `raiseEv`. Also caps the winnable pot. */
  toCall?: number;
}): PricedAction[] {
  const realise = opts.realise ?? 1;
  const out: PricedAction[] = [{ kind: "fold", ev: 0 }];
  if (opts.canCall) {
    out.push({
      kind: "call",
      ev: callEv(opts.equity, opts.pot, opts.callCost, realise),
      to: opts.callCost,
    });
  }
  if (opts.canRaise && opts.raiseTo !== undefined && opts.raiseCost !== undefined) {
    out.push({
      kind: "raise",
      ev: raiseEv(
        opts.equity,
        opts.pot,
        opts.raiseCost,
        opts.foldsEverybody ?? 0.5,
        realise,
        opts.toCall ?? 0,
      ),
      to: opts.raiseTo,
    });
  }
  return out.sort((a, b) => b.ev - a.ev);
}

/**
 * Pick from priced options, mixing between ones that are close.
 *
 * Always taking the top-EV action makes a bot that can be read off a single
 * decision, and real edges are rarely clean enough to justify it. Anything
 * within `band` chips of the best is treated as a live option and chosen in
 * proportion to how close it is, so the mix moves with the spot instead of
 * being a constant somebody can learn.
 */
export function chooseByEv(
  ranked: PricedAction[],
  roll: number,
  band: number,
): PricedAction {
  if (ranked.length === 0) return { kind: "fold", ev: 0 };
  const best = ranked[0].ev;
  const live = ranked.filter((a) => best - a.ev <= Math.max(1e-9, band));
  if (live.length === 1) return live[0];
  const weights = live.map((a) => Math.max(1e-6, band - (best - a.ev)));
  const total = weights.reduce((x, y) => x + y, 0);
  let acc = 0;
  const target = clamp(roll, 0, 0.999999) * total;
  for (let i = 0; i < live.length; i++) {
    acc += weights[i];
    if (target < acc) return live[i];
  }
  return live[live.length - 1];
}
