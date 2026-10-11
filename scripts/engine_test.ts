/* Standalone engine tests — run with:
 *   node --experimental-transform-types scripts/engine_test.ts
 * Validates the real TypeScript engine (evaluator, equity, notation, ranges).
 */
import { evaluateCards, evaluateInts } from "../src/engine/evaluator.ts";
import { HandCategory } from "../src/types/poker.ts";
import { cardToInt } from "../src/engine/cards.ts";
import { buildSidePots, createTable, startHand, seatedIds } from "../src/game/engine.ts";
import { countOuts, describeOuts, ruleOfTwoFour } from "../src/engine/outs.ts";
import { equityVsField, equityVsRanges } from "../src/engine/equity.ts";
import { readBotAction } from "../src/game/botRead.ts";
import { equityVsRange, equityVsRandom, comboToInts } from "../src/engine/equity.ts";
import {
  allLabels,
  comboCount,
  combosInSet,
  labelToCombos,
  cardsToLabel,
  TOTAL_COMBOS,
} from "../src/engine/notation.ts";
import { rankedHands, topPercentRange, buildPreflopRanges } from "../src/engine/ranges.ts";

let passed = 0;
let failed = 0;
function ok(cond: boolean, msg: string) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error("  FAIL:", msg);
  }
}
function near(a: number, b: number, tol: number, msg: string) {
  ok(Math.abs(a - b) <= tol, `${msg} (got ${a.toFixed(4)}, expected ~${b} ±${tol})`);
}

// ---- Categories ----
ok(evaluateCards(["Ah", "Kh", "Qh", "Jh", "Th"]).category === HandCategory.StraightFlush, "royal flush");
ok(evaluateCards(["9c", "8c", "7c", "6c", "5c"]).category === HandCategory.StraightFlush, "straight flush");
ok(evaluateCards(["Ah", "Ad", "Ac", "As", "Kd"]).category === HandCategory.Quads, "quads");
ok(evaluateCards(["Ah", "Ad", "Ac", "Kd", "Ks"]).category === HandCategory.FullHouse, "full house");
ok(evaluateCards(["Ah", "Jh", "9h", "5h", "2h"]).category === HandCategory.Flush, "flush");
ok(evaluateCards(["9c", "8d", "7h", "6s", "5c"]).category === HandCategory.Straight, "straight");
ok(evaluateCards(["5h", "4d", "3c", "2s", "Ah"]).category === HandCategory.Straight, "wheel straight A-5");
ok(evaluateCards(["Ah", "Ad", "Ac", "Kd", "Qs"]).category === HandCategory.Trips, "trips");
ok(evaluateCards(["Ah", "Ad", "Kc", "Kd", "Qs"]).category === HandCategory.TwoPair, "two pair");
ok(evaluateCards(["Ah", "Ad", "Kc", "Qd", "Js"]).category === HandCategory.Pair, "pair");
ok(evaluateCards(["Ah", "Jd", "9c", "5d", "3s"]).category === HandCategory.HighCard, "high card");

// ---- Ordering ----
const sf = evaluateCards(["9c", "8c", "7c", "6c", "5c"]).score;
const quads = evaluateCards(["Ah", "Ad", "Ac", "As", "Kd"]).score;
const fh = evaluateCards(["Ah", "Ad", "Ac", "Kd", "Ks"]).score;
const flush = evaluateCards(["Ah", "Jh", "9h", "5h", "2h"]).score;
const straight = evaluateCards(["9c", "8d", "7h", "6s", "5c"]).score;
const trips = evaluateCards(["Ah", "Ad", "Ac", "Kd", "Qs"]).score;
const twoPair = evaluateCards(["Ah", "Ad", "Kc", "Kd", "Qs"]).score;
const pair = evaluateCards(["Ah", "Ad", "Kc", "Qd", "Js"]).score;
const high = evaluateCards(["Ah", "Jd", "9c", "5d", "3s"]).score;
ok(sf > quads && quads > fh && fh > flush && flush > straight, "category order top");
ok(straight > trips && trips > twoPair && twoPair > pair && pair > high, "category order bottom");

// ---- Tie-breaks ----
ok(
  evaluateCards(["Ah", "Ad", "Kc", "Qd", "Js"]).score >
    evaluateCards(["Ah", "Ad", "Kc", "Qd", "Ts"]).score,
  "pair kicker J > T",
);
ok(
  evaluateCards(["6h", "5d", "4c", "3s", "2h"]).score >
    evaluateCards(["5h", "4d", "3c", "2s", "Ah"]).score,
  "6-high straight beats wheel",
);
ok(
  evaluateCards(["Ah", "Kh", "Qh", "Jh", "9h"]).score >
    evaluateCards(["Ah", "Kh", "Qh", "Th", "9h"]).score,
  "flush 2nd kicker",
);

