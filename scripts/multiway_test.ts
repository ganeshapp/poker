/* node --experimental-transform-types scripts/multiway_test.ts */
import { equityVsField, equityRangeVsRange, comboToInts } from "../src/engine/equity.ts";
import { cardToInt } from "../src/engine/cards.ts";
import { allLabels, labelToCombos } from "../src/engine/notation.ts";

let passed = 0;
let failed = 0;
function ok(c: boolean, m: string) {
  if (c) passed++;
  else {
    failed++;
    console.error("  FAIL:", m);
  }
}
const eq = (hero: [string, string], board: string[], n: number) =>
  equityVsField(comboToInts(hero), board.map(cardToInt), n, 8000).equity;

// AA preflop decays with more opponents
const a1 = eq(["Ah", "Ad"], [], 1);
const a2 = eq(["Ah", "Ad"], [], 2);
const a4 = eq(["Ah", "Ad"], [], 4);
console.log(`AA: vs1=${(a1 * 100).toFixed(0)}%  vs2=${(a2 * 100).toFixed(0)}%  vs4=${(a4 * 100).toFixed(0)}%`);
ok(Math.abs(a1 - 0.85) < 0.03, "AA vs 1 ≈ 85%");
ok(a1 > a2 && a2 > a4, "AA equity decreases as opponents increase");

// Two pair decays multiway
const t1 = eq(["Ah", "Kh"], ["Ad", "Kc", "7s"], 1);
const t3 = eq(["Ah", "Kh"], ["Ad", "Kc", "7s"], 3);
console.log(`Top two pair: vs1=${(t1 * 100).toFixed(0)}%  vs3=${(t3 * 100).toFixed(0)}%`);
ok(t1 > t3, "two pair equity drops from heads-up to 3-way");
ok(t1 > 0.8, "top two pair is strong heads-up");

// Sanity bounds
ok(a1 <= 1 && a4 >= 0, "equity within [0,1]");

// Range vs range (calculator engine)
const combos = (lab: string) => labelToCombos(lab).map(comboToInts);
const allCombos = allLabels().flatMap((l) => labelToCombos(l).map(comboToInts));
const aaVsField = equityRangeVsRange(combos("AA"), [], allCombos, 8000).equity;
const aksVsQQ = equityRangeVsRange(combos("AKs"), [], combos("QQ"), 8000).equity;
console.log(`RvR: AA vs any=${(aaVsField * 100).toFixed(0)}%  AKs vs QQ=${(aksVsQQ * 100).toFixed(0)}%`);
ok(Math.abs(aaVsField - 0.85) < 0.03, "AA range vs any-two ≈ 85%");
ok(Math.abs(aksVsQQ - 0.46) < 0.04, "AKs vs QQ (range-vs-range) ≈ 46%");

console.log(`\nMultiway tests: ${passed} passed, ${failed} failed.`);
process.exit(failed === 0 ? 0 : 1);
