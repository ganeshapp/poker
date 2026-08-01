/* Golden-file regression test — pins evaluator scores and every bundled
 * chart. Fails when either changes; if the change is INTENTIONAL,
 * regenerate with golden_gen.ts and commit the diff.
 *   node --experimental-transform-types scripts/golden_test.ts
 */
import { readFileSync } from "node:fs";
import { evaluateInts } from "../src/engine/evaluator.ts";
import { rankedHands, topPercentRange, buildPreflopRanges } from "../src/engine/ranges.ts";
import { ARCHETYPES } from "../src/game/archetypes.ts";
import type { Position } from "../src/types/poker.ts";

let passed = 0;
let failed = 0;
const fail = (msg: string) => {
  failed++;
  console.error("  FAIL:", msg);
};

const load = (name: string) => JSON.parse(readFileSync(new URL(`./golden/${name}`, import.meta.url), "utf8"));

/* ---- Evaluator corpus ---- */
const { corpus } = load("evaluator.json") as {
  corpus: { cards: number[]; category: number; score: number }[];
};
let evalBad = 0;
for (const c of corpus) {
  const e = evaluateInts(c.cards);
  if (e.category !== c.category || e.score !== c.score) evalBad++;
}
if (evalBad === 0) passed += corpus.length;
else fail(`${evalBad}/${corpus.length} evaluator results differ from golden (scores are load-bearing — regenerate only if the scheme change is deliberate)`);

/* ---- Charts ---- */
const golden = load("charts.json") as {
  ranked: string[];
  topPct: Record<number, string[]>;
  bots: Record<string, { play: string[]; raise: string[] }>;
};

const eqArr = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

const ranked = rankedHands().map((h) => h.label);
if (eqArr(ranked, golden.ranked)) passed++;
else fail("rankedHands() order changed — the hand-ranking that every chart derives from");

let pctBad = 0;
for (let p = 1; p <= 100; p++) {
  if (!eqArr([...topPercentRange(p)].sort(), golden.topPct[p])) pctBad++;
}
if (pctBad === 0) passed += 100;
else fail(`topPercentRange changed for ${pctBad}/100 percentages`);

const POSITIONS: Position[] = ["UTG", "MP", "CO", "BTN", "SB", "BB"];
let botBad = 0;
for (const [name, cfg] of Object.entries(ARCHETYPES)) {
  for (const pos of POSITIONS) {
    const r = buildPreflopRanges(cfg.vpip, cfg.pfr, pos);
    const g = golden.bots[`${name}:${pos}`];
    if (!g || !eqArr([...r.play].sort(), g.play) || !eqArr([...r.raise].sort(), g.raise)) botBad++;
  }
}
if (botBad === 0) passed += Object.keys(golden.bots).length;
else fail(`buildPreflopRanges changed for ${botBad} archetype:position ranges`);

console.log(`\nGolden tests: ${passed} passed, ${failed} failed.`);
process.exit(failed === 0 ? 0 : 1);
