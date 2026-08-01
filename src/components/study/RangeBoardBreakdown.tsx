import type { Card, HandLabel } from "@/types/poker";
import { HandCategory, HAND_CATEGORY_NAMES } from "@/types/poker";
import { labelToCombos } from "@/engine/notation";
import { cardToInt } from "@/engine/cards";
import { evaluateInts } from "@/engine/evaluator";
import { fmtPct } from "@/lib/format";

/* "How does this range hit this board?" — the Flopzilla question.
   Counts every unblocked combo's made hand on the board, plus draws
   (flush draw / open-ended) before the river. */

interface Bucket {
  label: string;
  combos: number;
  tone: string;
}

function drawFlags(holeInts: [number, number], boardInts: number[]): { flushDraw: boolean; oesd: boolean } {
  const all = [...holeInts, ...boardInts];
  const suits = [0, 0, 0, 0];
  let mask = 0;
  for (const c of all) {
    suits[c & 3]++;
    mask |= 1 << ((c >> 2) + 2);
  }
  const holeSuits = [holeInts[0] & 3, holeInts[1] & 3];
  const flushDraw = suits.some((n, si) => n === 4 && holeSuits.includes(si));
  if (mask & (1 << 14)) mask |= 1 << 1;
  let run = 0;
  let bestRun = 0;
  for (let r = 1; r <= 14; r++) {
    run = mask & (1 << r) ? run + 1 : 0;
    bestRun = Math.max(bestRun, run);
  }
  return { flushDraw, oesd: bestRun >= 4 };
}

export function breakdownRange(range: Set<HandLabel>, board: Card[], dead: Card[] = []) {
  const boardInts = board.map(cardToInt);
  const blocked = new Set([...board, ...dead].map(cardToInt));
  const catCount = new Map<number, number>();
  let flushDraws = 0;
  let oesds = 0;
  let total = 0;

  for (const label of range) {
    for (const [a, b] of labelToCombos(label)) {
      const ai = cardToInt(a);
      const bi = cardToInt(b);
      if (blocked.has(ai) || blocked.has(bi)) continue;
      total++;
      const cat = evaluateInts([ai, bi, ...boardInts]).category;
      catCount.set(cat, (catCount.get(cat) ?? 0) + 1);
      if (board.length < 5) {
        const d = drawFlags([ai, bi], boardInts);
        if (d.flushDraw) flushDraws++;
        if (d.oesd) oesds++;
      }
    }
  }
  return { catCount, flushDraws, oesds, total };
}

export function RangeBoardBreakdown({
  title,
  range,
  board,
  dead = [],
}: {
  title: string;
  range: Set<HandLabel>;
  board: Card[];
  dead?: Card[];
}) {
  if (board.length < 3 || range.size === 0) return null;
  const { catCount, flushDraws, oesds, total } = breakdownRange(range, board, dead);
  if (total === 0) return null;

  const CATS: HandCategory[] = [
    HandCategory.StraightFlush,
    HandCategory.Quads,
    HandCategory.FullHouse,
    HandCategory.Flush,
    HandCategory.Straight,
    HandCategory.Trips,
    HandCategory.TwoPair,
    HandCategory.Pair,
    HandCategory.HighCard,
  ];
  const buckets: Bucket[] = CATS.filter((c) => (catCount.get(c) ?? 0) > 0).map((c) => ({
    label: HAND_CATEGORY_NAMES[c],
    combos: catCount.get(c) ?? 0,
    tone: c >= HandCategory.Straight ? "var(--good)" : c >= HandCategory.Pair ? "var(--gold)" : "var(--ink-500)",
  }));
  const max = Math.max(...buckets.map((b) => b.combos));

  return (
    <div className="rounded-xl border border-[var(--line)] bg-ink-850 p-3">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[0.8rem] font-semibold text-[var(--text)]">{title}</span>
        <span className="text-[0.68rem] text-faint">{total} combos on {board.join(" ")}</span>
      </div>
      <div className="space-y-1">
        {buckets.map((b) => (
          <div key={b.label} className="flex items-center gap-2 text-[0.72rem]">
            <span className="w-[86px] shrink-0 text-muted">{b.label}</span>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-ink-600">
              <div className="h-full rounded-full" style={{ width: `${(b.combos / max) * 100}%`, background: b.tone }} />
            </div>
            <span className="mono w-14 shrink-0 text-right text-muted">{fmtPct(b.combos / total)}</span>
          </div>
        ))}
      </div>
      {board.length < 5 && (flushDraws > 0 || oesds > 0) && (
        <div className="mt-2 flex gap-4 text-[0.7rem] text-faint">
          {flushDraws > 0 && <span>Flush draws: {fmtPct(flushDraws / total)}</span>}
          {oesds > 0 && <span>Open-enders: {fmtPct(oesds / total)}</span>}
        </div>
      )}
    </div>
  );
}
