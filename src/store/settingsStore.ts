import { create } from "zustand";

/* App-wide user preferences, persisted locally. */

const KEY = "allin.settings.v1";

export type CoachStrictness = "relaxed" | "standard" | "strict";
export type SimQuality = "standard" | "high";

export interface AppSettings {
  /** Four-color deck: ♠ black · ♥ red · ♦ blue · ♣ green (accessibility). */
  fourColorDeck: boolean;
  /** Disable animations/transitions (also honors prefers-reduced-motion). */
  reducedMotion: boolean;
  /** How eagerly the coach calls something a mistake. */
  coachStrictness: CoachStrictness;
  /** Monte-Carlo effort for coach verdicts. */
  simQuality: SimQuality;
  /** Realistic mode: hide folded players' cards at hand end (the
      learning reveal is the default — see the Peek redesign). */
  realisticReveal: boolean;
}

const DEFAULTS: AppSettings = {
  fourColorDeck: false,
  reducedMotion: false,
  coachStrictness: "standard",
  simQuality: "standard",
  realisticReveal: false,
};

function load(): AppSettings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {
    return { ...DEFAULTS };
  }
}

interface SettingsState extends AppSettings {
  update: (p: Partial<AppSettings>) => void;
}

export const useSettings = create<SettingsState>((set, get) => ({
  ...load(),
  update: (p) => {
    set(p);
    try {
      const { update: _u, ...rest } = get();
      localStorage.setItem(KEY, JSON.stringify(rest));
    } catch {
      /* ignore */
    }
  },
}));

/** Coach thresholds by strictness (bb): [blockingMistakeEv, foldFlagEv]. */
export function coachThresholds(s: CoachStrictness): { mistakeBb: number; foldFlagBb: number } {
  if (s === "relaxed") return { mistakeBb: -0.6, foldFlagBb: 2.5 };
  if (s === "strict") return { mistakeBb: -0.15, foldFlagBb: 1.0 };
  return { mistakeBb: -0.3, foldFlagBb: 1.5 };
}
