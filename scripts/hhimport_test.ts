/* Hand-history IMPORT tests: round-trip against our own exporter, a
 * genuine-PokerStars-style fixture, and the imported-call analyzer.
 *   node --experimental-transform-types scripts/hhimport_test.ts
 */
import { formatHand, type HHHand } from "../src/game/handHistory.ts";
import { parsePokerStars, analyzeImported } from "../src/lib/hhImport.ts";

let passed = 0;
let failed = 0;
function ok(cond: boolean, msg: string) {
  if (cond) passed++;
  else {
    failed++;
    console.error("  FAIL:", msg);
  }
}

/* ---- Round-trip: export a hand, parse it back ---- */
const hand: HHHand = {
  id: 7,
  startedAt: new Date(2026, 5, 19, 12, 0, 0).getTime(),
  button: 0,
  sb: 10,
  bb: 20,
  sbSeat: 1,
  bbSeat: 2,
  seats: [
    { seat: 0, name: "You", stack: 2000, isHero: true, position: "BTN" },
    { seat: 1, name: "Ivey", stack: 2000, isHero: false, position: "SB" },
    { seat: 2, name: "Polk", stack: 2000, isHero: false, position: "BB" },
    { seat: 3, name: "Dwan", stack: 2000, isHero: false, position: "UTG" },
    { seat: 4, name: "Selbst", stack: 2000, isHero: false, position: "MP" },
    { seat: 5, name: "Galfond", stack: 2000, isHero: false, position: "CO" },
  ],
  holes: { 0: ["As", "Ks"], 3: ["Qh", "Qd"] },
  actions: [
    { street: "preflop", seat: 4, name: "Selbst", type: "fold", amount: 0, allIn: false },
    { street: "preflop", seat: 5, name: "Galfond", type: "fold", amount: 0, allIn: false },
    { street: "preflop", seat: 3, name: "Dwan", type: "raise", amount: 60, allIn: false },
    { street: "preflop", seat: 0, name: "You", type: "call", amount: 60, allIn: false },
    { street: "preflop", seat: 1, name: "Ivey", type: "fold", amount: 0, allIn: false },
    { street: "preflop", seat: 2, name: "Polk", type: "fold", amount: 0, allIn: false },
    { street: "flop", seat: 3, name: "Dwan", type: "bet", amount: 80, allIn: false },
    { street: "flop", seat: 0, name: "You", type: "call", amount: 80, allIn: false },
    { street: "turn", seat: 3, name: "Dwan", type: "check", amount: 0, allIn: false },
    { street: "turn", seat: 0, name: "You", type: "check", amount: 0, allIn: false },
    { street: "river", seat: 3, name: "Dwan", type: "check", amount: 0, allIn: false },
    { street: "river", seat: 0, name: "You", type: "bet", amount: 120, allIn: false },
    { street: "river", seat: 3, name: "Dwan", type: "call", amount: 120, allIn: false },
  ],
  board: ["Ah", "Kd", "7c", "2s", "9h"],
  potResults: [{ winners: [0], amount: 520, potLabel: "Pot" }],
  heroNet: 260,
};

const text = formatHand(hand);
const { hands, skipped } = parsePokerStars(text);
ok(hands.length === 1 && skipped === 0, `round-trip parses (${hands.length} hands, ${skipped} skipped)`);
const h = hands[0];
ok(h.sb === 10 && h.bb === 20, "blinds parsed");
ok(h.seats.length === 6, "six seats parsed");
ok(h.heroName === "You" && h.seats.find((s) => s.isHero)?.name === "You", "hero detected from Dealt-to");
ok(h.holes[0]?.join("") === "AsKs", "hero hole cards parsed");
ok(h.holes[3]?.join("") === "QhQd", "showdown cards recovered for the villain");
ok(h.board.join("") === "AhKd7c2s9h", "full board parsed street by street");
ok(h.actions.filter((a) => a.type === "fold").length === 4, "folds parsed");
ok(h.actions.some((a) => a.type === "raise" && a.amount === 60), "raise-to amount parsed");
ok(h.potResults.some((p) => p.winners.includes(0) && p.amount > 0), "winner + amount recovered");
ok(h.imported === true, "flagged as imported");

/* ---- Genuine-PS-style fixture ($ amounts, real-site quirks) ---- */
const fixture = `PokerStars Hand #241537799999: Hold'em No Limit ($0.05/$0.10 USD) - 2024/03/07 21:14:11 ET
Table 'Aludra III' 6-max Seat #3 is the button
Seat 1: villain_a ($10.00 in chips)
Seat 3: hero_name ($12.35 in chips)
Seat 5: villain_b ($9.40 in chips)
villain_b: posts small blind $0.05
villain_a: posts big blind $0.10
*** HOLE CARDS ***
Dealt to hero_name [Jh Jc]
hero_name: raises $0.20 to $0.30
villain_b: folds
villain_a: calls $0.20
*** FLOP *** [2d 7s Td]
villain_a: checks
hero_name: bets $0.45
villain_a: calls $0.45
*** TURN *** [2d 7s Td] [Qc]
villain_a: checks
hero_name: checks
*** RIVER *** [2d 7s Td Qc] [3h]
villain_a: bets $1.55
hero_name: calls $1.55
*** SHOW DOWN ***
villain_a: shows [Qd Th] (two pair, Queens and Tens)
hero_name: mucks hand
villain_a collected $4.53 from pot
*** SUMMARY ***
Total pot $4.75 | Rake $0.22
Board [2d 7s Td Qc 3h]
Seat 1: villain_a (big blind) showed [Qd Th] and won ($4.53) with two pair, Queens and Tens
Seat 3: hero_name (button) mucked
Seat 5: villain_b (small blind) folded before Flop`;

const real = parsePokerStars(fixture);
ok(real.hands.length === 1, "real-site fixture parses");
const rh = real.hands[0];
ok(rh.sb === 0.05 && rh.bb === 0.1, "dollar blinds parsed");
ok(rh.heroName === "hero_name", "hero found in real fixture");
ok(rh.holes[2]?.join("") === "JhJc", "hero cards ($ file) parsed");
ok(rh.holes[0]?.join("") === "QdTh", "villain showdown cards recovered from real fixture");
ok(rh.board.length === 5, "board complete");
ok(rh.potResults.some((p) => p.amount === 4.53), "collected amount parsed");

/* ---- Analyzer: a hopeless call gets flagged; a fine call doesn't ---- */
const badCall = `PokerStars Hand #100000000001: Hold'em No Limit (10/20) - 2026/06/19 12:00:00 ET
Table 'T' 6-max Seat #1 is the button
Seat 1: hero (2000 in chips)
Seat 2: v1 (2000 in chips)
v1: posts small blind 10
hero: posts big blind 20
*** HOLE CARDS ***
Dealt to hero [7h 2c]
v1: raises 1980 to 2000
hero: calls 1980
*** SUMMARY ***
Total pot 4000 | Rake 0`;
const parsedBad = parsePokerStars(badCall);
ok(parsedBad.hands.length === 1, "bad-call hand parses");
const analysis = analyzeImported(parsedBad.hands);
ok(analysis.reviewed >= 1, "hero call reviewed");
ok(analysis.leaks.length === 1, "hopeless 100bb call with 72o flagged for Review");
ok(analysis.leaks[0].best === "fold", "flagged spot recommends fold");

const fineAnalysis = analyzeImported(real.hands);
ok(fineAnalysis.leaks.length === 0, "reasonable calls in the real fixture are not flagged (conservative analyzer)");

console.log(`\nHH import tests: ${passed} passed, ${failed} failed.`);
process.exit(failed === 0 ? 0 : 1);