// ---- 7-card best selection ----
ok(
  evaluateInts(["2h", "7d", "Ah", "Kh", "Qh", "Jh", "Th"].map(cardToInt)).category ===
    HandCategory.StraightFlush,
  "7-card finds royal",
);
ok(
  evaluateInts(["As", "Ad", "Kh", "Kd", "Kc", "2s", "3d"].map(cardToInt)).category ===
    HandCategory.FullHouse,
  "7-card full house (KKK + AA)",
);

// ---- Notation ----
ok(comboCount("AA") === 6 && comboCount("AKs") === 4 && comboCount("AKo") === 12, "combo counts");
ok(allLabels().length === 169, "169 labels");
ok(combosInSet(allLabels()) === TOTAL_COMBOS, "all combos sum to 1326");
ok(labelToCombos("AKs").length === 4, "AKs -> 4 combos");
ok(cardsToLabel("As", "Kd") === "AKo", "AsKd -> AKo");
ok(cardsToLabel("As", "Ks") === "AKs", "AsKs -> AKs");
ok(cardsToLabel("Ts", "Td") === "TT", "TsTd -> TT");

// ---- Ranges ----
ok(rankedHands()[0].label === "AA", "AA is strongest");
ok(topPercentRange(100).size === 169, "100% = all 169");
const utg = buildPreflopRanges(22, 18, "UTG");
const btn = buildPreflopRanges(22, 18, "BTN");
ok(combosInSet(btn.play) > combosInSet(utg.play), "BTN plays wider than UTG");
ok(combosInSet(utg.raise) <= combosInSet(utg.play), "raise range ⊆ play range size");

// ---- Equity sanity (Monte Carlo; loose tolerances) ----
const AA = comboToInts(["Ah", "Ad"]);
near(equityVsRandom(AA, [], 6000).equity, 0.85, 0.03, "AA vs random ~85%");

const AKs = comboToInts(["As", "Ks"]);
const QQ = labelToCombos("QQ").map((c) => comboToInts(c));
near(equityVsRange(AKs, [], QQ, 8000).equity, 0.46, 0.04, "AKs vs QQ ~46%");

const KK = comboToInts(["Kh", "Kd"]);
const AArange = labelToCombos("AA").map((c) => comboToInts(c));
near(equityVsRange(KK, [], AArange, 8000).equity, 0.18, 0.04, "KK vs AA ~18%");

// ---- Determinism (seeded runs are identical) ----
const s1 = equityVsRange(AKs, [], QQ, 2000, 42);
const s2 = equityVsRange(AKs, [], QQ, 2000, 42);
ok(s1.win === s2.win && s1.tie === s2.tie && s1.lose === s2.lose, "same seed => identical vs-range result");
ok(equityVsRandom(AA, ["Ks", "7d", "2c"].map(cardToInt), 2000, 7).equity ===
   equityVsRandom(AA, ["Ks", "7d", "2c"].map(cardToInt), 2000, 7).equity,
   "same seed => identical vs-random result");
const sDiff = equityVsRange(AKs, [], QQ, 2000, 43);
ok(sDiff.win !== s1.win || sDiff.tie !== s1.tie || sDiff.lose !== s1.lose, "different seed => different sample");

// ---- Exact enumeration on late streets ----
const riverBoard = ["Ad", "Kc", "7s", "2d", "9h"].map(cardToInt);
const AKhh = comboToInts(["Ah", "Kh"]);
const rExact = equityVsRandom(AKhh, riverBoard, 10);
ok(rExact.exact === true, "river vs random is exact");
ok(rExact.se === 0, "exact result has zero standard error");
ok(rExact.samples === 990, "river vs random enumerates C(45,2)=990 combos");
ok(rExact.equity > 0.85, "top two on river beats a random hand almost always");

const turnBoard = riverBoard.slice(0, 4);
const tExact = equityVsRange(AKhh, turnBoard, QQ, 10);
ok(tExact.exact === true, "turn vs range is exact");
ok(tExact.samples === 6 * 44, "turn vs QQ enumerates 6 combos x 44 rivers");
ok(tExact.equity > 0.9, "AK top two vs QQ on the turn is dominant");

// MC results report their uncertainty.
const mc = equityVsRange(AKs, [], QQ, 2000, 5);
ok(mc.exact === false && mc.se > 0 && mc.se < 0.02, "MC result carries a plausible standard error");

