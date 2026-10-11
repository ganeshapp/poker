/**
 * The EV Coach — grading a hero decision and reading an opponent's move.
 *
 * Lives outside the store so there is exactly one implementation: the store
 * calls it, and `scripts/coach_ref_gen.ts` calls the same code to produce the
 * Dart port's parity fixture. A second, hand-patched copy of this logic used
 * to exist for the generator, and it drifted.
 */
import { legalActions } from "./engine.ts";
import { cardToInt } from "../engine/cards.ts";
import { hashSeed, comboToInts, type EquityResult } from "../engine/equity.ts";
import { countOuts, describeOuts, ruleOfTwoFour } from "../engine/outs.ts";
import { boardShape, type BotMoveSnapshot } from "./botRead.ts";
import { fmtBb, fmtNeed, fmtTimes } from "../lib/format.ts";
import { ARCHETYPES } from "./archetypes.ts";
import { buildPreflopRanges } from "../engine/ranges.ts";
import { PREFLOP_100 } from "../data/preflop.ts";
import { combosInSet, comboCount, cardsToLabel, labelToCombos } from "../engine/notation.ts";
import type {
  Action,
  Card,
  GameState,
  HandLabel,
  Player,
  Position,
} from "../types/poker.ts";
import type { CoachReview, Verdict } from "../store/coachTypes.ts";

/** Settings the coach needs, passed in so this module owns no store. */
export interface CoachSettings {
  mistakeBb: number;
  foldFlagBb: number;
  baseIters: number;
}

/**
 * The equity work, injected — mirroring the Dart port, which has always taken
 * an `EquityRunner`. It keeps this module free of the Tauri/worker facade, so
 * the parity generator can run it under plain Node.
 */
export interface EquityEngine {
  equityVsRange(hero: [Card, Card], board: Card[], range: HandLabel[], iters?: number, seed?: number): Promise<EquityResult>;
  equityVsRanges(hero: [Card, Card], board: Card[], ranges: [number, number][][], iters?: number, seed?: number): Promise<EquityResult>;
  equityVsField(hero: [Card, Card], board: Card[], opponents: number, iters?: number, seed?: number): Promise<EquityResult>;
  equityVsRandom(hero: [Card, Card], board: Card[], iters?: number, seed?: number): Promise<EquityResult>;
}


export function villainRangeFor(state: GameState, p: Player): HandLabel[] {
  const stored = state.botRanges[p.id];
  if (stored && stored.length) return stored;
  if (p.archetype) {
    const cfg = ARCHETYPES[p.archetype];
    return [...buildPreflopRanges(cfg.vpip, cfg.pfr, p.position).play];
  }
  return [];
}

export function firstOpponentInHand(state: GameState): number {
  for (const p of state.players) if (!p.isHero && !p.hasFolded) return p.id;
  return 1;
}

export function scoreGuess(painted: HandLabel[], actual: HandLabel[]) {
  const pSet = new Set(painted);
  const aSet = new Set(actual);
  let inter = 0;
  for (const l of pSet) if (aSet.has(l)) inter += comboCount(l);
  const pc = combosInSet(pSet);
  const ac = combosInSet(aSet);
  const precision = pc > 0 ? inter / pc : 0;
  const recall = ac > 0 ? inter / ac : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  return { accuracy: f1, precision, recall };
}

/** Captured the instant a bot acts, so the read sees the board they saw. */
/**
 * Is this hand one you open from this seat? Pre-flop that question settles
 * almost every decision on its own, which is the whole point: no percentage
 * needed, and it is the lookup a real player has memorised.
 */
function inOpeningRange(label: HandLabel, pos: Position): boolean {
  const chart = PREFLOP_100.rfi[pos] as Record<string, number> | undefined;
  return (chart?.[label] ?? 0) > 0;
}

