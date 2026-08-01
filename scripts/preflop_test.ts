/* Preflop chart tests — structural sanity of the authored 100bb charts
 * plus the qualitative fixes over the old Chen-formula slices.
 *   node --experimental-transform-types scripts/preflop_test.ts
 */
import { PREFLOP_100, PREFLOP_BY_DEPTH } from "../src/data/preflop.ts";
import { chartWidth } from "../src/engine/ranges.ts";
import { generatePuzzle } from "../src/engine/puzzles.ts";

let passed = 0;
let failed = 0;
function ok(cond: boolean, msg: string) {
  if (cond) passed++;
  else {
    failed++;
    console.error("  FAIL:", msg);
  }
}

/* ---- Structure ---- */
ok(!!PREFLOP_BY_DEPTH[100], "charts are depth-keyed with 100bb present");
for (const pos of ["UTG", "MP", "CO", "BTN", "SB"]) {
  ok(Object.keys(PREFLOP_100.rfi[pos] ?? {}).length > 20, `RFI chart exists for ${pos}`);
}
const PAIRS = [
  "MP_vs_UTG", "CO_vs_UTG", "CO_vs_MP", "BTN_vs_UTG", "BTN_vs_MP", "BTN_vs_CO",
  "SB_vs_UTG", "SB_vs_MP", "SB_vs_CO", "SB_vs_BTN",
  "BB_vs_UTG", "BB_vs_MP", "BB_vs_CO", "BB_vs_BTN", "BB_vs_SB",
];
for (const k of PAIRS) {
  ok(!!PREFLOP_100.vsRfi[k]?.threebet && !!PREFLOP_100.vsRfi[k]?.call, `vsRfi charts exist for ${k}`);
}

/* ---- Frequencies are valid and never sum past 100% ---- */
let badFreq = 0;
let overSum = 0;
for (const chart of Object.values(PREFLOP_100.rfi)) {
  for (const f of Object.values(chart)) if (!(f > 0 && f <= 1)) badFreq++;
}
for (const { threebet, call } of Object.values(PREFLOP_100.vsRfi)) {
  for (const f of [...Object.values(threebet), ...Object.values(call)]) if (!(f > 0 && f <= 1)) badFreq++;
  for (const [l, f] of Object.entries(call)) {
    if (f + (threebet[l] ?? 0) > 1.001) overSum++;
  }
}
ok(badFreq === 0, `all frequencies in (0,1] (${badFreq} bad)`);
ok(overSum === 0, `no label 3-bets + calls more than 100% (${overSum} bad)`);

/* ---- Widths: positional monotonicity and sane bands ---- */
const w = (pos: string) => chartWidth(PREFLOP_100.rfi[pos]);
ok(w("UTG") < w("MP") && w("MP") < w("CO") && w("CO") < w("BTN"), "RFI widens UTG < MP < CO < BTN");
ok(w("UTG") > 0.1 && w("UTG") < 0.2, `UTG opens ~15% (got ${(w("UTG") * 100).toFixed(1)}%)`);
ok(w("BTN") > 0.38 && w("BTN") < 0.52, `BTN opens ~45% (got ${(w("BTN") * 100).toFixed(1)}%)`);

/* ---- Raiser position matters (the bug the Chen slices had) ---- */
const cont = (k: string) =>
  chartWidth(PREFLOP_100.vsRfi[k].threebet) + chartWidth(PREFLOP_100.vsRfi[k].call);
ok(cont("BB_vs_BTN") > cont("BB_vs_UTG") + 0.1, "BB defends much wider vs a BTN open than vs UTG");
ok(cont("BTN_vs_CO") > cont("BTN_vs_UTG"), "BTN continues wider vs CO than vs UTG");
ok(
  chartWidth(PREFLOP_100.vsRfi.SB_vs_BTN.threebet) > chartWidth(PREFLOP_100.vsRfi.SB_vs_UTG.threebet),
  "SB 3-bets more vs BTN than vs UTG",
);

/* ---- The hands Chen got wrong ---- */
ok((PREFLOP_100.vsRfi.BB_vs_BTN.threebet["A5s"] ?? 0) > 0, "A5s 3-bet bluffs vs a BTN open");
ok((PREFLOP_100.vsRfi.BB_vs_UTG.threebet["KJo"] ?? 0) === 0, "KJo never 3-bets vs UTG");
ok((PREFLOP_100.vsRfi.CO_vs_UTG.threebet["KJo"] ?? 0) === 0, "KJo never 3-bets vs UTG from CO");
for (const k of PAIRS) {
  ok((PREFLOP_100.vsRfi[k].threebet["AA"] ?? 0) === 1, `AA always 3-bets (${k})`);
}
ok((PREFLOP_100.rfi.UTG["72o"] ?? 0) === 0 && (PREFLOP_100.rfi.BTN["72o"] ?? 0) === 0, "72o never opens");
ok((PREFLOP_100.vsRfi.BTN_vs_CO.call["76s"] ?? 0) > 0, "suited connectors defend in position vs CO");
ok((PREFLOP_100.rfi.UTG["A5s"] ?? 0) > 0, "A5s opens (at some frequency) even UTG");

/* ---- Drill generator coherence over the new charts ---- */
let seen = { rfi: 0, vs: 0 };
for (let i = 0; i < 800; i++) {
  const p = generatePuzzle();
  if (p.kind === "rfi") seen.rfi++;
  if (p.kind === "vs-raise") seen.vs++;
  if (!p.options.map((o) => o.action).includes(p.best)) {
    ok(false, `best "${p.best}" not among options (${p.kind})`);
    break;
  }
  if (!p.accept.includes(p.best)) {
    ok(false, "accept excludes best");
    break;
  }
  if (i === 799) ok(true, "800 generated puzzles coherent vs new charts");
}
ok(seen.rfi > 100 && seen.vs > 100, "both preflop puzzle kinds generate");

console.log(`\nPreflop chart tests: ${passed} passed, ${failed} failed.`);
process.exit(failed === 0 ? 0 : 1);
