import type { Card } from "../types/poker.ts";
import { cardToInt } from "./cards.ts";
import { evaluateInts } from "./evaluator.ts";

/* ------------------------------------------------------------------
   Monte Carlo equity (TypeScript fallback engine).

   Under Tauri the heavy lifting runs in Rust; this mirror keeps the
   app fully playable in a plain browser (`npm run dev`) and serves as
   a cross-check for the Rust implementation in tests.
   ------------------------------------------------------------------ */

export interface EquityResult {
  equity: number; // win + tie/2, as a fraction 0..1
  win: number;
  tie: number;
  lose: number;
  samples: number;
}

type IntCombo = [number, number];

export function comboToInts(combo: [Card, Card]): IntCombo {
  return [cardToInt(combo[0]), cardToInt(combo[1])];
}

/**
 * Hero equity vs a villain range on a (partial) board.
 * @param hero   two int cards
 * @param board  0–5 int cards
 * @param range  villain's possible holdings (int combos)
 * @param iters  Monte Carlo samples
 */
export function equityVsRange(
  hero: IntCombo,
  board: number[],
  range: IntCombo[],
  iters = 1500,
): EquityResult {
  const used = new Set<number>([hero[0], hero[1], ...board]);
  const valid = range.filter((c) => !used.has(c[0]) && !used.has(c[1]));
  if (valid.length === 0) {
    return { equity: 0.5, win: 0, tie: 0, lose: 0, samples: 0 };
  }

  const baseAvail: number[] = [];
  for (let i = 0; i < 52; i++) if (!used.has(i)) baseAvail.push(i);

  const need = 5 - board.length;
  let win = 0;
  let tie = 0;
  let lose = 0;

  const heroBase = [hero[0], hero[1], ...board];

  for (let it = 0; it < iters; it++) {
    const villain = valid[(Math.random() * valid.length) | 0];

    // Working copy of available cards, then remove villain's two cards.
    const work = baseAvail.slice();
    let len = work.length;
    for (const vc of villain) {
      const idx = work.indexOf(vc);
      if (idx >= 0) {
        len--;
        const t = work[idx];
        work[idx] = work[len];
        work[len] = t;
      }
    }

    // Draw `need` runout cards from the active region.
    const draw: number[] = [];
    for (let k = 0; k < need; k++) {
      const j = (Math.random() * (len - k)) | 0;
      const last = len - 1 - k;
      const pick = work[j];
      work[j] = work[last];
      work[last] = pick;
      draw.push(pick);
    }

    const heroScore = evaluateInts([...heroBase, ...draw]).score;
    const villScore = evaluateInts([villain[0], villain[1], ...board, ...draw]).score;

    if (heroScore > villScore) win++;
    else if (heroScore < villScore) lose++;
    else tie++;
  }

  const samples = win + tie + lose;
  return { equity: (win + tie / 2) / samples, win, tie, lose, samples };
}

/**
 * Hero equity vs a field of N uniformly-random opponents (multiway).
 * Ties at the top split the pot, so hero's share is 1/(tied players).
 */
export function equityVsField(hero: IntCombo, board: number[], numOpponents: number, iters = 1500): EquityResult {
  const n = Math.max(1, Math.min(8, Math.floor(numOpponents)));
  const used = new Set<number>([hero[0], hero[1], ...board]);
  const avail: number[] = [];
  for (let i = 0; i < 52; i++) if (!used.has(i)) avail.push(i);

  const need = 5 - board.length;
  const heroBase = [hero[0], hero[1], ...board];
  let win = 0;
  let tie = 0;
  let lose = 0;
  let equitySum = 0;

  for (let it = 0; it < iters; it++) {
    const work = avail.slice();
    let len = work.length;
    const drawN = (count: number): number[] => {
      const out: number[] = [];
      for (let k = 0; k < count; k++) {
        const j = (Math.random() * len) | 0;
        len--;
        const t = work[j];
        work[j] = work[len];
        work[len] = t;
        out.push(t);
      }
      return out;
    };
    const oppCards = drawN(n * 2);
    const runout = drawN(need);
    const heroScore = evaluateInts([...heroBase, ...runout]).score;

    let best = -1;
    const oppScores: number[] = [];
    for (let o = 0; o < n; o++) {
      const os = evaluateInts([oppCards[o * 2], oppCards[o * 2 + 1], ...board, ...runout]).score;
      oppScores.push(os);
      if (os > best) best = os;
    }

    if (heroScore > best) {
      win++;
      equitySum += 1;
    } else if (heroScore < best) {
      lose++;
    } else {
      const tied = oppScores.filter((s) => s === heroScore).length;
      tie++;
      equitySum += 1 / (tied + 1);
    }
  }

  const samples = win + tie + lose;
  return { equity: equitySum / samples, win, tie, lose, samples };
}