export function snapshotMove(
  t: GameState,
  seat: number,
  action: Action,
  range: HandLabel[] | null,
): { seat: number; snapshot: BotMoveSnapshot } {
  const p = t.players[seat];
  const committedBefore = p.committed;
  const amount =
    action.type === "call"
      ? legalActions(t).callAmount
      : action.type === "bet" || action.type === "raise"
        ? Math.max(0, (action.amount ?? 0) - committedBefore)
        : 0;
  const rangeLabels = range ?? t.botRanges[seat] ?? [];
  return {
    seat,
    snapshot: {
      name: p.name,
      archetype: p.archetype,
      street: t.street,
      board: [...t.board],
      action: action.type === "post" ? "call" : action.type,
      amount,
      pot: t.pot,
      playersIn: t.players.filter((q) => !q.hasFolded && !q.sittingOut).length,
      wasPreflopRaiser: t.players[seat].pfrThisHand === true,
      // A raise after their own check on this street is a check-raise.
      checkedThisStreet:
        p.acted && p.lastAction?.label === "Check" && p.lastAction?.street === t.street,
      betLastStreet: t.aggressor === seat && t.street !== "preflop",
      handsSeen: p.handsSeen,
      rangeCombos: rangeLabels.length ? combosInSet(new Set(rangeLabels)) : 0,
    },
  };
}