// ---- Side pots: one pot per eligible set, uncalled bets handed back ----
{
  const P = (id: number, amt: number, folded = false) => ({ id, amt, folded });

  // Four betting levels but only one set of contenders: one pot, not four.
  const flat = buildSidePots([P(0, 605), P(1, 5, true), P(2, 205, true), P(3, 100), P(5, 605)]);
  ok(flat.pots.length === 2, "levels with the same contenders merge into one pot");
  ok(flat.pots[0].amount === 405 && flat.pots[1].amount === 1115, "merged pots keep every chip");
  ok(flat.uncalled === undefined, "a fully called pot returns nothing");

  // A genuinely short all-in still gets its own side pot.
  const real = buildSidePots([P(1, 300), P(2, 800), P(3, 1500), P(5, 1500)]);
  ok(real.pots.length === 3, "three stack sizes make three pots");
  ok(
    real.pots.map((p) => p.amount).join(",") === "1200,1500,1400",
    "short all-ins cap each pot at what everyone could match",
  );

  // Heads-up, one player bet more than the other could call.
  const over = buildSidePots([P(0, 500), P(1, 2000)]);
  ok(over.pots.length === 1 && over.pots[0].amount === 1000, "only the matched chips form a pot");
  ok(
    over.uncalled?.playerId === 1 && over.uncalled.amount === 1500,
    "the unmatched remainder goes back to whoever bet it",
  );

  // Dead money from a folded player never leaves the table.
  const dead = buildSidePots([P(0, 100, true), P(1, 50), P(2, 50)]);
  ok(dead.pots.length === 1 && dead.pots[0].amount === 200, "a folded overbet stays in the pot");
  ok(dead.uncalled === undefined, "a folded player is never handed chips back");
}

// ---- Playing the table down instead of rebuying busted bots ----
{
  const cfg = { seats: 6, startingStack: 2000, smallBlind: 10, bigBlind: 20 };

  // Default: a bot at 0 is topped back up and the table keeps its shape.
  const keep = createTable({ ...cfg });
  keep.players[3].stack = 0;
  const kept = startHand(keep);
  // `+ committed` because the top-up happens before the blinds are posted.
  ok(
    kept.players[3].stack + kept.players[3].committed === 2000,
    "rebuy on: a busted bot is topped back up",
  );
  ok(seatedIds(kept).length === 6, "rebuy on: nobody leaves the table");

  // Play-down: the same bot leaves, and the table deals five-handed.
  const down = createTable({ ...cfg, botRebuy: false });
  down.players[3].stack = 0;
  const short = startHand(down);
  ok(short.players[3].sittingOut === true, "rebuy off: a busted bot sits out");
  ok(short.players[3].hole === null, "a seat that is out is not dealt in");
  ok(seatedIds(short).length === 5, "the table is five-handed now");
  ok(
    short.players.filter((p) => !p.sittingOut && p.hole).length === 5,
    "every remaining seat gets cards",
  );
  ok(!short.players[short.button].sittingOut, "the button never stops on an empty seat");
  const live = seatedIds(short).map((id) => short.players[id].position);
  ok(new Set(live).size === 5, "five-handed uses five distinct positions");
  ok(live.includes("BTN") && live.includes("SB") && live.includes("BB"), "the blinds still exist");
  ok(short.players[3].handsSeen === keep.players[3].handsSeen, "a seat that is out sees no hands");

  // The hero is never sat out by the engine, however the table is set.
  const heroBust = createTable({ ...cfg, botRebuy: false });
  heroBust.players[0].stack = 0;
  const dealt = startHand(heroBust);
  ok(dealt.players[0].sittingOut === false, "the hero is never sat out here");
  ok(
    dealt.players[0].stack + dealt.players[0].committed === 2000,
    "the hero's seat is the session's business",
  );

  // Down to two: the heads-up blind rule takes over.
  const hu = createTable({ ...cfg, botRebuy: false });
  for (const id of [1, 2, 3, 4]) hu.players[id].stack = 0;
  const two = startHand(hu);
  ok(seatedIds(two).length === 2, "four bots out leaves two players");
  const btn = two.players[seatedIds(two)[0]];
  ok(
    two.players.filter((p) => !p.sittingOut && p.position === "BTN").length === 1,
    "heads-up still has a button",
  );
  ok(
    two.players.filter((p) => !p.sittingOut && p.committed === two.smallBlind).length === 1,
    "heads-up posts exactly one small blind",
  );
  ok(btn !== undefined, "a seated player holds the button");
}

