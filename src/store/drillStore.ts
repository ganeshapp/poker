import { create } from "zustand";
import {
  generatePuzzle,
  generatePushFold,
  puzzleFromLeak,
  gradePuzzle,
  type DrillAction,
  type GradeResult,
  type Puzzle,
} from "@/engine/puzzles";
import { useLeaks } from "./leakStore";
import type { PuzzleKind } from "@/engine/puzzles";

export type DrillMode = "mixed" | "pushfold" | "leaks";

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

function genFor(mode: DrillMode, focusKind: PuzzleKind | null = null): { puzzle: Puzzle | null; leakId: string | null } {
  if (mode === "pushfold") return { puzzle: generatePushFold(), leakId: null };
  if (mode === "leaks") {
    const spots = useLeaks.getState().spots;
    if (!spots.length) return { puzzle: null, leakId: null };
    const s = spots[(Math.random() * spots.length) | 0];
    return { puzzle: puzzleFromLeak(s), leakId: s.id };
  }
  if (focusKind) {
    // "Drill similar": keep dealing until the same spot family shows up.
    for (let i = 0; i < 60; i++) {
      const p = generatePuzzle();
      if (p.kind === focusKind) return { puzzle: p, leakId: null };
    }
  }
  return { puzzle: generatePuzzle(), leakId: null };
}

interface DrillState extends Persisted {
  mode: DrillMode;
  puzzle: Puzzle;
  currentLeakId: string | null;
  navIndex: number;
  answered: DrillAction | null;
  result: GradeResult | null;
  ratingDelta: number;
  /** "Drill 5 similar" state: spot family + remaining count. */
  focusKind: PuzzleKind | null;
  focusLeft: number;
  answer: (a: DrillAction) => void;
  next: () => void;
  drillSimilar: () => void;
  setMode: (m: DrillMode) => void;
  setNav: (i: number) => void;
}

export const useDrills = create<DrillState>((set, get) => {
  const init = load();
  const first = generatePuzzle();
  return {
    ...init,
    mode: "mixed",
    puzzle: first,
    currentLeakId: null,
    navIndex: first.frames.length - 1,
    answered: null,
    result: null,
    ratingDelta: 0,
    focusKind: null,
    focusLeft: 0,

    answer: (a) => {
      const s = get();
      if (s.answered) return;
      const res = gradePuzzle(s.puzzle, a);

      // Leak-review mode: don't touch rating; clear the leak when solved.
      if (s.mode === "leaks") {
        if (res.correct && s.currentLeakId) useLeaks.getState().resolve(s.currentLeakId);
        set({ answered: a, result: res, ratingDelta: 0, navIndex: s.puzzle.frames.length - 1 });
        return;
      }

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
      const st = get();
      const focus = st.focusLeft > 0 ? st.focusKind : null;
      const { puzzle, leakId } = genFor(st.mode, focus);
      if (!puzzle) {
        set({ answered: null, result: null, ratingDelta: 0, currentLeakId: null });
        return;
      }
      const focusLeft = focus ? st.focusLeft - 1 : 0;
      set({
        puzzle,
        currentLeakId: leakId,
        navIndex: puzzle.frames.length - 1,
        answered: null,
        result: null,
        ratingDelta: 0,
        focusLeft,
        focusKind: focusLeft > 0 ? st.focusKind : null,
      });
    },

    drillSimilar: () => {
      const st = get();
      if (st.mode === "leaks" || st.puzzle.kind === "leak") return;
      set({ focusKind: st.puzzle.kind, focusLeft: 5 });
      get().next();
    },

    setMode: (m) => {
      set({ mode: m });
      const { puzzle, leakId } = genFor(m);
      if (!puzzle) {
        set({ answered: null, result: null, currentLeakId: null });
        return;
      }
      set({
        puzzle,
        currentLeakId: leakId,
        navIndex: puzzle.frames.length - 1,
        answered: null,
        result: null,
        ratingDelta: 0,
      });
    },

    setNav: (i) => set((s) => ({ navIndex: Math.max(0, Math.min(s.puzzle.frames.length - 1, i)) })),
  };
});
