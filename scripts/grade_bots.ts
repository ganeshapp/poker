/* The bots, graded by their own coach.
 *
 *   node --experimental-transform-types scripts/grade_bots.ts [hands] [difficulty]
 *
 * The poker equivalent of centipawn loss: ONE measure that works in every
 * spot, rather than a rule about any particular one. The app already prices,
 * for each decision the player makes, the EV of what they did. Point the same
 * function at a bot and the question becomes "how much is this bot leaving
 * behind, and where".
 *
 * It exists because of a specific failure. Over 769 real hands the bots
 * folded 94.5% of the time to a 7bb 3-bet and never adjusted, while a
 * hand-written probe reported that exploit fixed. A win rate and a bespoke
 * probe can both agree nothing is wrong; a measure that prices every
 * individual decision cannot, because folding a profitable call is a loss
 * whatever the win rate says.
 *
 * Two deliberate choices:
 *
 *   - Folds and calls are reported SEPARATELY. The coach's `evChips` is the
 *     EV of the action under discussion, which for a fold is the EV of the
 *     call that was declined — a positive number when the fold was bad.
 *     Averaging that against a call's own EV gives a number meaning nothing.
 *   - Buckets are coarse and situational. The measure must not encode the
 *     exploit it is meant to catch, or it stops being a measure.
 */
import { createTable, startHand, applyAction, legalActions } from "../src/game/engine.ts";
import { decideBot } from "../src/game/botBrain.ts";
import { evaluateHero, type EquityEngine } from "../src/game/coach.ts";
import {
  mulberry32,
  comboToInts,
  equityVsRange,
  equityVsRanges,
  equityVsRandom,
  equityVsField,
} from "../src/engine/equity.ts";
import { cardToInt } from "../src/engine/cards.ts";
import { labelToCombos } from "../src/engine/notation.ts";
import type { Card, GameState, HandLabel } from "../src/types/poker.ts";

const HANDS = Number(process.argv[2] ?? 150);
const DIFF = (process.argv[3] ?? "regular") as "casual" | "regular" | "tough";
const SEEDS = [11, 22, 33, 44];

/* The coach's `EquityEngine` is the CARD-STRING, promise-returning interface
 * the app injects (`src/engine/engineClient.ts`), not the int-based functions
 * in `src/engine/equity.ts`. Handing it the latter type-checks nowhere and
 * silently produces nonsense: card strings get used as card indices, so every
 * equity comes back meaningless and the grade with it. This adapter is the
 * non-native half of engineClient, reproduced because that module reaches for
 * Tauri and a worker. */
function expandRange(range: HandLabel[], hero: [Card, Card], board: Card[]) {
  const blocked = new Set<Card>([hero[0], hero[1], ...board]);
  const combos: [number, number][] = [];
  for (const label of range) {
    for (const [a, b] of labelToCombos(label)) {
      if (blocked.has(a) || blocked.has(b)) continue;
      combos.push(comboToInts([a, b]));
    }
  }
  return combos;
}

const math: EquityEngine = {
  async equityVsRange(hero: [Card, Card], board: Card[], range: HandLabel[], iters = 1500, seed?: number) {
    return equityVsRange(
      comboToInts(hero), board.map(cardToInt), expandRange(range, hero, board), iters, seed,
    );
  },
  async equityVsRanges(hero: [Card, Card], board: Card[], ranges: [number, number][][], iters = 2000, seed?: number) {
    return equityVsRanges(comboToInts(hero), board.map(cardToInt), ranges, iters, seed);
  },
  async equityVsField(hero: [Card, Card], board: Card[], opponents: number, iters = 1500, seed?: number) {
    return equityVsField(comboToInts(hero), board.map(cardToInt), opponents, iters, seed);
  },
  async equityVsRandom(hero: [Card, Card], board: Card[], iters = 1200, seed?: number) {
    return equityVsRandom(comboToInts(hero), board.map(cardToInt), iters, seed);
  },
};
// `coachThresholds("standard")`, inlined: that module pulls in zustand and
// this runs under bare node.
const settings = { mistakeBb: -0.3, foldFlagBb: 1.5, baseIters: 1200 };

/** Which kind of spot a decision was, with no mention of any specific hand. */
function bucketOf(s: GameState, seat: number): string {
  const la = legalActions(s);
  if (s.street === "preflop") {
    if (la.toCall === 0) return "preflop: nothing to call";
    if (s.currentBet > s.bigBlind * 4.5) return "preflop: facing a re-raise";
    if (s.currentBet > s.bigBlind) return "preflop: facing an open";
    return "preflop: in the blinds";
  }
  return la.toCall > 0 ? `${s.street}: facing a bet` : `${s.street}: checked to`;
}

