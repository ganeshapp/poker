import { create } from "zustand";

export type Theme = "dark" | "light";
const KEY = "allin.theme";

function apply(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("light", theme === "light");
}

function load(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "light" || v === "dark") return v;
  } catch {
    /* ignore */
  }
  return "dark";
}

const initial = load();
apply(initial); // apply before first paint (this module is imported by App)

function persist(theme: Theme) {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* ignore */
  }
}

interface ThemeState {
  theme: Theme;
  toggle: () => void;
  set: (t: Theme) => void;
}

export const useTheme = create<ThemeState>((set) => ({
  theme: initial,
  toggle: () =>
    set((s) => {
      const theme: Theme = s.theme === "dark" ? "light" : "dark";
      apply(theme);
      persist(theme);
      return { theme };
    }),
  set: (theme) => {
    apply(theme);
    persist(theme);
    set({ theme });
  },
}));
