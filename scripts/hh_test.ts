/* Hand-history formatter test:
 *   node --experimental-transform-types scripts/hh_test.ts
 */
import { formatHand, type HHHand } from "../src/game/handHistory.ts";

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

has(out, "PokerStars Hand #1: Hold'em No Limit (10/20)");
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
has(out, "*** SUMMARY ***");
has(out, "Total pot 520");
has(out, "Board [Ah Kd 7c 2s 9h]");
has(out, "You won (520)");

console.log(`\nHand-history tests: ${passed} passed, ${failed} failed.`);
process.exit(failed === 0 ? 0 : 1);