export async function evaluateHero(
  state: GameState,
  action: Action,
  id: number,
  settings: CoachSettings,
  math: EquityEngine,
): Promise<CoachReview | null> {
  const hero = state.players[0];
  if (!hero.hole) return null;
  const la = legalActions(state);
  // Checks are evaluated too (below) — half the game used to be
  // invisible to the coach.

  const villId = state.aggressor != null && state.aggressor !== 0 ? state.aggressor : firstOpponentInHand(state);
  const vill = state.players[villId];
  const arche = vill.archetype;
  const cfg = arche ? ARCHETYPES[arche] : null;
  const range = villainRangeFor(state, vill);
  const combos = combosInSet(range);
  const bb = state.bigBlind;
  const heroLabel = cardsToLabel(hero.hole[0], hero.hole[1]);
  const boardStr = state.board.length ? state.board.join(" ") : "a pre-flop board";
  const opponents = state.players.filter((p) => !p.isHero && !p.hasFolded).length;
  const fieldMode = opponents > 1;
  const oppDesc = fieldMode ? `the ${opponents}-player field` : `${vill.name}'s range`;

  // Price of the decision — known before simulating, and used both for
  // verdicts and to decide whether the estimate needs tightening.
  const costNow =
    action.type === "check"
      ? 0
      : action.type === "fold" || action.type === "call"
        ? la.callAmount
        : (action.amount ?? 0) - hero.committed;
  const finalPotNow = state.pot + costNow;
  const threshold = finalPotNow > 0 ? costNow / finalPotNow : 0;

  // Deterministic per decision: same spot + same action = same verdict.
  const seedBase = hashSeed(
    `${state.handNumber}|${state.street}|${action.type}|${hero.hole.join("")}|${state.board.join("")}`,
  );
  // Every opponent still in the hand, each with the range they have actually
  // shown. Grading multiway against RANDOM hands was flattering weak holdings
  // badly — queen-high on a board of connected low cards scored as a "thin
  // spot" when it is drawing nearly dead against hands that keep betting.
  const liveOpponents = state.players.filter((p) => !p.isHero && !p.hasFolded && !p.sittingOut);
  const oppRanges = liveOpponents
    .map((p) => villainRangeFor(state, p))
    .filter((r) => r.length > 0)
    .map((r) => r.flatMap((lab) => labelToCombos(lab)).map(comboToInts));
  const haveAllRanges = oppRanges.length === liveOpponents.length && oppRanges.length > 0;

  const run = (iters: number, seed: number) =>
    fieldMode
      ? haveAllRanges
        ? math.equityVsRanges(hero.hole as [Card, Card], state.board, oppRanges, iters, seed)
        : math.equityVsField(hero.hole as [Card, Card], state.board, opponents, iters, seed)
      : range.length
        ? math.equityVsRange(hero.hole as [Card, Card], state.board, range, iters, seed)
        : math.equityVsRandom(hero.hole as [Card, Card], state.board, iters, seed);

  const { mistakeBb, foldFlagBb, baseIters } = settings;
  let equity = 0.5;
  let trials = 0;
  let se = 0;
  let exact = false;
  try {
    let r = await run(baseIters, seedBase);
    // Near the break-even line and still noisy? Escalate before judging.
    if (!r.exact && costNow > 0 && Math.abs(r.equity - threshold) < 2 * r.se) {
      r = await run(baseIters * 4, seedBase + 1);
    }
    equity = r.equity;
    trials = r.samples;
    se = r.se;
    exact = r.exact;
  } catch {
    equity = 0.5;
  }
  const margin = 2 * se; // ~95% confidence half-width
  const pct = Math.round(equity * 100);
  const marginNote = exact
    ? `Exact count — every possible holding and runout was enumerated, so there's no simulation noise.`
    : `Simulation precision: ±${(margin * 100).toFixed(1)}% on the equity (${trials.toLocaleString()} trials).`;
  const sourceLine = fieldMode
    ? haveAllRanges
      ? `Measured against all ${opponents} opponents' likely hands, given how they have played this hand (${trials}-trial sim).`
      : `Measured against ${opponents} opponents holding random cards (${trials}-trial sim) — their ranges were not known here, so treat this as a floor.`
    : `${vill.name}${cfg ? ` (${cfg.archetype})` : ""} range ≈ ${combos} combos (position + action).`;

  // Outs — the human version of the equity figure, and the one a player can
  // actually run at the table. Only meaningful with a flop or turn out.
  const outs =
    oppRanges.length > 0 && state.board.length >= 3 && state.board.length <= 4
      ? countOuts(comboToInts(hero.hole as [Card, Card]), state.board.map(cardToInt), oppRanges)
      : null;
  const outsLine = outs && !outs.ahead && outs.count > 0 ? describeOuts(outs) : "";
  const outsPlain =
    outs && !outs.ahead && outs.count > 0
      ? ` You were behind, and only ${outs.count === 1 ? "one card saves" : `${outs.count} cards save`} you — ${outs.groups[0].cardsLabel} ${outs.groups[0].makes === "a pair" ? "give you a pair" : `make ${outs.groups[0].makes}`}. That lands about ${fmtTimes(ruleOfTwoFour(outs.count, 1))}.${
          outs.holdUp !== undefined && outs.holdUp < 0.9
            ? ` And even when it does, you still lose about ${fmtTimes(1 - outs.holdUp)} — ${outs.groups[0].caution ?? "someone can hold a better version of it"}.`
            : ""
        }`
      : "";

  // Layer 3 — the reasoning, not the arithmetic. Nothing here needs a screen.
  const shape = boardShape(state.board);
  const theirAction = vill.lastAction?.label ?? "acted";
  const expertNotes: string[] = [];
  if (state.board.length === 0) {
    expertNotes.push(
      `Where this hand sits — before the flop almost every decision is "is this hand in the range I play from this seat?". ${heroLabel} from ${hero.position} ${inOpeningRange(heroLabel, hero.position) ? "is a hand you play here" : "is not a hand you play here, at any price"}. Position decides the rest: acting last is worth more than most hands are.`,
    );
  } else {
    expertNotes.push(
      `Their hands, your hand — the board is ${shape.phrase}. ${
        shape.lowConnected
          ? "That suits the hands that call a raise far better than the hands that raise one: small pairs and connected cards. Big cards have nothing here."
          : shape.broadway
            ? "That suits the hands that raised before the flop, so a bet here is routine and means less than it looks."
            : shape.paired
              ? "A pair on the board means fewer hands improved — both of you missed more often than usual."
              : "There is not much to draw to, so hands here are made or they are nothing."
      }${outsLine ? ` You have ${outsLine}.` : ""}`,
    );
  }
  if (opponents >= 1 && state.board.length > 0) {
    expertNotes.push(
      `What their action said — ${vill.name} ${theirAction.toLowerCase()}${
        theirAction === "Check" ? "ed" : ""
      }. ${
        theirAction === "Check"
          ? "A check keeps the pot small, which is what the weaker half of their hands wants — this is a pot you can often take by betting."
          : "Money going in narrows what they hold from both ends: the hands too weak to continue are gone, and the very best would often raise instead."
      }`,
    );
  }
  expertNotes.push(
    `The plan from here — name the next card you want and what you do when it misses. ${
      outs && !outs.ahead && outs.count > 0
        ? `You are paying to see one card with ${outs.count} card${outs.count === 1 ? "" : "s"} that help, and when it misses you are facing another bet with the same hand.`
        : "If you cannot say what you beat that keeps putting money in, that is the answer."
    }`,
  );
  expertNotes.push(
    `What would change the answer — ${
      opponents > 1
        ? "one opponent instead of several. Hands that are fine against one player are folds against three, because somebody connects far more often."
        : "a weaker opponent, a cheaper price, or a draw with more ways to win. Any of the three can turn this from a fold into a call."
    }`,
  );
  expertNotes.push(`How this was graded — ${sourceLine} The numbers are under "Show me the math".`);

  // Provenance belongs with the arithmetic, not with the reasoning.
  const mathTail = [marginNote];
  if (outsLine) {
    mathTail.unshift(
      `The 2/4 rule from the Counting Outs lesson: ${outs!.count} outs × 2 = ${Math.round(ruleOfTwoFour(outs!.count, 1) * 100)}% on the next card, × 4 = ${Math.round(ruleOfTwoFour(outs!.count, 2) * 100)}% by the river.`,
    );
    mathTail.unshift(`Cards that put you in front: ${outsLine}.`);
  }

  const base = {
    id,
    kind: "decision" as const,
    villainName: vill.name,
    villainArchetype: arche,
    villainRange: range,
    board: [...state.board],
    opponents,
    multiway: opponents > 1,
  };

  if (action.type === "fold") {
    if (la.toCall <= 0) return null;
    const cost = la.callAmount;
    const finalPot = state.pot + cost;
    const potOdds = cost / finalPot;
    const evCall = equity * finalPot - cost;
    // Only flag a fold when the call is profitable even at the
    // pessimistic edge of the estimate — never on simulation noise.
    const evCallLow = (equity - margin) * finalPot - cost;
    if (evCall <= foldFlagBb * bb || evCallLow <= 0) return null;
    return {
      ...base,
      blocking: false,
      verdict: "mistake",
      title: "Fold spills value",
      equity,
      potOdds,
      evChips: evCall,
      plain: `You folded a moneymaker. Calling ${fmtBb(cost, bb)} bb to win a ${fmtBb(finalPot, bb)} bb pot only needs a win ${fmtNeed(potOdds)} — and your hand wins ${fmtTimes(equity)}. That call was worth about +${(evCall / bb).toFixed(1)} bb.`,
      text: `Against ${oppDesc} your ${heroLabel} has ${pct}% equity and you're getting ${Math.round(potOdds * 100)}% pot odds — calling is worth about +${(evCall / bb).toFixed(1)} bb.`,
      steps: [
        `${heroLabel} vs ${oppDesc} on ${boardStr} → ${pct}% equity.`,
        `Pot ${state.pot} + call ${cost} = ${finalPot}; pot odds = ${Math.round(potOdds * 100)}%.`,
        `EV(call) = ${pct}% × ${finalPot} − ${cost} ≈ +${evCall.toFixed(0)} chips (${(evCall / bb).toFixed(1)} bb) > EV(fold)=0.`,
        ...mathTail,
      ],
      expert: expertNotes,
    };
  }

  const cost = action.type === "call" ? la.callAmount : (action.amount ?? 0) - hero.committed;
  const finalPot = state.pot + cost;
  const potOdds = finalPot > 0 ? cost / finalPot : 0;
  const evAction = equity * finalPot - cost;

  if (action.type === "call") {
    let verdict: Verdict;
    let blocking = false;
    let text: string;
    let plain: string;
    const priceLine = `You paid ${fmtBb(cost, bb)} bb to win a pot of ${fmtBb(finalPot, bb)} bb — you need to win ${fmtNeed(potOdds)}.`;
    // A "mistake" needs the call to lose money even at the optimistic
    // edge of the estimate; inside the noise band it's just "close".
    const evActionHigh = (equity + margin) * finalPot - cost;
    if (evAction < mistakeBb * bb && evActionHigh < 0) {
      verdict = "mistake";
      blocking = true;
      plain = `${priceLine} Your hand wins ${fmtTimes(equity)} — not enough.${outsPlain} Over time this call loses money; folding is better.`;
      text = `Against ${oppDesc} your ${heroLabel} has only ${pct}% equity, but calling needs ${Math.round(potOdds * 100)}%. This call costs about ${(evAction / bb).toFixed(1)} bb — folding is better.`;
    } else if (evAction < mistakeBb * bb) {
      verdict = "thin";
      plain = `Genuinely too close to call: the numbers say roughly break-even here. Either choice is fine.`;
      text = `Looks slightly losing (~${(evAction / bb).toFixed(1)} bb), but it's within the simulation's margin of error — either choice is reasonable here.`;
    } else if (equity < potOdds + 0.04) {
      verdict = "thin";
      plain = `${priceLine} Your hand wins ${fmtTimes(equity)} — just barely enough.${outsPlain} A close call, not a mistake.`;
      text = `${pct}% equity vs ~${Math.round(potOdds * 100)}% needed — a marginal, close call against ${oppDesc}.`;
    } else {
      verdict = equity > 0.7 ? "great" : "ok";
      plain = `${priceLine} Your hand wins ${fmtTimes(equity)} — comfortably more than you need. Good call.`;
      text = `${pct}% equity vs ${oppDesc}, needing ${Math.round(potOdds * 100)}% — a clear call worth +${(evAction / bb).toFixed(1)} bb.`;
    }
    return {
      ...base,
      blocking,
      verdict,
      title: "Your call",
      equity,
      potOdds,
      evChips: evAction,
      plain,
      text,
      steps: [
        `${heroLabel} vs ${oppDesc} on ${boardStr} → ${pct}% equity.`,
        `Pot ${state.pot} + your call ${cost} = ${finalPot}; pot odds = ${cost}/${finalPot} = ${Math.round(potOdds * 100)}%.`,
        `EV(call) = ${pct}% × ${finalPot} − ${cost} ≈ ${evAction.toFixed(0)} chips (${(evAction / bb).toFixed(1)} bb). EV(fold) = 0.`,
        evAction < 0 ? `Because EV < 0, folding is the higher-EV play.` : `Because EV > 0, calling beats folding.`,
        ...mathTail,
      ],
      expert: expertNotes,
    };
  }

  if (action.type === "check") {
    // Only speak up when checking left clear money behind: strong
    // hands any street, medium-strong only on the river (earlier
    // streets can legitimately pot-control).
    if (state.board.length < 3 || equity < 0.65) return null;
    const strong = equity - margin > 0.75;
    if (!strong && state.street !== "river") return null;
    const betTo = Math.round(state.pot * 0.66);
    return {
      ...base,
      blocking: false,
      verdict: strong ? "mistake" : "thin",
      title: "Missed value",
      equity,
      plain: strong
        ? `Your hand wins ${fmtTimes(equity)} — that's a hand that wants to bet. Checking here gives up a clear value bet: when you're ahead this often, put chips in and get paid.`
        : `Your hand wins ${fmtTimes(equity)} — usually strong enough for a small value bet here. Checking is cautious but leaves some money behind.`,
      text: `${pct}% equity checked ${state.street === "river" ? "on the river" : "back"} — a value bet (~${betTo} chips) was available.`,
      steps: [
        `${heroLabel} vs ${oppDesc} on ${boardStr} → ${pct}% equity.`,
        `A ~66% pot bet (${betTo}) gets called by enough worse hands to profit when you win this often.`,
        `Checking wins the same pot but never builds it — EV left behind grows with your win chance.`,
        ...mathTail,
      ],
      expert: expertNotes,
    };
  }

  // bet / raise
  let verdict: Verdict = "ok";
  let text: string;
  let plain: string;
  // Honest little fold-equity model: opponents continue less often vs
  // bigger bets; a pure bluff needs foldsNeeded to break even.
  const betFrac = costNow / Math.max(1, state.pot);
  const continueFrac = Math.min(0.75, Math.max(0.3, 0.62 - 0.2 * betFrac));
  const pAllFold = Math.pow(1 - continueFrac, opponents);
  const foldsNeeded = costNow / (state.pot + costNow);
  const evBluff = pAllFold * state.pot + (1 - pAllFold) * (equity * (state.pot + 2 * costNow) - costNow);
  if (equity + margin < 0.32 && evBluff < -0.75 * bb) {
    return {
      ...base,
      blocking: false,
      verdict: "mistake",
      title: "Expensive bluff",
      equity,
      potOdds,
      evChips: evBluff,
      plain: `A very expensive bluff: if anyone calls, your hand wins only ${fmtTimes(equity)}${opponents > 1 ? `, and with ${opponents} opponents someone usually calls` : ""}. You'd need folds ${fmtTimes(foldsNeeded)} just to break even — this bet loses money over time.`,
      text: `Bluffing ${Math.round(betFrac * 100)}% pot with ${pct}% equity vs ${oppDesc}: estimated EV ${(evBluff / bb).toFixed(1)} bb.`,
      steps: [
        `${heroLabel} vs ${oppDesc} on ${boardStr} → ${pct}% equity when called.`,
        `Break-even fold rate = bet / (pot + bet) = ${Math.round(foldsNeeded * 100)}%.`,
        `Assuming each opponent continues ~${Math.round(continueFrac * 100)}% vs this size, everyone folds only ${Math.round(pAllFold * 100)}% of the time.`,
        `EV ≈ ${Math.round(pAllFold * 100)}% × ${state.pot} + ${Math.round((1 - pAllFold) * 100)}% × (${pct}% × ${state.pot + 2 * costNow} − ${costNow}) ≈ ${evBluff.toFixed(0)} chips.`,
        ...mathTail,
      ],
      expert: expertNotes,
    };
  }
  if (equity > 0.6) {
    verdict = "great";
    plain = `Betting with the goods: if someone calls, your hand wins ${fmtTimes(equity)}. Money goes in with the best of it — and every fold is profit too.`;
    text = `Strong value — ${pct}% equity vs ${oppDesc}. Betting is correct.`;
  } else if (equity < 0.38 && cost > state.pot * 0.5) {
    verdict = "thin";
    plain = `This is a bluff: if you get called, your hand only wins ${fmtTimes(equity)}. The bet makes money only when opponents fold — fine as a plan, just know that's the plan.`;
    text = `Aggressive: only ${pct}% equity if called. Works as a bluff but relies on folds.`;
  } else {
    plain = `A solid bet: when called, your hand wins ${fmtTimes(equity)}, and every fold you pick up is pure profit on top.`;
    text = `${pct}% equity vs ${oppDesc} — a reasonable bet — worse hands may call, and every fold wins you the pot.`;
  }
  return {
    ...base,
    blocking: false,
    verdict,
    title: action.type === "bet" ? "Your bet" : "Your raise",
    equity,
    potOdds,
    evChips: evAction,
    plain,
    text,
    steps: [
      `${heroLabel} vs ${oppDesc} on ${boardStr} → ${pct}% equity when called.`,
      `A bet also wins when opponents fold — fold equity isn't shown here, so treat this as the "called" floor.`,
      ...mathTail,
    ],
    expert: expertNotes,
  };
}
