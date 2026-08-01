import { create } from "zustand";
import type { LeakSpot } from "@/engine/puzzles";
import { newSrs, reviewSrs, isDue, isGraduated } from "@/lib/srs";

const KEY = "allin.leaks.v1";
const CAP = 60;

function load(): LeakSpot[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "[]");
    // Spots saved before scheduling existed become due immediately.
    if (Array.isArray(v)) return v.map((s: LeakSpot) => (s.srs ? s : { ...s, srs: newSrs(s.ts ?? Date.now()) }));
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
  /** Apply a spaced-repetition review. A leak only retires after
      RETIRE_REPS correct answers on the spaced ladder — one lucky
      answer no longer deletes it. */
  review: (id: string, correct: boolean) => void;
  dueSpots: (now: number) => LeakSpot[];
  clear: () => void;
}

export const useLeaks = create<LeakState>((set, get) => ({
  spots: load(),
  add: (s) =>
    set((st) => {
      const spots = [{ ...s, srs: s.srs ?? newSrs(Date.now()) }, ...st.spots].slice(0, CAP);
      save(spots);
      return { spots };
    }),
  review: (id, correct) =>
    set((st) => {
      const spots = st.spots
        .map((x) => (x.id === id ? { ...x, srs: reviewSrs(x.srs ?? newSrs(Date.now()), correct, Date.now()) } : x))
        .filter((x) => !(x.id === id && correct && x.srs && isGraduated(x.srs)));
      save(spots);
      return { spots };
    }),
  dueSpots: (now) => get().spots.filter((s) => isDue(s.srs, now)),
  clear: () => {
    save([]);
    return set({ spots: [] });
  },
}));
