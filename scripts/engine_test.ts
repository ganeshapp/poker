/* Standalone engine tests — run with:
 *   node --experimental-transform-types scripts/engine_test.ts
 * Validates the real TypeScript engine (evaluator, equity, notation, ranges).
 */
import { evaluateCards, evaluateInts } from "../src/engine/evaluator.ts";
import { HandCategory } from "../src/types/poker.ts";
import { cardToInt } from "../src/engine/cards.ts";
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

console.log(`\nEngine tests: ${passed} passed, ${failed} failed.`);
process.exit(failed === 0 ? 0 : 1);