interface Cell {
  folds: number; foldsSpilling: number; spilledBb: number;
  calls: number; callsLosing: number; lostBb: number;
}
const empty = (): Cell => ({
  folds: 0, foldsSpilling: 0, spilledBb: 0, calls: 0, callsLosing: 0, lostBb: 0,
});
const cells = new Map<string, Cell>();
const bySeat = new Map<string, Cell>();
const get = (m: Map<string, Cell>, k: string) => {
  const c = m.get(k) ?? empty();
  m.set(k, c);
  return c;
};

let decisions = 0;

for (const seed of SEEDS) {
  Math.random = mulberry32(seed);
  let s = createTable({ seats: 6, startingStack: 2000, smallBlind: 10, bigBlind: 20, difficulty: DIFF });
  // Every seat is a bot here, the hero seat included, so all six get graded.
  s.players[0].archetype = "TAG";
  s.players[0].isHero = false;

  for (let h = 0; h < HANDS; h++) {
    for (const p of s.players) p.stack = 2000;
    s = startHand(s);
    let guard = 0;
    while (s.phase === "betting" && s.toAct !== null && guard++ < 400) {
      const seat = s.toAct;
      const d = decideBot(s, seat);
      const bucket = bucketOf(s, seat);
      const who = `${s.players[seat].archetype}`;
      const bb = s.bigBlind;
      const kind = d.action.type;

      if (kind === "fold" || kind === "call") {
        for (const c of [get(cells, bucket), get(bySeat, who)]) {
          if (kind === "fold") c.folds++;
          else c.calls++;
        }
        decisions++;
        // Graded against the state the decision was made in, before it lands.
        const review = await evaluateHero(s, d.action, 0, settings, math, seat);
        if (review && review.kind === "decision" && review.evChips != null) {
          const ev = review.evChips / bb;
          for (const c of [get(cells, bucket), get(bySeat, who)]) {
            if (kind === "fold") {
              // The coach only reviews a fold when the call it declined was
              // clearly profitable, so each of these spilled value and
              // `evChips` is how much.
              if (ev > 0) { c.foldsSpilling++; c.spilledBb += ev; }
            } else if (ev < 0) {
              // A call whose own EV is negative: folding was worth more.
              c.callsLosing++; c.lostBb += -ev;
            }
          }
        }
      }
      s = applyAction(s, seat, d.action);
      if (d.range) s.botRanges[seat] = d.range;
    }
  }
}

function line(k: string, c: Cell): string {
  const foldPct = c.folds ? (100 * c.foldsSpilling) / c.folds : 0;
  const callPct = c.calls ? (100 * c.callsLosing) / c.calls : 0;
  // Averaged over EVERY fold / call, not just the bad ones: that is the cost
  // per decision, and it is what a regression gate should watch.
  const foldLeak = c.folds ? c.spilledBb / c.folds : 0;
  const callLeak = c.calls ? c.lostBb / c.calls : 0;
  return (
    k.padEnd(30) +
    String(c.folds).padStart(7) + `${foldPct.toFixed(0)}%`.padStart(7) +
    `${foldLeak.toFixed(2)}`.padStart(8) +
    String(c.calls).padStart(8) + `${callPct.toFixed(0)}%`.padStart(7) +
    `${callLeak.toFixed(2)}`.padStart(8) +
    `${(foldLeak + callLeak).toFixed(2)}`.padStart(9)
  );
}

const head =
  "situation".padEnd(30) + "folds".padStart(7) + "bad".padStart(7) +
  "bb".padStart(8) + "calls".padStart(8) + "bad".padStart(7) +
  "bb".padStart(8) + "leak".padStart(9);

console.log(`\nBOTS GRADED BY THEIR OWN COACH — ${HANDS} x ${SEEDS.length} seeds, "${DIFF}"`);
console.log(`${decisions} fold/call decisions priced`);
console.log(`\n"bb" is EV left behind per decision of that kind; "leak" is the sum.\n`);
console.log(head);
const rank = (c: Cell) =>
  (c.folds ? c.spilledBb / c.folds : 0) + (c.calls ? c.lostBb / c.calls : 0);
for (const [k, c] of [...cells.entries()].sort((a, b) => rank(b[1]) - rank(a[1]))) {
  console.log(line(k, c));
}
console.log();
console.log("archetype".padEnd(30) + head.slice(30));
for (const [k, c] of [...bySeat.entries()].sort((a, b) => rank(b[1]) - rank(a[1]))) {
  console.log(line(k, c));
}
const all = [...cells.values()].reduce((a, c) => ({
  folds: a.folds + c.folds, foldsSpilling: a.foldsSpilling + c.foldsSpilling,
  spilledBb: a.spilledBb + c.spilledBb, calls: a.calls + c.calls,
  callsLosing: a.callsLosing + c.callsLosing, lostBb: a.lostBb + c.lostBb,
}), empty());
console.log(`\n${line("ALL", all)}`);
