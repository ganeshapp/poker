/* Regenerates the golden files under scripts/golden/.
 *
 * Run ONLY when a change to evaluator scores or bundled charts is
 * intentional, then commit the diff — golden_test.ts pins these:
 *   node --experimental-transform-types scripts/golden_gen.ts
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { evaluateInts } from "../src/engine/evaluator.ts";
import { mulberry32 } from "../src/engine/equity.ts";
import { rankedHands, topPercentRange, buildPreflopRanges } from "../src/engine/ranges.ts";
import { ARCHETYPES } from "../src/game/archetypes.ts";
import type { Position } from "../src/types/poker.ts";

const dir = fileURLToPath(new URL("./golden/", import.meta.url));
mkdirSync(dir, { recursive: true });

/* ---- Evaluator corpus: 600 seeded 5/6/7-card hands with pinned scores ---- */
const rand = mulberry32(0xa11a);
const corpus: { cards: number[]; category: number; score: number }[] = [];
for (let i = 0; i < 600; i++) {
  const deck = Array.from({ length: 52 }, (_, k) => k);
  for (let k = deck.length - 1; k > 0; k--) {
    const j = (rand() * (k + 1)) | 0;
    [deck[k], deck[j]] = [deck[j], deck[k]];
  }
  const cards = deck.slice(0, 5 + (i % 3));
  const e = evaluateInts(cards);
  corpus.push({ cards, category: e.category, score: e.score });
}
writeFileSync(dir + "evaluator.json", JSON.stringify({ corpus }));
console.log(`evaluator.json: ${corpus.length} hands`);

/* ---- Chart snapshot: every range the app derives today ---- */
const ranked = rankedHands().map((h) => h.label);
const topPct: Record<number, string[]> = {};
for (let p = 1; p <= 100; p++) topPct[p] = [...topPercentRange(p)].sort();

const POSITIONS: Position[] = ["UTG", "MP", "CO", "BTN", "SB", "BB"];
const bots: Record<string, { play: string[]; raise: string[] }> = {};
for (const [name, cfg] of Object.entries(ARCHETYPES)) {
  for (const pos of POSITIONS) {
    const r = buildPreflopRanges(cfg.vpip, cfg.pfr, pos);
    bots[`${name}:${pos}`] = { play: [...r.play].sort(), raise: [...r.raise].sort() };
  }
}
writeFileSync(dir + "charts.json", JSON.stringify({ ranked, topPct, bots }));
console.log(`charts.json: ${ranked.length} ranked labels, 100 top-%% slices, ${Object.keys(bots).length} bot ranges`);
