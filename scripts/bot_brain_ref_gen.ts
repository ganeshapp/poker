/* Regenerates the pre-flop entries of the Dart port's bot-brain reference.
 *
 * Prints the JSON to stdout; patch it into the `preflop` object of
 * `../poker-zapp/test/engine/bot_brain_ref.dart`. These entries used to be
 * maintained by hand, which is how `P1_tag_utg_AA_099` ended up pinning
 * pocket fours.
 *
 *   node --experimental-transform-types scripts/bot_brain_ref_gen.ts
 *
 * Mirrors the scenario setup in poker-zapp/test/engine/bot_brain_test.dart
 * (_cfg, _deck, _holes, _setup) so the pinned expectations come from the
 * desktop engine instead of being maintained by hand.
 */
import { createTable, startHand, applyAction, legalActions } from "../src/game/engine.ts";
import { decideBot } from "../src/game/botBrain.ts";
import type { Archetype, Card, GameState } from "../src/types/poker.ts";

const CFG = { seats: 6, startingStack: 2000, smallBlind: 10, bigBlind: 20 };
const DECK: Card[] = [
  "2c","3d","4h","5s","6c","7d","8h","9s","Tc","Jd",
  "9c","Th","2s","Js","3h","8d","Kc","Qc",
];
const HOLES: Record<number, [Card, Card]> = {
  0: ["Ah","Qd"], 1: ["5c","6d"], 2: ["Ks","Kd"],
  3: ["4c","4d"], 4: ["Jc","Tc"], 5: ["6s","5h"],
};

function setup(archs: Record<number, Archetype>, holes: Record<number, [Card, Card]> = {}): GameState {
  let s = createTable(CFG);
  s.button = 0;
  for (const [k, v] of Object.entries(archs)) s.players[Number(k)].archetype = v;
  s = startHand(s);
  s.deck = [...DECK];
  for (const p of s.players) p.hole = holes[p.id] ?? HOLES[p.id];
  return s;
}

function pin(s: GameState, seat: number, r: number, name: string) {
  const la = legalActions(s);
  const saved = Math.random;
  Math.random = () => r;
  const d = decideBot(s, seat);
  Math.random = saved;
  return [name, {
    action: d.action, range: d.range, la,
    pot: s.pot, currentBet: s.currentBet,
    street: s.street, board: s.board, pos: s.players[seat].position,
  }] as const;
}

const out: Record<string, unknown> = {};
const add = (e: readonly [string, unknown]) => { out[e[0]] = e[1]; };

// RFI: premiums always open, 2.5bb sizing
add(pin(setup({ 3: "TAG" }), 3, 0.99, "P1_tag_utg_44_099"));
add(pin(setup({ 3: "TAG" }, { 3: ["Ac","Ad"] }), 3, 0.99, "P1b_tag_utg_AA_099"));
// RFI: Nit trims mixed opens
{
  const s = setup({ 3: "Nit" }, { 3: ["9c","8c"] });
  add(pin(s, 3, 0.30, "P2_nit_utg_98s_030"));
  add(pin(s, 3, 0.10, "P2b_nit_utg_98s_010"));
}
// RFI: Station limps, LAG rounds opens up
add(pin(setup({ 3: "Station" }, { 3: ["9c","8c"] }), 3, 0.50, "P3_station_utg_98s_050"));
{
  const s = setup({ 3: "LAG" }, { 3: ["9c","8c"] });
  add(pin(s, 3, 0.85, "P4_lag_utg_98s_085"));
  add(pin(s, 3, 0.95, "P4b_lag_utg_98s_095"));
}
// vs RFI: call / 3-bet / fold by chart frequency and archetype
{
  let s = setup({ 4: "TAG" }, { 4: ["Ac","Qc"] });
  s = applyAction(s, 3, { type: "raise", amount: 50 });
  add(pin(s, 4, 0.50, "P5_tag_mp_AQs_vs_utg_050"));
}
{
  let s = setup({ 4: "LAG" }, { 4: ["Ac","5c"] });
  s = applyAction(s, 3, { type: "raise", amount: 50 });
  add(pin(s, 4, 0.70, "P5b_lag_mp_A5s_vs_utg_070"));
  add(pin(s, 4, 0.90, "P5c_lag_mp_A5s_vs_utg_090"));
}
{
  let s = setup({ 4: "Nit" }, { 4: ["Ac","5c"] });
  s = applyAction(s, 3, { type: "raise", amount: 50 });
  add(pin(s, 4, 0.10, "P5d_nit_mp_A5s_vs_utg_010"));
}
/* ---------------------------------------------------------------- river */

/** Mirrors `_toRiver` in the Dart test: BTN opens, the bot calls, both check
 *  the flop and turn, and optionally the hero bets the river. */
function toRiver(arch: Archetype, hole: [Card, Card], heroBets = 0): GameState {
  let s = setup({ 2: arch }, { 2: hole });
  for (const seat of [3, 4, 5]) s = applyAction(s, seat, { type: "fold" });
  s = applyAction(s, 0, { type: "raise", amount: 50 });
  s = applyAction(s, 1, { type: "fold" });
  s = applyAction(s, 2, { type: "call", amount: 30 });
  for (let i = 0; i < 2; i++) {
    s = applyAction(s, 2, { type: "check" });
    s = applyAction(s, 0, { type: "check" });
  }
  if (heroBets > 0) {
    s = applyAction(s, 2, { type: "check" });
    s = applyAction(s, 0, { type: "bet", amount: heroBets });
  }
  return s;
}

const river: Record<string, unknown> = {};
function pinRiver(s: GameState, r: number, name: string) {
  const la = legalActions(s);
  const saved = Math.random;
  Math.random = () => r;
  const d = decideBot(s, 2);
  Math.random = saved;
  river[name] = {
    action: d.action,
    rangeLen: d.range ? d.range.length : null,
    range: d.range,
    la,
    pot: s.pot,
    currentBet: s.currentBet,
    board: s.board,
  };
}

{
  const s = toRiver("TAG", ["Ks", "Kd"]);
  pinRiver(s, 0.6, "R1_tag_KK_nobet_060");
  pinRiver(s, 0.1, "R2_tag_KK_nobet_010");
  pinRiver(s, 0.3, "R2b_tag_KK_nobet_030");
}
pinRiver(toRiver("Station", ["7s", "2h"]), 0.5, "R3_station_72o_nobet_050");
{
  const s = toRiver("TAG", ["Ks", "Kd"], 60);
  pinRiver(s, 0.5, "R4_tag_KK_vs_bet60_050");
  pinRiver(s, 0.9, "R4b_tag_KK_vs_bet60_090");
}
pinRiver(toRiver("Nit", ["7s", "2h"], 60), 0.5, "R5_nit_72o_vs_bet60_050");
{
  const st = toRiver("Station", ["7s", "2h"], 60);
  pinRiver(st, 0.5, "R5b_station_72o_vs_bet60_050");
  pinRiver(st, 0.8, "R5c_station_72o_vs_bet60_080");
}
pinRiver(toRiver("Station", ["7s", "2h"], 100), 0.5, "R5d_station_72o_vs_bet100_050");
{
  const s = toRiver("LAG", ["7s", "2h"]);
  pinRiver(s, 0.05, "R6_lag_72o_nobet_005");
  pinRiver(s, 0.2, "R6b_lag_72o_nobet_020");
}

console.log(JSON.stringify({ preflop: out, river }, null, 0));
