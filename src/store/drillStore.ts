import { create } from "zustand";
import { generatePuzzle, gradePuzzle, type DrillAction, type GradeResult, type Puzzle } from "@/engine/puzzles";

const KEY = "allin.drills.v1";

interface Persisted {
  rating: number;
  solved: number;
  correct: number;
  streak: number;
  best: number;
}

function load(): Persisted {
  try {
    const r = JSON.parse(localStorage.getItem(KEY) || "null");
    if (r && typeof r.rating === "number") return r;
  } catch {
    /* ignore */
  }
  return { rating: 1000, solved: 0, correct: 0, streak: 0, best: 0 };
}

function save(p: Persisted) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

interface DrillState extends Persisted {
  puzzle: Puzzle;
  navIndex: number;
  answered: DrillAction | null;
  result: GradeResult | null;
  ratingDelta: number;
  answer: (a: DrillAction) => void;
  next: () => void;
  setNav: (i: number) => void;
}

export const useDrills = create<DrillState>((set, get) => {
  const init = load();
  const first = generatePuzzle();
  return {
    ...init,
    puzzle: first,
    navIndex: first.frames.length - 1,
    answered: null,
    result: null,
    ratingDelta: 0,

    answer: (a) => {
      const s = get();
      if (s.answered) return;
      const res = gradePuzzle(s.puzzle, a);
      const d = s.puzzle.difficulty;
      const delta = res.correct ? 8 + d * 4 : -(6 + d * 2);
      const rating = Math.max(100, Math.round(s.rating + delta));
      const streak = res.correct ? s.streak + 1 : 0;
      const best = Math.max(s.best, streak);
      const solved = s.solved + 1;
      const correct = s.correct + (res.correct ? 1 : 0);
      save({ rating, solved, correct, streak, best });
      set({
        answered: a,
        result: res,
        ratingDelta: delta,
        rating,
        streak,
        best,
        solved,
        correct,
        navIndex: s.puzzle.frames.length - 1,
      });
    },

    next: () => {
      const p = generatePuzzle();
      set({ puzzle: p, navIndex: p.frames.length - 1, answered: null, result: null, ratingDelta: 0 });
    },

    setNav: (i) => set((s) => ({ navIndex: Math.max(0, Math.min(s.puzzle.frames.length - 1, i)) })),
  };
});
