import { create } from "zustand";
import type { LeakSpot } from "@/engine/puzzles";

const KEY = "allin.leaks.v1";
const CAP = 60;

function load(): LeakSpot[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "[]");
    if (Array.isArray(v)) return v;
  } catch {
    /* ignore */
  }
  return [];
}

function save(spots: LeakSpot[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(spots));
  } catch {
    /* ignore */
  }
}

interface LeakState {
  spots: LeakSpot[];
  add: (s: LeakSpot) => void;
  resolve: (id: string) => void;
  clear: () => void;
}

export const useLeaks = create<LeakState>((set) => ({
  spots: load(),
  add: (s) =>
    set((st) => {
      const spots = [s, ...st.spots].slice(0, CAP);
      save(spots);
      return { spots };
    }),
  resolve: (id) =>
    set((st) => {
      const spots = st.spots.filter((x) => x.id !== id);
      save(spots);
      return { spots };
    }),
  clear: () => {
    save([]);
    return set({ spots: [] });
  },
}));
