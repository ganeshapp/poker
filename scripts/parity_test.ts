/* TS ↔ Rust engine parity test (the cross-check the README promises).
 *
 * Evaluator: every golden-corpus hand must score IDENTICALLY in both
 * engines (they share the category*16^5 + packed-kickers scheme).
 * Equity: exact-enumeration cases (turn/river) must produce identical
 * win/tie/lose counts — no tolerance, because neither side samples.
 *
 *   node --experimental-transform-types scripts/parity_test.ts
 * Requires the Rust toolchain (builds poker-core's `parity` example).
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { evaluateInts } from "../src/engine/evaluator.ts";
import { equityVsRange, equityVsRandom, comboToInts } from "../src/engine/equity.ts";
import { labelToCombos } from "../src/engine/notation.ts";
import { cardToInt } from "../src/engine/cards.ts";
import type { Card, HandLabel } from "../src/types/poker.ts";

let passed = 0;
let failed = 0;
const fail = (msg: string) => {
  failed++;
  console.error("  FAIL:", msg);
};

const { corpus } = JSON.parse(
  readFileSync(new URL("./golden/evaluator.json", import.meta.url), "utf8"),
) as { corpus: { cards: number[] }[] };

interface EqCase {
  hero: [Card, Card];
  board: Card[];
  range: HandLabel[];
}
const EQ_CASES: EqCase[] = [
  // River vs random (exact: C(45,2) villain combos).
  { hero: ["Ah", "Kh"], board: ["Ad", "Kc", "7s", "2d", "9h"], range: [] },
  { hero: ["7h", "2c"], board: ["As", "Ks", "Qs", "Js", "Ts"], range: [] }, // board plays
  { hero: ["9c", "9d"], board: ["9h", "9s", "2c", "3d", "4h"], range: [] }, // quads
  // River vs ranges (blockers + suited/offsuit/pair label expansion).
  { hero: ["Ah", "Ad"], board: ["Kc", "Qd", "Js", "3d", "2h"], range: ["AKs", "AKo", "TT", "T9s"] },
  { hero: ["Qs", "Jd"], board: ["Th", "9c", "2d", "8s", "Kd"], range: ["QQ", "JJ", "TT", "AKo", "AQs"] },
  { hero: ["2c", "2d"], board: ["Ac", "Kc", "Qc", "Jc", "9c"], range: ["A2s", "KQo", "55"] },
  // Turn vs ranges (exact: combos × 44 rivers).
  { hero: ["Ah", "Kh"], board: ["Ad", "Kc", "7s", "2d"], range: ["QQ", "JJ", "AKo"] },
  { hero: ["8h", "7h"], board: ["6h", "5c", "Kd", "2s"], range: ["AA", "KK", "AKs", "66"] },
  { hero: ["As", "Qs"], board: ["Qc", "7d", "3h", "As"], range: ["77", "A7s", "KQs", "JTs"] },
  { hero: ["Td", "Ts"], board: ["9c", "8c", "2h", "7c"], range: ["A9s", "JTo", "65s", "QQ"] },
];

const input = {
  evals: corpus.map((c) => c.cards),
  equities: EQ_CASES.map((c) => ({ hero: c.hero, board: c.board, range: c.range })),
};

const r = spawnSync(
  "cargo",
  ["run", "--quiet", "--manifest-path", "poker-core/Cargo.toml", "--example", "parity"],
  { input: JSON.stringify(input), encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
);
if (r.status !== 0) {
  console.error(r.stderr);
  console.error("parity: failed to run the Rust example (is the Rust toolchain installed?)");
  process.exit(1);
}
const out = JSON.parse(r.stdout) as {
  evals: { category: number; score: number }[];
  equities: { win: number; tie: number; lose: number; exact: boolean }[];
};

/* ---- Evaluator parity: exact category + score equality ---- */
let evalBad = 0;
corpus.forEach((c, i) => {
  const ts = evaluateInts(c.cards);
  const rs = out.evals[i];
  if (ts.category !== rs.category || ts.score !== rs.score) evalBad++;
});
if (evalBad === 0) passed += corpus.length;
else fail(`${evalBad}/${corpus.length} hands score differently in TS vs Rust`);

/* ---- Exact-equity parity: identical win/tie/lose counts ---- */
EQ_CASES.forEach((c, i) => {
  const boardInts = c.board.map(cardToInt);
  const ts =
    c.range.length === 0
      ? equityVsRandom(comboToInts(c.hero), boardInts, 10)
      : equityVsRange(
          comboToInts(c.hero),
          boardInts,
          c.range.flatMap((l) => labelToCombos(l)).map((p) => comboToInts(p)),
          10,
        );
  const rs = out.equities[i];
  if (!ts.exact || !rs.exact) {
    fail(`case ${i}: expected exact enumeration on both sides (ts=${ts.exact}, rust=${rs.exact})`);
  } else if (ts.win !== rs.win || ts.tie !== rs.tie || ts.lose !== rs.lose) {
    fail(
      `case ${i} (${c.hero.join("")} on ${c.board.join("")}): TS ${ts.win}/${ts.tie}/${ts.lose} vs Rust ${rs.win}/${rs.tie}/${rs.lose}`,
    );
  } else {
    passed++;
  }
});

console.log(`\nParity tests: ${passed} passed, ${failed} failed.`);
process.exit(failed === 0 ? 0 : 1);
