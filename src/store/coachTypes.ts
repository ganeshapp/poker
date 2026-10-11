/** The shape of a coach note. Split out so `src/game/coach.ts` can build
    one without importing the store. */
import type { Archetype, Card, HandLabel } from "../types/poker.ts";

export type Verdict = "mistake" | "thin" | "ok" | "great" | "info";

export interface CoachReview {
  id: number;
  kind: "decision" | "bot";
  blocking: boolean;
  verdict: Verdict;
  title: string;
  equity?: number;
  potOdds?: number;
  evChips?: number;
  villainName?: string;
  villainArchetype?: Archetype;
  villainRange?: HandLabel[];
  board: Card[];
  /** Layer 1 (TONE.md): plain English, no jargon, chances as counts. */
  plain?: string;
  /** Layer 2 summary line (may use poker terms). */
  text: string;
  /** Layer 2: the step-by-step derivation. */
  steps?: string[];
  /** Layer 3: ranges, precision, formulas, methodology. */
  expert?: string[];
  opponents?: number;
  multiway?: boolean;
}
