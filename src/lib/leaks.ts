/* Pure leak-detection over recorded coach decisions (no deps → unit-testable). */

export interface DecisionRecord {
  verdict: "mistake" | "thin" | "ok" | "great" | "info";
  action: "fold" | "check" | "call" | "bet" | "raise" | "post";
  equity: number; // 0..1
  potOdds: number; // 0..1
  evBb: number;
  street: string;
  villainArchetype: string | null;
  ts: number;
}

export interface LeakReport {
  total: number;
  mistakes: number;
  thin: number;
  great: number;
  foldMistakes: number;
  callMistakes: number;
  leaks: string[];
}

export function leaksFromDecisions(decisions: DecisionRecord[]): LeakReport {
  const dec = decisions.filter((d) => d.verdict !== "info");
  const mistakes = dec.filter((d) => d.verdict === "mistake");
  const thin = dec.filter((d) => d.verdict === "thin").length;
  const great = dec.filter((d) => d.verdict === "great").length;
  const foldMistakes = mistakes.filter((d) => d.action === "fold").length;
  const callMistakes = mistakes.filter((d) => d.action === "call").length;

  const leaks: string[] = [];
  const n = dec.length;
  if (n >= 8) {
    if (foldMistakes >= 3 && foldMistakes / n > 0.12) {
      leaks.push("You fold too often when you're getting the right price — look for more +EV calls.");
    }
    if (callMistakes >= 3 && callMistakes / n > 0.12) {
      leaks.push("You call too wide for the pot odds — fold your weakest hands more.");
    }
    if (mistakes.length === 0) {
      leaks.push("No clear −EV mistakes flagged — solid discipline. Keep refining the thin spots.");
    }
  }

  return {
    total: n,
    mistakes: mistakes.length,
    thin,
    great,
    foldMistakes,
    callMistakes,
    leaks,
  };
}
