import { create } from "zustand";

export type Tab = "play" | "drills" | "study" | "stats" | "about";

/** App-level navigation, so any surface can deep-link (e.g. drill
    feedback -> the Study lesson that teaches the concept). */
interface NavState {
  tab: Tab;
  /** One-shot request to open a specific lesson; StudyView consumes it. */
  lessonId: string | null;
  go: (tab: Tab, lessonId?: string) => void;
  consumeLesson: () => void;
}

export const useNav = create<NavState>((set) => ({
  tab: "play",
  lessonId: null,
  go: (tab, lessonId) => set({ tab, lessonId: lessonId ?? null }),
  consumeLesson: () => set({ lessonId: null }),
}));
