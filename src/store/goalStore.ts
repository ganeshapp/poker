import { create } from "zustand";

/* Quiet daily-practice tracking: a modest goal, a streak that never
   nags, and the activity history behind the practice heatmap. */

const KEY = "allin.goals.v1";
export const DAILY_DRILL_GOAL = 20;
export const DAILY_HAND_GOAL = 30;

type Activity = Record<string, { drills: number; hands: number }>;

function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function load(): Activity {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}

function save(a: Activity) {
  try {
    localStorage.setItem(KEY, JSON.stringify(a));
  } catch {
    /* ignore */
  }
}

export function metGoal(day: { drills: number; hands: number } | undefined): boolean {
  return !!day && (day.drills >= DAILY_DRILL_GOAL || day.hands >= DAILY_HAND_GOAL);
}

interface GoalState {
  activity: Activity;
  record: (kind: "drill" | "hand") => void;
  today: () => { drills: number; hands: number };
  /** Consecutive days (ending today or yesterday) the goal was met. */
  streak: () => number;
}

export const useGoals = create<GoalState>((set, get) => ({
  activity: load(),

  record: (kind) =>
    set((st) => {
      const k = dayKey(Date.now());
      const day = st.activity[k] ?? { drills: 0, hands: 0 };
      const activity = {
        ...st.activity,
        [k]: { ...day, [kind === "drill" ? "drills" : "hands"]: day[kind === "drill" ? "drills" : "hands"] + 1 },
      };
      save(activity);
      return { activity };
    }),

  today: () => get().activity[dayKey(Date.now())] ?? { drills: 0, hands: 0 },

  streak: () => {
    const a = get().activity;
    let n = 0;
    const day = 86_400_000;
    // A streak survives until a full day is missed; today counts once met.
    let t = Date.now();
    if (!metGoal(a[dayKey(t)])) t -= day; // today not (yet) met — start from yesterday
    while (metGoal(a[dayKey(t)])) {
      n++;
      t -= day;
    }
    return n;
  },
}));
