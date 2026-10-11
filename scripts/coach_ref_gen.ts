/* Regenerates the Dart port's coach parity fixture.
 *
 *   # in ../poker-zapp, dump the inputs (one definition, owned by the test):
 *   COACH_DUMP=1 flutter test test/engine/coach_test.dart
 *   # then, here:
 *   node --experimental-transform-types scripts/coach_ref_gen.ts
 *
 * Reads `../poker-zapp/test/fixtures/coach_scenarios.json` — the scenarios the
 * Dart test actually runs — plays each one through THIS engine's `evaluateHero`
 * with the same stubbed equity, and writes `coach_ref.dart`. Both languages are
 * therefore compared on identical inputs, and there is no second copy of the
 * coach to drift (there used to be: `src/store/_gameStore_patched.ts`).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createTable, startHand } from "../src/game/engine.ts";
import { evaluateHero, villainRangeFor, firstOpponentInHand, scoreGuess } from "../src/game/coach.ts";
import type { EquityEngine } from "../src/game/coach.ts";
import type { Action, Card, GameConfig, GameState, HandLabel, Street } from "../src/types/poker.ts";
import type { EquityResult } from "../src/engine/equity.ts";

const SCENARIOS = "../poker-zapp/test/fixtures/coach_scenarios.json";
const OUT = "../poker-zapp/test/engine/coach_ref.dart";

const CONFIG: GameConfig = { seats: 6, startingStack: 2000, smallBlind: 10, bigBlind: 20 };

interface Spec {
  button: number;
  hole: Card[];
  street: Street | null;
  board: Card[];
  pot: number;
  currentBet: number;
  aggressor: number | null;
  folded: number[];
  committed: Record<string, number>;
  botRanges: Record<string, HandLabel[]>;
}

/** Mirrors `makeState` in the Dart test, field for field. */
function makeState(sp: Spec): GameState {
  const t = createTable(CONFIG);
  t.button = sp.button;
  const s = startHand(t);
  s.players[0].hole = [...sp.hole] as [Card, Card];
  if (sp.street) {
    s.street = sp.street;
    s.board = [...sp.board];
    s.pot = sp.pot;
    s.currentBet = sp.currentBet;
    s.aggressor = sp.aggressor;
    for (const p of s.players) p.committed = 0;
    for (const [seat, v] of Object.entries(sp.committed)) s.players[Number(seat)].committed = v;
  }
  for (const f of sp.folded) s.players[f].hasFolded = true;
  for (const [seat, r] of Object.entries(sp.botRanges)) s.botRanges[Number(seat)] = [...r];
  s.toAct = 0;
  return s;
}

type StubbedCall = { equity: number; samples: number; se: number; exact: boolean } | null;

/** The equity facade, answering from the dumped stub in call order. */
function stubEngine(stub: StubbedCall[], calls: unknown[]): EquityEngine {
  const answer = async (job: unknown): Promise<EquityResult> => {
    calls.push(job);
    const r = stub[calls.length - 1];
    if (!r) throw new Error("boom");
    return { equity: r.equity, win: 0, tie: 0, lose: 0, samples: r.samples, se: r.se, exact: r.exact };
  };
  // Shaped exactly like `callJson` in the Dart test, so the two record the
  // same thing about each call.
  return {
    equityVsRange: (hero, board, range, iters, seed) =>
      answer({ mode: "range", hero, board, rangeLen: range.length, iters, seed }),
    equityVsRanges: (hero, board, ranges, iters, seed) =>
      answer({ mode: "ranges", hero, board, iters, seed, oppRanges: ranges.length }),
    equityVsField: (hero, board, opponents, iters, seed) =>
      answer({ mode: "field", hero, board, opponents, iters, seed }),
    equityVsRandom: (hero, board, iters, seed) => answer({ mode: "random", hero, board, iters, seed }),
  };
}

/** Dart literal for a JSON value, matching the existing fixture's style. */
function dart(v: unknown, indent = 2): string {
  const pad = " ".repeat(indent);
  const padIn = " ".repeat(indent + 2);
  if (v === null || v === undefined) return "null";
  if (typeof v === "string") return `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\$/g, "\\$")}"`;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) {
    if (v.length === 0) return "[]";
    return `[\n${v.map((x) => `${padIn}${dart(x, indent + 2)}`).join(",\n")},\n${pad}]`;
  }
  const entries = Object.entries(v as Record<string, unknown>);
  if (entries.length === 0) return "{}";
  return `{\n${entries.map(([k, val]) => `${padIn}"${k}": ${dart(val, indent + 2)}`).join(",\n")},\n${pad}}`;
}

const raw = JSON.parse(readFileSync(SCENARIOS, "utf8")) as Record<
  string,
  {
    spec: Spec;
    action: { type: string; amount: number | null };
    settings: { mistakeBb: number; foldFlagBb: number; baseIters: number } | null;
    stub: StubbedCall[];
  }
>;

//  + standard sim quality.
const DEFAULTS = { mistakeBb: -0.3, foldFlagBb: 1.5, baseIters: 1600 };

const scenarios: Record<string, unknown> = {};
for (const [name, sc] of Object.entries(raw)) {
  const calls: unknown[] = [];
  const action = { type: sc.action.type, ...(sc.action.amount != null ? { amount: sc.action.amount } : {}) } as Action;
  const review = await evaluateHero(
    makeState(sc.spec),
    action,
    7,
    sc.settings ?? DEFAULTS,
    stubEngine(sc.stub, calls),
  );
  scenarios[name] = { review: review ? JSON.parse(JSON.stringify(review)) : null, calls };
}

// The non-scenario pins the Dart test also reads, shaped exactly as it builds
// them so the comparison is like for like.
const state = makeState({
  button: 3,
  hole: ["As", "Ks"] as Card[],
  street: null,
  board: [],
  pot: 0,
  currentBet: 0,
  aggressor: null,
  folded: [],
  committed: {},
  botRanges: {},
});
const guessCases: Record<string, [HandLabel[], HandLabel[]]> = {
  aaKk: [["AA", "KK"], ["AA", "AKs"]],
  same: [["AKo"], ["AKo"]],
  miss: [["72o"], ["AA"]],
  dupes: [["AA", "AA"], ["AA"]],
  wide: [["AKs", "AKo", "AA"], ["AA"]],
  empty: [[], ["AA"]],
  big: [
    ["AA", "KK", "QQ", "JJ", "TT", "AKs", "AQs", "AJs", "KQs", "AKo", "AQo", "T9s", "98s", "76o"],
    ["AA", "KK", "QQ", "JJ", "AKs", "AKo", "AQs", "KQo", "JTs", "T9s", "22"],
  ],
};
const extras = {
  guess: Object.fromEntries(Object.entries(guessCases).map(([k, [a, b]]) => [k, scoreGuess(a, b)])),
  seats: state.players.map((p) => ({
    id: p.id,
    name: p.name,
    ...(p.archetype ? { archetype: p.archetype } : {}),
    position: p.position,
  })),
  firstOpp: firstOpponentInHand(state),
};

writeFileSync(
  OUT,
  `// GENERATED by ../poker/scripts/coach_ref_gen.ts from the scenario inputs the
// Dart test itself dumps (\`COACH_DUMP=1 flutter test test/engine/coach_test.dart\`),
// played through the desktop \`src/game/coach.ts\`. Both languages are compared
// on identical inputs. Do not hand-edit.
// ignore_for_file: lines_longer_than_80_chars

const Map<String, Object?> kCoachRef = ${dart({ scenarios, ...extras })};
`,
);
console.log(`wrote ${OUT} (${Object.keys(scenarios).length} scenarios)`);
