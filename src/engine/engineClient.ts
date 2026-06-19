import { invoke } from "@tauri-apps/api/core";
import type { Card, EvaluatedHand, HandLabel } from "../types/poker.ts";
import { evaluateCards } from "./evaluator.ts";
import {
  equityVsRange as tsEquityVsRange,
  equityVsRandom as tsEquityVsRandom,
  equityVsField as tsEquityVsField,
  comboToInts,
  type EquityResult,
} from "./equity.ts";
import { labelToCombos } from "./notation.ts";
import { cardToInt } from "./cards.ts";

/* ------------------------------------------------------------------
   Engine client — single boundary between the UI and the poker math.

   • Under Tauri  -> calls the Rust backend (fast, the production path).
   • In a browser -> uses the TypeScript mirror so the app still runs
                     with `npm run dev` (handy for UI iteration).
   ------------------------------------------------------------------ */

let _native: boolean | null = null;
export function isNative(): boolean {
  if (_native === null) {
    _native =
      typeof window !== "undefined" &&
      ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);
  }
  return _native;
}

export type { EquityResult };

function expandRange(range: HandLabel[], hero: [Card, Card], board: Card[]) {
  const blocked = new Set<Card>([hero[0], hero[1], ...board]);
  const combos: [number, number][] = [];
  for (const label of range) {
    for (const [a, b] of labelToCombos(label)) {
      if (blocked.has(a) || blocked.has(b)) continue;
      combos.push(comboToInts([a, b]));
    }
  }
  return combos;
}

export const engine = {
  async evaluate(cards: Card[]): Promise<EvaluatedHand> {
    if (isNative()) {
      try {
        return await invoke<EvaluatedHand>("evaluate_hand", { cards });
      } catch {
        return evaluateCards(cards);
      }
    }
    return evaluateCards(cards);
  },

  async equityVsRange(
    hero: [Card, Card],
    board: Card[],
    range: HandLabel[],
    iters = 1500,
  ): Promise<EquityResult> {
    if (isNative()) {
      try {
        return await invoke<EquityResult>("equity_vs_range", { hero, board, range, iters });
      } catch {
        /* fall through to TS */
      }
    }
    const combos = expandRange(range, hero, board);
    return tsEquityVsRange(comboToInts(hero), board.map(cardToInt), combos, iters);
  },

  async equityVsRandom(hero: [Card, Card], board: Card[], iters = 1200): Promise<EquityResult> {
    if (isNative()) {
      try {
        return await invoke<EquityResult>("equity_vs_random", { hero, board, iters });
      } catch {
        /* fall through */
      }
    }
    return tsEquityVsRandom(comboToInts(hero), board.map(cardToInt), iters);
  },

  async equityVsField(
    hero: [Card, Card],
    board: Card[],
    numOpponents: number,
    iters = 1500,
  ): Promise<EquityResult> {
    if (isNative()) {
      try {
        return await invoke<EquityResult>("equity_vs_field", { hero, board, opponents: numOpponents, iters });
      } catch {
        /* fall through */
      }
    }
    return tsEquityVsField(comboToInts(hero), board.map(cardToInt), numOpponents, iters);
  },
};
