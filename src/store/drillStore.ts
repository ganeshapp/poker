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
import { useReview } from "./reviewStore";
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

function genFor(
  mode: DrillMode,
  focusKind: PuzzleKind | null = null,
): { puzzle: Puzzle | null; leakId: string | null; reviewId?: string | null } {
  if (mode === "pushfold") return { puzzle: generatePushFold(), leakId: null };
  if (mode === "leaks") {
    // The Review queue: due coach-flagged leaks + due missed drills.
    const now = Date.now();
    const dueLeaks = useLeaks.getState().dueSpots(now);
    const dueCards = useReview.getState().dueCards(now);
    const total = dueLeaks.length + dueCards.length;
    if (!total) return { puzzle: null, leakId: null, reviewId: null };
    const pick = (Math.random() * total) | 0;
    if (pick < dueLeaks.length) {
      const s = dueLeaks[pick];
      return { puzzle: puzzleFromLeak(s), leakId: s.id, reviewId: null };
    }
    const c = dueCards[pick - dueLeaks.length];
    return { puzzle: c.puzzle, leakId: null, reviewId: c.id };
  }
  if (focusKind) {
    // "Drill similar": keep dealing until the same spot family shows up.
    for (let i = 0; i < 60; i++) {
      const p = generatePuzzle();
      if (p.kind === focusKind) return { puzzle: p, leakId: null };
    }
    return { puzzle: generatePuzzle(), leakId: null };
  }
  return { puzzle: adaptivePuzzle(ratingFor()), leakId: null };
}

function ratingFor(): number {
  try {
    return useDrills.getState().rating;
  } catch {
    return 1000;
  }
}

/** Adaptive difficulty: serve spots near the edge of the user's
    rating — strong players mostly see close (difficulty-3) spots,
    beginners mostly clear ones. */
function adaptivePuzzle(rating: number): Puzzle {
  const target = rating < 1050 ? (Math.random() < 0.7 ? 1 : 2) : rating < 1250 ? (Math.random() < 0.55 ? 2 : Math.random() < 0.5 ? 1 : 3) : Math.random() < 0.6 ? 3 : 2;
  for (let i = 0; i < 25; i++) {
    const p = generatePuzzle();
    if (p.difficulty === target) return p;
  }
  return generatePuzzle();
}

interface DrillState extends Persisted {
  mode: DrillMode;
  puzzle: Puzzle;
  currentLeakId: string | null;
  currentReviewId: string | null;
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
    currentReviewId: null,
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

      // Review mode: apply spaced-repetition scheduling; a card only
      // retires after repeated spaced successes. Rating untouched.
      if (s.mode === "leaks") {
        if (s.currentLeakId) useLeaks.getState().review(s.currentLeakId, res.correct);
        if (s.currentReviewId) useReview.getState().review(s.currentReviewId, res.correct);
        set({ answered: a, result: res, ratingDelta: 0, navIndex: s.puzzle.frames.length - 1 });
        return;
      }

      // Missed practice drills join the review queue.
      if (!res.correct && s.puzzle.kind !== "leak") useReview.getState().addMiss(s.puzzle);

      // Real Elo: expected score vs the puzzle's implied rating, so the
      // number converges to skill instead of counting volume.
      const puzzleRating = 800 + s.puzzle.difficulty * 200;
      const expected = 1 / (1 + 10 ** ((puzzleRating - s.rating) / 400));
      const delta = Math.round(24 * ((res.correct ? 1 : 0) - expected));
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
      const { puzzle, leakId, reviewId } = genFor(st.mode, focus);
      if (!puzzle) {
        set({ answered: null, result: null, ratingDelta: 0, currentLeakId: null, currentReviewId: null });
        return;
      }
      const focusLeft = focus ? st.focusLeft - 1 : 0;
      set({
        puzzle,
        currentLeakId: leakId,
        currentReviewId: reviewId ?? null,
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
      const { puzzle, leakId, reviewId } = genFor(m);
      if (!puzzle) {
        set({ answered: null, result: null, currentLeakId: null, currentReviewId: null });
        return;
      }
      set({
        puzzle,
        currentLeakId: leakId,
        currentReviewId: reviewId ?? null,
        navIndex: puzzle.frames.length - 1,
        answered: null,
        result: null,
        ratingDelta: 0,
      });
    },

    setNav: (i) => set((s) => ({ navIndex: Math.max(0, Math.min(s.puzzle.frames.length - 1, i)) })),
  };
});
