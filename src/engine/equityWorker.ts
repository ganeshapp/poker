import {
  equityVsRange,
  equityVsRandom,
  equityVsField,
  equityRangeVsRange,
  type EquityResult,
} from "./equity.ts";

/* ------------------------------------------------------------------
   Equity Web Worker — runs the TypeScript Monte-Carlo fallback off
   the main thread so the web build (and any non-native path) never
   freezes the UI during a sim. The native Rust path in engineClient
   bypasses this entirely.
   ------------------------------------------------------------------ */

export type EquityJob =
  | { kind: "range"; hero: [number, number]; board: number[]; range: [number, number][]; iters: number; seed?: number }
  | { kind: "random"; hero: [number, number]; board: number[]; iters: number; seed?: number }
  | { kind: "field"; hero: [number, number]; board: number[]; opponents: number; iters: number; seed?: number }
  | { kind: "rangeVsRange"; heroRange: [number, number][]; board: number[]; villRange: [number, number][]; iters: number; seed?: number };

export interface EquityRequest {
  id: number;
  job: EquityJob;
}

export interface EquityResponse {
  id: number;
  result: EquityResult;
}

function runJob(job: EquityJob): EquityResult {
  switch (job.kind) {
    case "range":
      return equityVsRange(job.hero, job.board, job.range, job.iters, job.seed);
    case "random":
      return equityVsRandom(job.hero, job.board, job.iters, job.seed);
    case "field":
      return equityVsField(job.hero, job.board, job.opponents, job.iters, job.seed);
    case "rangeVsRange":
      return equityRangeVsRange(job.heroRange, job.board, job.villRange, job.iters, job.seed);
  }
}

self.onmessage = (e: MessageEvent<EquityRequest>) => {
  const { id, job } = e.data;
  const response: EquityResponse = { id, result: runJob(job) };
  self.postMessage(response);
};