// ---- Outs: the human version of the equity number ----
{
  const toR = (ls: string[]) => ls.flatMap((l) => labelToCombos(l)).map(comboToInts);
  const RANGE = toR(["77","88","99","TT","JJ","QQ","KK","AA","AJs","ATs","KQs","QJs","JTs","T9s","98s","87s","76s","65s","54s","AQo","AJo","KQo"]);
  const b = (cs: string[]) => cs.map((c) => cardToInt(c as never));

  // The textbook counts, which is the point: these are the numbers a player
  // already knows, so the coach saying anything else would be wrong.
  // A bare flush draw is the textbook nine; the same draw with two cards
  // above the board is the textbook fifteen. Both have to come out right.
  const flush = countOuts(comboToInts(["7h", "6h"] as never), b(["Ah", "9s", "2h"]), [RANGE]);
  ok(flush.count === 9, "a bare flush draw is nine outs");
  ok(flush.groups[0].cardsLabel === "nine hearts", "and they are named as nine hearts");

  const flushOver = countOuts(comboToInts(["Ah", "Kh"] as never), b(["9h", "5s", "2h"]), [RANGE]);
  ok(flushOver.count === 15, "a flush draw with two overcards is fifteen outs");

  const oesd = countOuts(comboToInts(["9s", "8s"] as never), b(["7h", "6d", "2c"]), [RANGE]);
  ok(oesd.count === 8, "an open-ended straight draw is eight outs");

  // The hand that cost 100 bb: four outs, to the small end, and the warning.
  const gut = countOuts(comboToInts(["Qs", "2d"] as never), b(["6h", "5s", "4h"]), [RANGE, RANGE]);
  ok(gut.count === 4, "queen-high with a gutshot is four outs, not seven");
  ok(gut.groups[0].cardsLabel === "the four 3s", "named as the four 3s");
  ok(!!gut.groups[0].caution, "and flagged as the small end of the straight");
  ok((gut.holdUp ?? 1) < 0.9, "because it does not always hold up when it lands");
  ok(describeOuts(gut).includes("the four 3s"), "the sentence names the cards");

  const made = countOuts(comboToInts(["7s", "7d"] as never), b(["7h", "Kd", "2c"]), [RANGE]);
  ok(made.ahead && made.count === 0, "a set is ahead, so it is not counted as drawing");

  ok(Math.round(ruleOfTwoFour(9, 1) * 100) === 18, "2/4 rule: 9 outs is 18% on one card");
  ok(Math.round(ruleOfTwoFour(9, 2) * 100) === 36, "2/4 rule: 9 outs is 36% by the river");
}

// ---- Multiway equity vs real ranges, not random cards ----
{
  const toR = (ls: string[]) => ls.flatMap((l) => labelToCombos(l)).map(comboToInts);
  const LAG = toR(["22","33","44","55","66","77","88","99","TT","JJ","QQ","KK","AA","A2s","A5s","A9s","ATs","AJs","AQs","AKs","KTs","KJs","KQs","QTs","QJs","JTs","T9s","98s","87s","76s","65s","54s","ATo","AJo","AQo","AKo","KQo","QJo"]);
  const hero = comboToInts(["Qs", "2d"] as never);
  const rand = equityVsField(hero, [], 2, 4000, 7);
  const real = equityVsRanges(hero, [], [LAG, LAG], 4000, 7);
  ok(real.samples > 3000, "ranges equity keeps nearly all of its trials");
  ok(real.equity < rand.equity - 0.05, "a weak hand scores worse against real ranges than random cards");
  // The exact flip that graded a losing call as a "thin spot".
  ok(rand.equity > 0.23 && real.equity < 0.23, "Q2o vs two opponents: call becomes fold");
  const again = equityVsRanges(hero, [], [LAG, LAG], 4000, 7);
  ok(again.equity === real.equity, "same seed gives the same answer");
}

// ---- Reading an opponent's move: board and action, not archetype ----
{
  const snap = {
    name: "Rafa", archetype: "TAG" as const, street: "flop" as const,
    board: ["6h", "5s", "4h"] as never, action: "bet" as const, amount: 60, pot: 200,
    playersIn: 3, wasPreflopRaiser: false, checkedThisStreet: false, betLastStreet: false,
    handsSeen: 40, rangeCombos: 517,
  };
  const bet = readBotAction(snap);
  ok(bet.plain.includes("three low cards in a row"), "the read names the board, not the archetype");
  ok(!bet.plain.includes("(TAG)"), "the style is never the headline");
  ok(bet.expert.some((e) => e.startsWith("One adjustment:")), "the style is an adjustment at the end");

  const xr = readBotAction({ ...snap, action: "raise", checkedThisStreet: true });
  ok(xr.title.includes("check-raise"), "a check-raise is recognised as one");
  ok(xr.plain !== bet.plain, "and does not read like a plain bet");

  const gaveUp = readBotAction({ ...snap, street: "turn", action: "check", betLastStreet: true });
  ok(gaveUp.plain.includes("given up"), "bet-then-check is read as giving up");

  const newbie = readBotAction({ ...snap, handsSeen: 4 });
  ok(
    newbie.expert.some((e) => e.includes("not enough to call them anything yet")),
    "four hands is not a read, and the app says so",
  );

  const big = readBotAction({ ...snap, board: ["Kh", "Qs", "Jd"] as never });
  ok(big.plain !== bet.plain, "a board of big cards reads differently from low connected cards");
}

console.log(`\nEngine tests: ${passed} passed, ${failed} failed.`);
process.exit(failed === 0 ? 0 : 1);
