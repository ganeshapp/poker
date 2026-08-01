/* Hand-history formatter test:
 *   node --experimental-transform-types scripts/hh_test.ts
 */
import { formatHand, buildReplayFrames, type HHHand } from "../src/game/handHistory.ts";

let passed = 0;
let failed = 0;
function has(text: string, needle: string) {
  if (text.includes(needle)) passed++;
  else {
    failed++;
    console.error("  MISSING:", JSON.stringify(needle));
  }
}

const hand: HHHand = {
  id: 1,
  startedAt: Date.UTC(2026, 5, 19, 12, 0, 0),
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
    { street: "preflop", seat: 3, name: "Dwan", type: "raise", amount: 60, allIn: false },
    { street: "preflop", seat: 0, name: "You", type: "call", amount: 60, allIn: false },
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

const out = formatHand(hand);
console.log(out);
console.log("\n--- assertions ---");

// Globally unique, monotonic export id (not the session-local #1).
has(out, `PokerStars Hand #${hand.startedAt * 100 + 1}: Hold'em No Limit (10/20)`);
has(out, "Seat #1 is the button");
has(out, "Ivey: posts small blind 10");
has(out, "Polk: posts big blind 20");
has(out, "*** HOLE CARDS ***");
has(out, "Dealt to You [As Ks]");
has(out, "Dwan: raises 40 to 60");
has(out, "You: calls 60");
has(out, "*** FLOP *** [Ah Kd 7c]");
has(out, "Dwan: bets 80");
has(out, "*** TURN *** [Ah Kd 7c] [2s]");
has(out, "*** RIVER *** [Ah Kd 7c 2s] [9h]");
has(out, "You: bets 120");
has(out, "*** SHOW DOWN ***");
has(out, "You: shows [As Ks] (two pair, Aces and Kings)");
has(out, "Dwan: shows [Qh Qd] (a pair of Queens)");
has(out, "You collected 520 from pot");
has(out, "*** SUMMARY ***");
has(out, "Total pot 520");
has(out, "Board [Ah Kd 7c 2s 9h]");
has(out, "Seat 1: You (button) showed [As Ks] and won (520) with two pair, Aces and Kings");
has(out, "Seat 4: Dwan showed [Qh Qd] and lost with a pair of Queens");
has(out, "Seat 2: Ivey (small blind) folded before Flop");
has(out, "Seat 3: Polk (big blind) folded before Flop");

// Muck semantics: players who never reached showdown must not "show".
const notHas = (text: string, needle: string) => {
  if (!text.includes(needle)) passed++;
  else {
    failed++;
    console.error("  UNEXPECTED:", JSON.stringify(needle));
  }
};
notHas(out, "Ivey: shows");
notHas(out, "Selbst: shows");

// ---- Fold-out hand: uncalled bet returned, no fabricated showdown ----
const foldout: HHHand = {
  id: 2,
  startedAt: hand.startedAt + 60_000,
  button: 0,
  sb: 10,
  bb: 20,
  sbSeat: 1,
  bbSeat: 2,
  seats: hand.seats,
  holes: { 0: ["7h", "2c"], 3: ["Ac", "Ad"] },
  actions: [
    { street: "preflop", seat: 3, name: "Dwan", type: "raise", amount: 60, allIn: false },
    { street: "preflop", seat: 4, name: "Selbst", type: "fold", amount: 0, allIn: false },
    { street: "preflop", seat: 5, name: "Galfond", type: "fold", amount: 0, allIn: false },
    { street: "preflop", seat: 0, name: "You", type: "fold", amount: 0, allIn: false },
    { street: "preflop", seat: 1, name: "Ivey", type: "fold", amount: 0, allIn: false },
    { street: "preflop", seat: 2, name: "Polk", type: "fold", amount: 0, allIn: false },
  ],
  board: [],
  potResults: [{ winners: [3], amount: 90, potLabel: "Pot" }],
  heroNet: 0,
};
const out2 = formatHand(foldout);
console.log("\n" + out2);
console.log("\n--- fold-out assertions ---");
has(out2, `PokerStars Hand #${foldout.startedAt * 100 + 2}:`);
has(out2, "Uncalled bet (40) returned to Dwan");
has(out2, "Dwan collected 50 from pot");
has(out2, "Total pot 50");
has(out2, "Seat 4: Dwan collected (50)");
has(out2, "Seat 1: You (button) folded before Flop");
notHas(out2, "*** SHOW DOWN ***");
notHas(out2, "Dwan: shows");
notHas(out2, "Board [");

// ---- Replay frames ----
const ok = (cond: boolean, msg: string) => {
  if (cond) passed++;
  else {
    failed++;
    console.error("  FAIL:", msg);
  }
};
const frames = buildReplayFrames(hand);
ok(frames.length > 4, "replay produces frames");
ok(frames[0].text.includes("Blinds"), "first replay frame is blinds");
const lastFrame = frames[frames.length - 1];
ok(lastFrame.board.length === 5, "final replay frame shows full board");
ok(lastFrame.revealAll === true, "final frame reveals at showdown");
ok(lastFrame.pot >= frames[0].pot, "pot grows across replay");
ok(frames.some((f) => f.street === "flop" && f.board.length === 3), "flop revealed mid-replay");

console.log(`\nHand-history tests: ${passed} passed, ${failed} failed.`);
process.exit(failed === 0 ? 0 : 1);
