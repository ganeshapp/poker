/* Nash push/fold table tests — structural sanity of the computed
 * equilibrium plus the drill generator that consumes it.
 *   node --experimental-transform-types scripts/pushfold_test.ts
 */
import { NASH_SHOVE, NASH_CALL, PUSHFOLD_STACKS } from "../src/data/pushfold.ts";
import { generatePushFold } from "../src/engine/puzzles.ts";

let passed = 0;
let failed = 0;
function ok(cond: boolean, msg: string) {
  if (cond) passed++;
  else {
    failed++;
    console.error("  FAIL:", msg);
  }
}

const width = (r: Record<string, number> | undefined) =>
  Object.entries(r ?? {}).reduce(
    (a, [l, w]) => a + w * (l.length === 2 ? 6 : l.endsWith("s") ? 4 : 12),
    0,
  ) / 1326;

/* ---- Table structure ---- */
for (const S of PUSHFOLD_STACKS) {
  ok(!!NASH_SHOVE[S]?.SB && !!NASH_SHOVE[S]?.BTN, `stack ${S}: shove tables exist`);
  ok(!!NASH_CALL[S]?.["SB>BB"], `stack ${S}: SB>BB call table exists`);
}

/* ---- The bug this replaces: SB must jam WIDER than BTN (only one
       player left to act). The old heuristic had it inverted. ---- */
for (const S of PUSHFOLD_STACKS) {
  ok(
    width(NASH_SHOVE[S].SB) > width(NASH_SHOVE[S].BTN),
    `stack ${S}: SB jam range wider than BTN`,
  );
}

/* ---- Positional monotonicity at 10bb: earlier position = tighter ---- */
const w10 = (p: "UTG" | "MP" | "CO" | "BTN" | "SB") => width(NASH_SHOVE[10][p]);
ok(w10("UTG") < w10("MP") && w10("MP") < w10("CO") && w10("CO") < w10("BTN") && w10("BTN") < w10("SB"),
  "10bb jam widths increase UTG < MP < CO < BTN < SB");

/* ---- Stack monotonicity: shorter = wider ---- */
ok(width(NASH_SHOVE[5].SB) > width(NASH_SHOVE[10].SB), "SB 5bb wider than 10bb");
ok(width(NASH_SHOVE[10].SB) > width(NASH_SHOVE[20].SB), "SB 10bb wider than 20bb");
ok(width(NASH_CALL[5]["SB>BB"]) > width(NASH_CALL[15]["SB>BB"]), "BB calls wider vs 5bb than 15bb jams");

/* ---- Published-value neighborhoods (classic chip-EV no-ante tables) ---- */
const sb10 = width(NASH_SHOVE[10].SB);
ok(sb10 > 0.45 && sb10 < 0.68, `SB 10bb jam ~52-60% published (got ${(sb10 * 100).toFixed(1)}%)`);
const bbCall10 = width(NASH_CALL[10]["SB>BB"]);
ok(bbCall10 > 0.28 && bbCall10 < 0.48, `BB call vs SB 10bb ~35-40% published (got ${(bbCall10 * 100).toFixed(1)}%)`);

/* ---- Hand-level sanity ---- */
for (const S of PUSHFOLD_STACKS) {
  ok((NASH_SHOVE[S].SB?.["AA"] ?? 0) === 1, `stack ${S}: SB always jams AA`);
  ok((NASH_CALL[S]["SB>BB"]?.["AA"] ?? 0) === 1, `stack ${S}: BB always calls AA`);
}
ok((NASH_SHOVE[10].BTN?.["72o"] ?? 0) === 0, "BTN never jams 72o at 10bb");
ok((NASH_SHOVE[10].SB?.["A2o"] ?? 0) === 1, "SB jams any ace at 10bb");
// BB calls wider vs the SB's wide jam than vs the BTN's tighter jam.
ok(width(NASH_CALL[10]["SB>BB"]) > width(NASH_CALL[10]["BTN>BB"]), "BB calls wider vs SB than vs BTN at 10bb");

/* ---- All weights are valid frequencies ---- */
let badW = 0;
for (const S of PUSHFOLD_STACKS) {
  for (const t of [
    ...Object.values(NASH_SHOVE[S]),
    ...Object.values(NASH_CALL[S]),
  ]) {
    for (const w of Object.values(t as Record<string, number>)) {
      if (!(w > 0 && w <= 1)) badW++;
    }
  }
}
ok(badW === 0, `all table weights in (0,1] (${badW} bad)`);

/* ---- Drill generator consumes the tables coherently ---- */
for (let i = 0; i < 500; i++) {
  const p = generatePushFold();
  const optActions = p.options.map((o) => o.action);
  if (!optActions.includes(p.best)) {
    ok(false, `puzzle best "${p.best}" not offered in options`);
    break;
  }
  if (p.accept.length === 0 || !p.accept.includes(p.best)) {
    ok(false, "accept set missing or excludes best");
    break;
  }
  if (i === 499) ok(true, "500 generated push/fold puzzles coherent");
}

console.log(`\nPush/fold tests: ${passed} passed, ${failed} failed.`);
process.exit(failed === 0 ? 0 : 1);
