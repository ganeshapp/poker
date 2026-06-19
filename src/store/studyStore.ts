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

interface StudyState {
  completed: string[];
  complete: (id: string) => void;
  toggle: (id: string) => void;
}

export const useStudy = create<StudyState>((set) => ({
  completed: load(),
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
