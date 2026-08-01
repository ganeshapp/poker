/* Spaced-repetition scheduling (SM-2 family, tuned small).
 *
 * A card graduates only after RETIRE_REPS consecutive correct answers
 * on a SPACED schedule (1d → 3d → ~1w) — answering once right after a
 * miss no longer deletes anything. A miss resets the ladder and brings
 * the card back within minutes.
 */

export interface SrsState {
  due: number; // timestamp ms
  intervalDays: number;
  ease: number; // growth factor, 1.3..3.0
  reps: number; // consecutive correct spaced reviews
  lapses: number;
}

export const RETIRE_REPS = 3;

export function newSrs(now: number): SrsState {
  return { due: now, intervalDays: 0, ease: 2.3, reps: 0, lapses: 0 };
}

export function reviewSrs(s: SrsState, correct: boolean, now: number): SrsState {
  if (!correct) {
    return {
      due: now + 10 * 60_000, // back in ~10 minutes
      intervalDays: 0,
      ease: Math.max(1.3, s.ease - 0.2),
      reps: 0,
      lapses: s.lapses + 1,
    };
  }
  const intervalDays = s.reps === 0 ? 1 : s.reps === 1 ? 3 : Math.max(4, Math.round(s.intervalDays * s.ease));
  return {
    due: now + intervalDays * 86_400_000,
    intervalDays,
    ease: Math.min(3, s.ease + 0.05),
    reps: s.reps + 1,
    lapses: s.lapses,
  };
}

export function isDue(s: SrsState | undefined, now: number): boolean {
  return !s || s.due <= now;
}

/** Graduated = beaten RETIRE_REPS times on the spaced ladder. */
export function isGraduated(s: SrsState): boolean {
  return s.reps >= RETIRE_REPS;
}
