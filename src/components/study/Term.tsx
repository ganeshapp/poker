import type { ReactNode } from "react";
import { Tooltip } from "@/components/ui/Tooltip";

/** Central glossary — single source of truth for hover-definitions and the cheat sheet. */
export const GLOSSARY: Record<string, { term: string; def: string }> = {
  UTG: { term: "UTG", def: "Under the Gun — the first seat to act pre-flop, just left of the big blind. The tightest position." },
  MP: { term: "MP", def: "Middle Position — a seat between the early players and the cutoff." },
  CO: { term: "CO", def: "Cutoff — the seat to the right of the button; a strong late position." },
  BTN: { term: "BTN", def: "Button — the dealer seat. Acts last on every post-flop street; the best position." },
  SB: { term: "SB", def: "Small Blind — posts the smaller forced bet and acts first after the flop." },
  BB: { term: "BB", def: "Big Blind — posts the larger forced bet; last to act pre-flop. Also the unit we measure stacks and win-rate in." },
  HUD: { term: "HUD", def: "Heads-Up Display — a small stats overlay on each opponent (here, their VPIP/PFR) that you read while playing." },
  VPIP: { term: "VPIP", def: "Voluntarily Put $ In Pot — how often a player chooses to play a hand pre-flop (call or raise)." },
  PFR: { term: "PFR", def: "Pre-Flop Raise — how often a player raises pre-flop. Always ≤ VPIP." },
  overcard: { term: "overcard", def: "A card higher in rank than your opponent's pair. AK vs 88 = two overcards (both beat the 8); A8 vs 99 = one overcard (only the ace beats the 9)." },
  set: { term: "set", def: "Three of a kind made when your pocket pair matches a board card (you hold 99, a 9 flops). Very strong and well disguised." },
  kicker: { term: "kicker", def: "A side card that breaks ties within the same category. A-K beats A-Q on an ace because the king outkicks the queen." },
  equity: { term: "equity", def: "Your share of the pot — how often your hand wins if all remaining cards were dealt out." },
  potOdds: { term: "pot odds", def: "The price you're laid to call: your call ÷ the final pot. Compare it to your equity." },
  EV: { term: "EV", def: "Expected Value — the average chips a decision wins or loses over the long run." },
  SPR: { term: "SPR", def: "Stack-to-Pot Ratio — effective stack ÷ pot on the flop; tells you how committed you are." },
  polarized: { term: "polarized", def: "A range of very strong hands and bluffs with little in between — usually bet large." },
  cbet: { term: "c-bet", def: "Continuation bet — a follow-up bet on the flop by whoever raised pre-flop." },
  range: { term: "range", def: "All the hands a player could have right now — not one specific holding." },
  combo: { term: "combo", def: "One specific two-card holding. 1,326 exist; AKs has 4 combos, AKo has 12, a pair has 6." },
  blocker: { term: "blocker", def: "A card in your hand that removes combos from the opponent's range (you hold a card they'd need)." },
  outs: { term: "outs", def: "Cards still to come that improve you to a likely winner." },
  threeBet: { term: "3-bet", def: "A re-raise of the first pre-flop raise." },
  draw: { term: "draw", def: "An unmade hand that can improve — e.g. four to a flush or a straight." },
  nuts: { term: "the nuts", def: "The best possible hand on a given board." },
};

interface TermProps {
  id: keyof typeof GLOSSARY | string;
  children?: ReactNode;
}

export function Term({ id, children }: TermProps) {
  const g = GLOSSARY[id];
  if (!g) return <>{children ?? id}</>;
  return (
    <Tooltip
      content={
        <div className="space-y-0.5">
          <div className="font-semibold text-gold-light">{g.term}</div>
          <div>{g.def}</div>
        </div>
      }
    >
      <span className="cursor-help underline decoration-dotted decoration-gold/60 underline-offset-2">
        {children ?? g.term}
      </span>
    </Tooltip>
  );
}
