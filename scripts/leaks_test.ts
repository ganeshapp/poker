/* node --experimental-transform-types scripts/leaks_test.ts */
import { leaksFromDecisions, type DecisionRecord } from "../src/lib/leaks.ts";

let passed = 0;
let failed = 0;
function ok(cond: boolean, msg: string) {
  if (cond) passed++;
  else {
    failed++;
    console.error("  FAIL:", msg);
  }
}

const d = (verdict: DecisionRecord["verdict"], action: DecisionRecord["action"]): DecisionRecord => ({
  verdict,
  action,
  equity: 0.3,
  potOdds: 0.25,
  evBb: -1,
  street: "flop",
  villainArchetype: "TAG",
  ts: 0,
});

// empty
const empty = leaksFromDecisions([]);
ok(empty.total === 0 && empty.leaks.length === 0, "empty → no leaks");

// fold mistakes
const folds = leaksFromDecisions([
  ...Array(4).fill(0).map(() => d("mistake", "fold")),
  ...Array(6).fill(0).map(() => d("ok", "call")),
]);
ok(folds.total === 10 && folds.foldMistakes === 4, "fold counts");
ok(folds.leaks.some((l) => l.toLowerCase().includes("fold too often")), "fold-too-often leak");

// call mistakes
const calls = leaksFromDecisions([
  ...Array(4).fill(0).map(() => d("mistake", "call")),
  ...Array(6).fill(0).map(() => d("ok", "check")),
]);
ok(calls.callMistakes === 4 && calls.leaks.some((l) => l.toLowerCase().includes("call too wide")), "call-too-wide leak");

// clean play
const clean = leaksFromDecisions([
  ...Array(6).fill(0).map(() => d("ok", "call")),
  ...Array(4).fill(0).map(() => d("great", "bet")),
]);
ok(clean.mistakes === 0 && clean.great === 4 && clean.leaks.some((l) => l.includes("No clear")), "clean discipline note");

// info excluded
const withInfo = leaksFromDecisions([d("info", "check"), d("info", "check"), d("ok", "call")]);
ok(withInfo.total === 1, "info verdicts excluded from total");

console.log(`\nLeak tests: ${passed} passed, ${failed} failed.`);
process.exit(failed === 0 ? 0 : 1);
