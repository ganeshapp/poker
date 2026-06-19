/* Integration sim — run with:
 *   node --experimental-transform-types scripts/sim_test.ts
 * Plays many full hands (bots in every seat) and checks engine invariants.
 */
import { createTable, startHand, applyAction } from "../src/game/engine.ts";
import { decideBot } from "../src/game/botBrain.ts";
import type { GameConfig } from "../src/types/poker.ts";

const config: GameConfig = { seats: 6, startingStack: 2000, smallBlind: 10, bigBlind: 20 };
let state = createTable(config);

let passed = 0;
let failed = 0;
const seen: Record<string, number> = {};
function ok(cond: boolean, msg: string) {
  if (cond) passed++;
  else {
    failed++;
    if ((seen[msg] = (seen[msg] ?? 0) + 1) <= 3) console.error("  FAIL:", msg);
  }
}

const HANDS = 600;
let showdowns = 0;
let allInRunouts = 0;

for (let h = 0; h < HANDS; h++) {
  state = startHand(state);
  const startSum = state.stacksAtStart.reduce((a, b) => a + b, 0);
  let guard = 0;
  while (state.phase === "betting" && state.toAct !== null) {
    if (guard++ > 5000) {
      ok(false, "loop guard exceeded");
      break;
    }
    const seat = state.toAct;
    const dec = decideBot(state, seat);
    state = applyAction(state, seat, dec.action);
  }

  ok(state.phase === "hand-over", "hand completed");
  ok(
    state.players.every((p) => p.stack >= 0),
    "no negative stacks",
  );
  const endSum = state.players.reduce((a, b) => a + b.stack, 0);
  ok(endSum === startSum, "chip conservation");
  ok([0, 3, 4, 5].includes(state.board.length), "valid board length");

  if (state.summary) {
    const dist = state.summary.potResults.reduce((a, b) => a + b.amount, 0);
    ok(dist === state.pot, "pot fully distributed");
    if (state.summary.showdown.length > 0) showdowns++;
    if (state.board.length === 5 && state.summary.showdown.length >= 2) {
      const allIn = state.players.filter((p) => p.isAllIn).length;
      if (allIn >= 1) allInRunouts++;
    }
  }
}

console.log(
  `Sim: ${passed} passed, ${failed} failed over ${HANDS} hands ` +
    `(${showdowns} showdowns, ${allInRunouts} all-in runouts).`,
);
process.exit(failed === 0 ? 0 : 1);
