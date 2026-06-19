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
  loaded: false,

  init: async () => {
    if (get().loaded) return;
    const s = await loadStats();
    set({ ...s, loaded: true });
  },

  recordHand: (rec, delta) => {
    set((st) => ({
      handsPlayed: st.handsPlayed + 1,
      netChips: st.netChips + Math.round(delta),
      history: [...st.history, rec].slice(-800),
    }));
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
    set({ handsPlayed: 0, netChips: 0, history: [], guesses: [], decisions: [] });
  },
}));
