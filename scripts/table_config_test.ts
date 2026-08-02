/* Table-configuration tests: heads-up, 6-max, and 9-max with and
 * without antes — full-hand invariants for each.
 *   node --experimental-transform-types scripts/table_config_test.ts
 */
import { createTable, startHand, applyAction } from "../src/game/engine.ts";
import { decideBot } from "../src/game/botBrain.ts";
import type { Archetype, GameConfig } from "../src/types/poker.ts";

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

const ARCH: Archetype[] = ["TAG", "LAG", "Nit", "Station"];
const CONFIGS: { name: string; config: GameConfig; hands: number }[] = [
  { name: "heads-up", config: { seats: 2, startingStack: 2000, smallBlind: 10, bigBlind: 20 }, hands: 250 },
  { name: "6-max + ante", config: { seats: 6, startingStack: 2000, smallBlind: 10, bigBlind: 20, ante: 5 }, hands: 250 },
  { name: "9-max", config: { seats: 9, startingStack: 2000, smallBlind: 10, bigBlind: 20 }, hands: 200 },
  { name: "9-max + ante", config: { seats: 9, startingStack: 2000, smallBlind: 10, bigBlind: 20, ante: 5 }, hands: 150 },
];

for (const { name, config } of CONFIGS) {
  let state = createTable(config);
  state = {
    ...state,
    players: state.players.map((p, i) => ({ ...p, isHero: false, archetype: ARCH[i % ARCH.length] })),
  };
  const hands = CONFIGS.find((c) => c.name === name)!.hands;
  for (let h = 0; h < hands; h++) {
    state = startHand(state);
    const startSum = state.stacksAtStart.reduce((a, b) => a + b, 0) + (config.ante ? 0 : 0);
    const totalBefore = state.players.reduce((a, p) => a + p.stack, 0) + state.pot;

    // Structural checks on the fresh hand.
    if (h === 0 || h === 1) {
      const positions = state.players.map((p) => p.position);
      if (config.seats === 2) {
        ok(positions.includes("BTN") && positions.includes("BB"), `${name}: HU positions are BTN + BB`);
        const btn = state.players.find((p) => p.position === "BTN")!;
        ok(btn.committed === config.smallBlind, `${name}: HU button posts the small blind`);
        ok(state.toAct === btn.id, `${name}: HU button acts first preflop`);
      }
      if (config.seats === 9) {
        ok(positions.filter((p) => p === "BTN").length === 1, `${name}: exactly one button`);
        ok(new Set(positions).size >= 5, `${name}: positions spread across labels`);
      }
      if (config.ante) {
        ok(state.pot === config.smallBlind + config.bigBlind + config.ante * config.seats, `${name}: antes in the pot`);
        const nonBlind = state.players.find((p) => p.committed === 0 && p.committedTotal > 0);
        ok(!!nonBlind, `${name}: antes count toward totals but not street commitment`);
      }
    }

    let guard = 0;
    while (state.phase === "betting" && state.toAct !== null && guard++ < 6000) {
      state = applyAction(state, state.toAct, decideBot(state, state.toAct).action);
    }
    ok(state.phase === "hand-over", `${name}: hand completes`);
    const totalAfter = state.players.reduce((a, p) => a + p.stack, 0);
    ok(totalAfter === totalBefore, `${name}: chip conservation`);
    ok(state.players.every((p) => p.stack >= 0), `${name}: no negative stacks`);
    if (state.summary) {
      const dist = state.summary.potResults.reduce((a, b) => a + b.amount, 0);
      ok(dist === state.pot, `${name}: pot fully distributed`);
    }
  }
  console.log(`  ${name}: ${hands} hands OK`);
}

console.log(`\nTable config tests: ${passed} passed, ${failed} failed.`);
process.exit(failed === 0 ? 0 : 1);
