import { create } from "zustand";

const KEY = "allin.study.v1";

function load(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

function save(ids: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}

export interface QuizStat {
  correct: number;
  wrong: number;
  lastCorrect: boolean;
  ts: number;
}

const QUIZ_KEY = "allin.quiz.v1";

function loadQuiz(): Record<string, QuizStat> {
  try {
    return JSON.parse(localStorage.getItem(QUIZ_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveQuiz(r: Record<string, QuizStat>) {
  try {
    localStorage.setItem(QUIZ_KEY, JSON.stringify(r));
  } catch {
    /* ignore */
  }
}

interface StudyState {
  completed: string[];
  /** Per-question results, keyed by a hash of the question text —
      survives restarts and lets quizzes resurface misses first. */
  quizResults: Record<string, QuizStat>;
  complete: (id: string) => void;
  toggle: (id: string) => void;
  recordQuiz: (qKey: string, correct: boolean) => void;
}

export const useStudy = create<StudyState>((set) => ({
  completed: load(),
  quizResults: loadQuiz(),
  recordQuiz: (qKey, correct) =>
    set((s) => {
      const prev = s.quizResults[qKey] ?? { correct: 0, wrong: 0, lastCorrect: false, ts: 0 };
      const next = {
        ...s.quizResults,
        [qKey]: {
          correct: prev.correct + (correct ? 1 : 0),
          wrong: prev.wrong + (correct ? 0 : 1),
          lastCorrect: correct,
          ts: Date.now(),
        },
      };
      saveQuiz(next);
      return { quizResults: next };
    }),
  complete: (id) =>
    set((s) => {
      if (s.completed.includes(id)) return s;
      const next = [...s.completed, id];
      save(next);
      return { completed: next };
    }),
  toggle: (id) =>
    set((s) => {
      const next = s.completed.includes(id) ? s.completed.filter((x) => x !== id) : [...s.completed, id];
      save(next);
      return { completed: next };
    }),
}));
