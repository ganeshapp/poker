import { create } from "zustand";
import {
  loadStats,
  persistHand,
  persistGuess,
  persistDecision,
  resetStats,
  type GuessRecord,
  type HandRecord,
} from "@/db/stats";
import type { DecisionRecord } from "@/lib/leaks";

interface StatsState {
  handsPlayed: number;
  netChips: number;
  bigBlind: number;
  history: HandRecord[];
  guesses: GuessRecord[];
  decisions: DecisionRecord[];
  /** Lifetime bb won BEFORE the loaded history window starts — the
      cumulative chart's starting point, so it always reconciles with
      the Net KPI even when older hands aren't loaded. */
  chartBase: number;
  loaded: boolean;
  init: () => Promise<void>;
  recordHand: (rec: HandRecord, netChipsDelta: number) => void;
  recordGuess: (rec: GuessRecord) => void;
  recordDecision: (rec: DecisionRecord) => void;
  clear: () => Promise<void>;
}

export const useStats = create<StatsState>((set, get) => ({
  handsPlayed: 0,
  netChips: 0,
  bigBlind: 20,
  history: [],
  guesses: [],
  decisions: [],
  chartBase: 0,
  loaded: false,

  init: async () => {
    if (get().loaded) return;
    const s = await loadStats();
    const historyBb = s.history.reduce((a, h) => a + h.netBb, 0);
    set({ ...s, chartBase: s.netChips / s.bigBlind - historyBb, loaded: true });
  },

  recordHand: (rec, delta) => {
    set((st) => {
      const next = [...st.history, rec];
      // If the in-memory window slides, roll the dropped hands into the
      // chart baseline so the cumulative line still ends at Net.
      const dropped = next.length > 800 ? next.slice(0, next.length - 800) : [];
      return {
        handsPlayed: st.handsPlayed + 1,
        netChips: st.netChips + Math.round(delta),
        history: next.slice(-800),
        chartBase: st.chartBase + dropped.reduce((a, h) => a + h.netBb, 0),
      };
    });
    void persistHand(rec, delta);
  },

  recordGuess: (rec) => {
    set((st) => ({ guesses: [...st.guesses, rec].slice(-800) }));
    void persistGuess(rec);
  },

  recordDecision: (rec) => {
    set((st) => ({ decisions: [...st.decisions, rec].slice(-800) }));
    void persistDecision(rec);
  },

  clear: async () => {
    await resetStats();
    set({ handsPlayed: 0, netChips: 0, history: [], guesses: [], decisions: [], chartBase: 0 });
  },
}));
