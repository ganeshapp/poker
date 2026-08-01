import { invoke } from "@tauri-apps/api/core";
import type { Card, EvaluatedHand, HandLabel } from "../types/poker.ts";
import { evaluateCards } from "./evaluator.ts";
import {
  equityVsRange as tsEquityVsRange,
  equityVsRandom as tsEquityVsRandom,
  equityVsField as tsEquityVsField,
  equityRangeVsRange as tsEquityRangeVsRange,
  comboToInts,
  type EquityResult,
} from "./equity.ts";
import type { EquityJob, EquityRequest, EquityResponse } from "./equityWorker.ts";
import { labelToCombos } from "./notation.ts";
import { cardToInt } from "./cards.ts";

/* ------------------------------------------------------------------
   Engine client — single boundary between the UI and the poker math.

   • Under Tauri     -> calls the Rust backend (fast, the production path).
   • In a browser    -> runs the TypeScript mirror in a Web Worker so
                        sims never block the UI thread.
   • Last resort     -> synchronous TypeScript (no Worker support,
                        e.g. Node test harnesses importing this module).
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

export type EngineBackend = "rust" | "worker" | "ts";

let loggedBackend = false;
function noteBackend(backend: EngineBackend) {
  if (loggedBackend) return;
  loggedBackend = true;
  console.info(`[engine] equity backend: ${backend}`);
}

/* ---- Worker dispatch (non-native fallback) ---- */

let worker: Worker | null = null;
let workerFailed = false;
let jobSeq = 1;
const pending = new Map<number, (r: EquityResult) => void>();

function getWorker(): Worker | null {
  if (workerFailed) return null;
  if (worker) return worker;
  if (typeof window === "undefined" || typeof Worker === "undefined") {
    workerFailed = true;
    return null;
  }
  try {
    worker = new Worker(new URL("./equityWorker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<EquityResponse>) => {
      const resolve = pending.get(e.data.id);
      if (resolve) {
        pending.delete(e.data.id);
        resolve(e.data.result);
      }
    };
    worker.onerror = () => {
      // Fail over to sync TS for all outstanding and future jobs.
      workerFailed = true;
      const w = worker;
      worker = null;
      w?.terminate();
      pending.clear();
    };
    return worker;
  } catch {
    workerFailed = true;
    return null;
  }
}

function runInWorker(job: EquityJob): Promise<EquityResult> | null {
  const w = getWorker();
  if (!w) return null;
  return new Promise((resolve, reject) => {
    const id = jobSeq++;
    pending.set(id, resolve);
    try {
      const req: EquityRequest = { id, job };
      w.postMessage(req);
    } catch (err) {
      pending.delete(id);
      reject(err);
    }
  });
}

async function fallback(job: EquityJob): Promise<EquityResult> {
  const viaWorker = runInWorker(job);
  if (viaWorker) {
    noteBackend("worker");
    try {
      return await viaWorker;
    } catch {
      /* fall through to sync */
    }
  }
  noteBackend("ts");
  switch (job.kind) {
    case "range":
      return tsEquityVsRange(job.hero, job.board, job.range, job.iters);
    case "random":
      return tsEquityVsRandom(job.hero, job.board, job.iters);
    case "field":
      return tsEquityVsField(job.hero, job.board, job.opponents, job.iters);
    case "rangeVsRange":
      return tsEquityRangeVsRange(job.heroRange, job.board, job.villRange, job.iters);
  }
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
        const r = await invoke<EquityResult>("equity_vs_range", { hero, board, range, iters });
        noteBackend("rust");
        return r;
      } catch {
        /* fall through */
      }
    }
    return fallback({
      kind: "range",
      hero: comboToInts(hero),
      board: board.map(cardToInt),
      range: expandRange(range, hero, board),
      iters,
    });
  },

  async equityVsRandom(hero: [Card, Card], board: Card[], iters = 1200): Promise<EquityResult> {
    if (isNative()) {
      try {
        const r = await invoke<EquityResult>("equity_vs_random", { hero, board, iters });
        noteBackend("rust");
        return r;
      } catch {
        /* fall through */
      }
    }
    return fallback({ kind: "random", hero: comboToInts(hero), board: board.map(cardToInt), iters });
  },

  async equityVsField(
    hero: [Card, Card],
    board: Card[],
    numOpponents: number,
    iters = 1500,
  ): Promise<EquityResult> {
    if (isNative()) {
      try {
        const r = await invoke<EquityResult>("equity_vs_field", { hero, board, opponents: numOpponents, iters });
        noteBackend("rust");
        return r;
      } catch {
        /* fall through */
      }
    }
    return fallback({
      kind: "field",
      hero: comboToInts(hero),
      board: board.map(cardToInt),
      opponents: numOpponents,
      iters,
    });
  },

  /**
   * Range-vs-range equity for the free-form calculator. No native
   * command exists for this yet, so it always runs in the worker
   * (or sync TS as a last resort) — still off the main thread.
   */
  async equityRangeVsRange(
    heroCombos: [number, number][],
    boardInts: number[],
    villCombos: [number, number][],
    iters = 5000,
  ): Promise<EquityResult> {
    return fallback({
      kind: "rangeVsRange",
      heroRange: heroCombos,
      board: boardInts,
      villRange: villCombos,
      iters,
    });
  },
};
