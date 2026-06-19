/* node --experimental-transform-types scripts/puzzles_test.ts */
import { generatePuzzle, gradePuzzle, RFI_PCT, type DrillAction } from "../src/engine/puzzles.ts";
import { topPercentRange } from "../src/engine/ranges.ts";

let passed = 0;
let failed = 0;
const seen: Record<string, number> = {};
function ok(cond: boolean, msg: string) {
  if (cond) passed++;
  else {
    failed++;
    if ((seen[msg] = (seen[msg] ?? 0) + 1) <= 2) console.error("  FAIL:", msg);
  }
}

// Chart sanity (the membership the grader relies on)
ok(topPercentRange(RFI_PCT.UTG).has("AA"), "AA in UTG RFI");
ok(!topPercentRange(RFI_PCT.UTG).has("72o"), "72o not in UTG RFI");
ok(topPercentRange(RFI_PCT.BTN).size > topPercentRange(RFI_PCT.UTG).size, "BTN opens wider than UTG");

const ALL: DrillAction[] = ["fold", "check", "call", "bet", "raise"];
const kinds = new Set<string>();

for (let i = 0; i < 800; i++) {
  const p = generatePuzzle();
  kinds.add(p.kind);

  // structure
  ok(p.hole[0] !== p.hole[1], "distinct hole cards");
  const expectBoard = p.street === "preflop" ? 0 : p.street === "flop" ? 3 : p.street === "turn" ? 4 : 5;
  ok(p.board.length === expectBoard, `board length matches street (${p.street})`);
  ok(p.pot > 0 && p.toCall >= 0, "pot>0, toCall>=0");
  ok(p.frames.length >= 2, "has navigator frames");
  ok(p.options.length >= 2, "has options");
  ok(p.accept.length >= 1 && p.accept.includes(p.best), "best is acceptable");
  ok(p.options.some((o) => o.action === p.best), "best is an offered option");

  // grading consistency
  ok(gradePuzzle(p, p.best).correct, "grading the best answer is correct");
  const wrong = ALL.find((a) => p.options.some((o) => o.action === a) && !p.accept.includes(a));
  if (wrong) ok(!gradePuzzle(p, wrong).correct, "a non-accepted option grades wrong");

  // postflop puzzles expose equity + odds where relevant
  if (p.kind === "postflop-bet") ok(p.equity !== undefined && p.potOdds !== undefined, "postflop-bet has equity/odds");
}

ok(kinds.size === 4, `all four puzzle kinds generated (${[...kinds].join(",")})`);

console.log(`\nPuzzle tests: ${passed} passed, ${failed} failed.`);
process.exit(failed === 0 ? 0 : 1);
