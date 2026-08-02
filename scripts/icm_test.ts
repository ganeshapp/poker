/* ICM tests: Malmuth-Harville properties + bubble-table qualitative
 * effects + drill coherence.
 *   node --experimental-transform-types scripts/icm_test.ts
 */
import { icmShares } from "../src/lib/icm.ts";
import { ICM_SCENARIOS } from "../src/data/icmPushfold.ts";
import { NASH_SHOVE, NASH_CALL } from "../src/data/pushfold.ts";

let passed = 0;
let failed = 0;
function ok(cond: boolean, msg: string) {
  if (cond) passed++;
  else {
    failed++;
    console.error("  FAIL:", msg);
  }
}
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

/* ---- Malmuth-Harville unit properties ---- */
const even = icmShares([25, 25, 25, 25], [0.5, 0.3, 0.2]);
ok(even.every((x) => near(x, 0.25, 1e-9)), "equal stacks split the pool equally");
ok(near(even.reduce((a, b) => a + b, 0), 1, 1e-9), "shares sum to the full pool");

const dom = icmShares([90, 4, 3, 3], [0.5, 0.3, 0.2]);
ok(dom[0] < 0.5, "even a monster stack is worth less than first-place money");
ok(dom[0] > 0.4, "…but close to it");

const bust = icmShares([0, 40, 30, 30], [0.5, 0.3, 0.2]);
ok(bust[0] === 0, "a busted stack has zero equity");
ok(near(bust.reduce((a, b) => a + b, 0), 1, 1e-9), "pool still fully distributed");

// Nonlinearity: doubling a stack does NOT double its $ value.
const base = icmShares([20, 20, 30, 30], [0.5, 0.3, 0.2])[0];
const doubled = icmShares([40, 0, 30, 30], [0.5, 0.3, 0.2])[0];
ok(doubled < 2 * base, "doubling up is worth less than 2x — the heart of ICM");

/* ---- Bubble-table qualitative effects ---- */
const width = (r: Record<string, number>) =>
  Object.entries(r).reduce((a, [l, w]) => a + w * (l.length === 2 ? 6 : l.endsWith("s") ? 4 : 12), 0) / 1326;
const byId = Object.fromEntries(ICM_SCENARIOS.map((s) => [s.id, s]));

ok(ICM_SCENARIOS.length >= 5, "scenario set present");
// The bubble effect: the even-stack BB calls FAR tighter than chip-EV.
const chipCall25 = width(NASH_CALL[25]["SB>BB"]);
const icmCallEven = width(byId["even"].call);
ok(icmCallEven < chipCall25 * 0.6, `bubble BB calls far tighter than chip-EV (${(icmCallEven * 100).toFixed(1)}% vs ${(chipCall25 * 100).toFixed(1)}%)`);
// The covering big stack jams any two.
ok(width(byId["big-sb"].jam) > 0.95, "covering big stack jams any two into the bubble");
// Jamming into the player who covers you collapses.
ok(width(byId["big-bb"].jam) < width(byId["even"].jam) * 0.5, "jamming into a covering chip leader collapses");
// SB jams wider under ICM than chip-EV at the same depth (folds are frequent).
const chipJam25 = width(NASH_SHOVE[25].SB ?? {});
ok(width(byId["even"].jam) > chipJam25, "even-bubble SB jams wider than chip-EV Nash at same depth");
// AA always plays.
for (const sc of ICM_SCENARIOS) {
  ok((sc.jam["AA"] ?? 0) === 1, `AA always jams (${sc.id})`);
  ok((sc.call["AA"] ?? 0) === 1, `AA always calls (${sc.id})`);
}
// All weights valid.
let bad = 0;
for (const sc of ICM_SCENARIOS) {
  for (const w of [...Object.values(sc.jam), ...Object.values(sc.call)]) if (!(w > 0 && w <= 1)) bad++;
}
ok(bad === 0, `all ICM weights in (0,1] (${bad} bad)`);

console.log(`\nICM tests: ${passed} passed, ${failed} failed.`);
process.exit(failed === 0 ? 0 : 1);
