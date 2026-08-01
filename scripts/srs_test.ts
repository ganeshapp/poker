/* Spaced-repetition scheduler tests.
 *   node --experimental-transform-types scripts/srs_test.ts
 */
import { newSrs, reviewSrs, isDue, isGraduated, RETIRE_REPS } from "../src/lib/srs.ts";

let passed = 0;
let failed = 0;
function ok(cond: boolean, msg: string) {
  if (cond) passed++;
  else {
    failed++;
    console.error("  FAIL:", msg);
  }
}

const DAY = 86_400_000;
const t0 = 1_750_000_000_000;

// New cards are due immediately.
const fresh = newSrs(t0);
ok(isDue(fresh, t0), "new card is due now");
ok(!isGraduated(fresh), "new card not graduated");

// Correct ladder: 1d -> 3d -> ~1w, graduating at RETIRE_REPS.
const r1 = reviewSrs(fresh, true, t0);
ok(r1.intervalDays === 1 && r1.due === t0 + DAY, "first success -> due in 1 day");
ok(!isDue(r1, t0 + DAY / 2), "not due before its date");
const r2 = reviewSrs(r1, true, t0 + DAY);
ok(r2.intervalDays === 3, "second success -> 3 days");
const r3 = reviewSrs(r2, true, t0 + 4 * DAY);
ok(r3.intervalDays >= 4, "third success -> interval grows");
ok(r3.reps === RETIRE_REPS && isGraduated(r3), "graduates after 3 spaced successes");

// A miss resets the ladder and returns quickly.
const miss = reviewSrs(r2, false, t0 + 4 * DAY);
ok(miss.reps === 0 && miss.lapses === 1, "miss resets reps, counts a lapse");
ok(miss.due - (t0 + 4 * DAY) <= 15 * 60_000, "missed card comes back within minutes");
ok(miss.ease < r2.ease, "miss lowers ease");
const recover = reviewSrs(miss, true, t0 + 5 * DAY);
ok(recover.intervalDays === 1 && !isGraduated(recover), "recovery restarts the ladder — one correct answer never retires a card");

// Ease is clamped.
let s = newSrs(t0);
for (let i = 0; i < 20; i++) s = reviewSrs(s, false, t0);
ok(s.ease >= 1.3, "ease floor holds");
let g = newSrs(t0);
for (let i = 0; i < 20; i++) g = { ...reviewSrs(g, true, t0), reps: 1 };
ok(g.ease <= 3, "ease ceiling holds");

console.log(`\nSRS tests: ${passed} passed, ${failed} failed.`);
process.exit(failed === 0 ? 0 : 1);