/**
 * Equity of a hero range vs a villain range on a (partial) board.
 * Each trial samples one combo from each range (rejecting card clashes),
 * deals the runout, and compares. Powers the free-form equity calculator.
 */
export function equityRangeVsRange(
  heroRange: IntCombo[],
  board: number[],
  villRange: IntCombo[],
  iters = 3000,
): EquityResult {
  const boardSet = new Set(board);
  const hero = heroRange.filter((c) => !boardSet.has(c[0]) && !boardSet.has(c[1]));
  const vill = villRange.filter((c) => !boardSet.has(c[0]) && !boardSet.has(c[1]));
  if (hero.length === 0 || vill.length === 0) {
    return { equity: 0.5, win: 0, tie: 0, lose: 0, samples: 0 };
  }
  const need = 5 - board.length;
  let win = 0;
  let tie = 0;
  let lose = 0;

  for (let it = 0; it < iters; it++) {
    const h = hero[(Math.random() * hero.length) | 0];
    let v = vill[(Math.random() * vill.length) | 0];
    let tries = 0;
    while (
      (h[0] === v[0] || h[0] === v[1] || h[1] === v[0] || h[1] === v[1]) &&
      tries < 8
    ) {
      v = vill[(Math.random() * vill.length) | 0];
      tries++;
    }
    if (h[0] === v[0] || h[0] === v[1] || h[1] === v[0] || h[1] === v[1]) continue;

    const used = new Set<number>([...board, h[0], h[1], v[0], v[1]]);
    const avail: number[] = [];
    for (let i = 0; i < 52; i++) if (!used.has(i)) avail.push(i);

    let len = avail.length;
    const draw: number[] = [];
    for (let k = 0; k < need; k++) {
      const j = (Math.random() * len) | 0;
      len--;
      const t = avail[j];
      avail[j] = avail[len];
      avail[len] = t;
      draw.push(t);
    }

    const hs = evaluateInts([h[0], h[1], ...board, ...draw]).score;
    const vs = evaluateInts([v[0], v[1], ...board, ...draw]).score;
    if (hs > vs) win++;
    else if (hs < vs) lose++;
    else tie++;
  }

  const samples = win + tie + lose;
  return { equity: samples ? (win + tie / 2) / samples : 0.5, win, tie, lose, samples };
}

/** Hero equity vs a single uniformly-random opponent hand. */
export function equityVsRandom(hero: IntCombo, board: number[], iters = 1200): EquityResult {
  const used = new Set<number>([hero[0], hero[1], ...board]);
  const avail: number[] = [];
  for (let i = 0; i < 52; i++) if (!used.has(i)) avail.push(i);

  const need = 5 - board.length;
  let win = 0;
  let tie = 0;
  let lose = 0;
  const heroBase = [hero[0], hero[1], ...board];

  for (let it = 0; it < iters; it++) {
    const work = avail.slice();
    let len = work.length;
    const drawDistinct = (count: number): number[] => {
      const out: number[] = [];
      for (let k = 0; k < count; k++) {
        const j = (Math.random() * len) | 0;
        len--;
        const t = work[j];
        work[j] = work[len];
        work[len] = t;
        out.push(t);
      }
      return out;
    };
    const villain = drawDistinct(2);
    const runout = drawDistinct(need);
    const heroScore = evaluateInts([...heroBase, ...runout]).score;
    const villScore = evaluateInts([...villain, ...board, ...runout]).score;
    if (heroScore > villScore) win++;
    else if (heroScore < villScore) lose++;
    else tie++;
  }
  const samples = win + tie + lose;
  return { equity: (win + tie / 2) / samples, win, tie, lose, samples };
}
