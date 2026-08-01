/* Bot preflop policy tests — the property assertions from issue #9.
 *   node --experimental-transform-types scripts/bot_test.ts
 *
 * Run A: full bot tables; over thousands of preflop decisions, AA/KK
 * never fold and pure junk never calls a big raise.
 * Run B: a maniac hero open-jams 100bb every hand — the field must
 * clearly beat that strategy (the old bots lost to it).
 */
import { createTable, startHand, applyAction, legalActions } from "../src/game/engine.ts";
import { decideBot } from "../src/game/botBrain.ts";
import { cardsToLabel } from "../src/engine/notation.ts";
import type { Archetype, GameConfig } from "../src/types/poker.ts";

const config: GameConfig = { seats: 6, startingStack: 2000, smallBlind: 10, bigBlind: 20 };
const BB = config.bigBlind;
const ARCH: Archetype[] = ["TAG", "LAG", "Nit", "Station"];

let passed = 0;
let failed = 0;
function ok(cond: boolean, msg: string) {
  if (cond) passed++;
  else {
    failed++;
    console.error("  FAIL:", msg);
  }
}

const JUNK = new Set(["72o", "82o", "92o", "T2o", "J2o", "83o", "73o", "62o", "52o", "42o", "32o"]);

/* ---------------- Run A: all-bot tables, decision properties ---------------- */
{
  let state = createTable(config);
  state = {
    ...state,
    players: state.players.map((p, i) => ({ ...p, isHero: false, archetype: ARCH[i % ARCH.length] })),
  };
  let premiumFolds = 0;
  let junkBigCalls = 0;
  let decisions = 0;
  for (let h = 0; h < 1200; h++) {
    state = startHand(state);
    let guard = 0;
    while (state.phase === "betting" && state.toAct !== null && guard++ < 5000) {
      const seat = state.toAct;
      const p = state.players[seat];
      const dec = decideBot(state, seat);
      if (state.street === "preflop" && p.hole) {
        decisions++;
        const label = cardsToLabel(p.hole[0], p.hole[1]);
        const la = legalActions(state);
        if ((label === "AA" || label === "KK") && dec.action.type === "fold") {
          premiumFolds++;
          if (premiumFolds <= 3) console.error(`    ${p.archetype} folded ${label} facing ${state.currentBet / BB}bb`);
        }
        if (JUNK.has(label) && dec.action.type === "call" && la.callAmount >= 8 * BB) {
          junkBigCalls++;
          if (junkBigCalls <= 3) console.error(`    ${p.archetype} called ${la.callAmount / BB}bb with ${label}`);
        }
      }
      state = applyAction(state, seat, dec.action);
    }
    ok(state.phase === "hand-over", "hand completes");
  }
  ok(decisions > 5000, `saw plenty of preflop decisions (${decisions})`);
  ok(premiumFolds === 0, `AA/KK never fold preflop (${premiumFolds} folds)`);
  ok(junkBigCalls === 0, `junk never calls a big raise (${junkBigCalls} calls)`);
}

/* ---------------- Run B: the open-jam exploit must lose now ---------------- */
{
  let state = createTable(config);
  state = {
    ...state,
    players: state.players.map((p, i) =>
      p.isHero ? p : { ...p, archetype: ARCH[(i - 1) % ARCH.length] },
    ),
  };
  let heroNet = 0;
  const HANDS = 1000;
  for (let h = 0; h < HANDS; h++) {
    state = startHand(state);
    let guard = 0;
    while (state.phase === "betting" && state.toAct !== null && guard++ < 5000) {
      const seat = state.toAct;
      if (seat === 0) {
        const la = legalActions(state);
        if (state.street === "preflop" && la.canRaise) {
          state = applyAction(state, 0, { type: "raise", amount: la.maxRaiseTo });
        } else if (la.canCheck) {
          state = applyAction(state, 0, { type: "check" });
        } else if (la.canCall) {
          state = applyAction(state, 0, { type: "call", amount: la.callAmount });
        } else {
          state = applyAction(state, 0, { type: "fold" });
        }
      } else {
        state = applyAction(state, seat, decideBot(state, seat).action);
      }
    }
    heroNet += state.summary?.heroNetChips ?? 0;
  }
  const bb100 = (heroNet / BB / HANDS) * 100;
  console.log(`  open-jam maniac: ${bb100.toFixed(0)} bb/100 over ${HANDS} hands`);
  ok(heroNet < 0, `open-shoving every hand loses vs the field (net ${(heroNet / BB).toFixed(0)} bb)`);
}

console.log(`\nBot tests: ${passed} passed, ${failed} failed.`);
process.exit(failed === 0 ? 0 : 1);
