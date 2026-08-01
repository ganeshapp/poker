import { create } from "zustand";
import type { Puzzle } from "@/engine/puzzles";
import { newSrs, reviewSrs, isDue, isGraduated, type SrsState } from "@/lib/srs";

/* Missed drills, kept as full puzzles on a spaced-repetition schedule
   (coach-flagged leaks live in leakStore with the same scheduling). */

const KEY = "allin.review.v1";
const CAP = 80;

export interface ReviewCard {
  id: string;
  puzzle: Puzzle;
  srs: SrsState;
}

function load(): ReviewCard[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "[]");
    if (Array.isArray(v)) return v;
  } catch {
    /* ignore */
  }
  return [];
}

function save(cards: ReviewCard[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(cards));
  } catch {
    /* ignore quota */
  }
}

interface ReviewState {
  cards: ReviewCard[];
  addMiss: (p: Puzzle) => void;
  review: (id: string, correct: boolean) => void;
  dueCards: (now: number) => ReviewCard[];
  clear: () => void;
}

export const useReview = create<ReviewState>((set, get) => ({
  cards: load(),

  addMiss: (p) =>
    set((st) => {
      // One card per spot identity (hand + board + kind).
      const key = `${p.kind}|${p.handLabel}|${p.board.join("")}|${p.heroPos}`;
      if (st.cards.some((c) => c.id === key)) return st;
      const cards = [{ id: key, puzzle: p, srs: newSrs(Date.now()) }, ...st.cards].slice(0, CAP);
      save(cards);
      return { cards };
    }),

  review: (id, correct) =>
    set((st) => {
      const cards = st.cards
        .map((c) => (c.id === id ? { ...c, srs: reviewSrs(c.srs, correct, Date.now()) } : c))
        .filter((c) => !(c.id === id && correct && isGraduated(c.srs)));
      save(cards);
      return { cards };
    }),

  dueCards: (now) => get().cards.filter((c) => isDue(c.srs, now)),

  clear: () => {
    save([]);
    set({ cards: [] });
  },
}));
