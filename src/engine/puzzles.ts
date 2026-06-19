import type { Card, Position, Street, HandLabel } from "../types/poker.ts";
import { makeDeck, shuffle, cardToInt } from "./cards.ts";
import { cardsToLabel, labelToCombos } from "./notation.ts";
import { topPercentRange } from "./ranges.ts";
import { equityVsRange, comboToInts } from "./equity.ts";

/* ==================================================================
   GTO Drills — procedural puzzle generator + heuristic grader.

   Preflop answers come from position-based opening/defending charts
   (chart-GTO, authoritative). Postflop answers come from equity vs a
   plausible continuing range compared to pot odds (a fundamentals
   heuristic, not a solver). The UI labels which is which.
   ================================================================== */

export type DrillAction = "fold" | "check" | "call" | "bet" | "raise";
export type PuzzleKind = "rfi" | "vs-raise" | "postflop-bet" | "postflop-check" | "pushfold" | "leak";

export interface DrillOption {
  action: DrillAction;
  label: string;
  amount?: number; // total bet/raise size in bb (for bet/raise)
}

export interface DrillSeatView {
  pos: Position;
  isHero: boolean;
  folded: boolean;
  active: boolean; // still in the hand and not hero
}

export interface DrillFrame {
  text: string;
  street: Street;
  board: Card[];
  pot: number;
}

export interface Puzzle {
  id: number;
  kind: PuzzleKind;
  source: "chart" | "heuristic";
  street: Street;
  heroPos: Position;
  hole: [Card, Card];
  handLabel: HandLabel;
  board: Card[];
  pot: number; // pot hero faces (incl. any bet to call)
  toCall: number;
  bb: number;
  seats: DrillSeatView[];
  frames: DrillFrame[];
  options: DrillOption[];
  best: DrillAction;
  accept: DrillAction[];
  rationale: string;
  equity?: number;
  potOdds?: number;
  difficulty: number; // 1..3
}

const ORDER: Position[] = ["UTG", "MP", "CO", "BTN", "SB", "BB"];
const SB = 0.5;
const BBV = 1;

export const RFI_PCT: Record<Position, number> = { UTG: 16, MP: 20, CO: 27, BTN: 45, SB: 42, BB: 100 };
export const THREEBET_PCT: Record<Position, number> = { UTG: 6, MP: 7, CO: 8, BTN: 10, SB: 9, BB: 11 };
export const DEFEND_PCT: Record<Position, number> = { UTG: 12, MP: 15, CO: 20, BTN: 32, SB: 22, BB: 52 };

let SEQ = 1;
const rint = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));
const r1 = (x: number) => Math.round(x * 10) / 10;

function fullSeats(heroPos: Position, foldedPos: Position[], activePos: Position[]): DrillSeatView[] {
  return ORDER.map((pos) => ({
    pos,
    isHero: pos === heroPos,
    folded: foldedPos.includes(pos),
    active: activePos.includes(pos) && pos !== heroPos,
  }));
}

/** Expand a set of grid labels into int combos, removing blocked cards. */
function rangeToCombos(labels: Iterable<HandLabel>, blocked: Set<Card>): [number, number][] {
  const out: [number, number][] = [];
  for (const lab of labels) {
    for (const [a, b] of labelToCombos(lab)) {
      if (blocked.has(a) || blocked.has(b)) continue;
      out.push(comboToInts([a, b]));
    }
  }
  return out;
}

/* ----------------------------- Preflop ----------------------------- */

function genRfi(): Puzzle {
  const deck = shuffle(makeDeck());
  const hole: [Card, Card] = [deck[0], deck[1]];
  const label = cardsToLabel(hole[0], hole[1]);
  // hero in any non-BB seat, folded to them
  const heroIdx = rint(0, 4); // UTG..SB
  const heroPos = ORDER[heroIdx];
  const foldedBefore = ORDER.slice(0, heroIdx).filter((p) => p !== "SB" && p !== "BB");
  // SB/BB before hero still post blinds (not "folded") — only non-blind earlier seats fold
  const heroIsSB = heroPos === "SB";
  const toCall = heroIsSB ? BBV - SB : BBV;
  const pot = SB + BBV;

  const seats = fullSeats(
    heroPos,
    foldedBefore,
    ORDER.filter((p) => (p === "SB" || p === "BB") && p !== heroPos),
  );

  const frames: DrillFrame[] = [{ text: `Blinds posted (${SB}/${BBV} bb).`, street: "preflop", board: [], pot }];
  for (const p of foldedBefore) frames.push({ text: `${p} folds.`, street: "preflop", board: [], pot });
  frames.push({ text: `Folded to you in the ${heroPos}. Action on you.`, street: "preflop", board: [], pot });

  const inRange = topPercentRange(RFI_PCT[heroPos]).has(label);
  const best: DrillAction = inRange ? "raise" : "fold";
  const openTo = r1(2.5 * BBV);

  return {
    id: SEQ++,
    kind: "rfi",
    source: "chart",
    street: "preflop",
    heroPos,
    hole,
    handLabel: label,
    board: [],
    pot,
    toCall,
    bb: BBV,
    seats,
    frames,
    options: [
      { action: "fold", label: "Fold" },
      { action: "call", label: `Limp ${r1(toCall)}`, amount: toCall },
      { action: "raise", label: `Open ${openTo}`, amount: openTo },
    ],
    best,
    accept: [best],
    rationale: inRange
      ? `${heroPos} opens about the top ${RFI_PCT[heroPos]}% of hands. ${label} is in that range, so the chart play is to raise (limping isn't part of a GTO opening strategy).`
      : `${heroPos} opens about the top ${RFI_PCT[heroPos]}% of hands. ${label} is below that, so fold — limping/calling here is −EV.`,
    difficulty: 1,
  };
}

function genVsRaise(): Puzzle {
  const deck = shuffle(makeDeck());
  const hole: [Card, Card] = [deck[0], deck[1]];
  const label = cardsToLabel(hole[0], hole[1]);
  const heroIdx = rint(2, 5); // CO..BB
  const heroPos = ORDER[heroIdx];
  const raiserIdx = rint(0, heroIdx - 1);
  const raiserPos = ORDER[raiserIdx];
  const raiseTo = r1(heroPos === "BB" || heroPos === "SB" ? 3 : 2.5);
  const heroBlind = heroPos === "SB" ? SB : heroPos === "BB" ? BBV : 0;
  const toCall = r1(raiseTo - heroBlind);
  const pot = r1(SB + BBV + raiseTo);

  const foldedBefore = ORDER.slice(0, heroIdx).filter((p) => p !== raiserPos && p !== "SB" && p !== "BB");
  const seats = fullSeats(heroPos, foldedBefore, [raiserPos]);

  const frames: DrillFrame[] = [{ text: `Blinds posted (${SB}/${BBV} bb).`, street: "preflop", board: [], pot: SB + BBV }];
  let p = SB + BBV;
  for (const fp of ORDER.slice(0, raiserIdx).filter((x) => x !== "SB" && x !== "BB"))
    frames.push({ text: `${fp} folds.`, street: "preflop", board: [], pot: p });
  p = r1(SB + BBV + raiseTo);
  frames.push({ text: `${raiserPos} raises to ${raiseTo} bb.`, street: "preflop", board: [], pot: p });
  for (const fp of ORDER.slice(raiserIdx + 1, heroIdx).filter((x) => x !== "SB" && x !== "BB"))
    frames.push({ text: `${fp} folds.`, street: "preflop", board: [], pot: p });
  frames.push({ text: `Action on you in the ${heroPos}, facing a raise.`, street: "preflop", board: [], pot: p });

  const in3bet = topPercentRange(THREEBET_PCT[heroPos]).has(label);
  const inDefend = topPercentRange(DEFEND_PCT[heroPos]).has(label);
  let best: DrillAction;
  let rationale: string;
  if (in3bet) {
    best = "raise";
    rationale = `From the ${heroPos} vs a ${raiserPos} open, ${label} is in your 3-bet range (top ~${THREEBET_PCT[heroPos]}%). Re-raise for value/pressure.`;
  } else if (inDefend) {
    best = "call";
    rationale = `${label} is too weak to 3-bet but inside your ${heroPos} defending range (~${DEFEND_PCT[heroPos]}%), so call and see a flop.`;
  } else {
    best = "fold";
    rationale = `${label} is outside the ${heroPos} defending range vs a ${raiserPos} raise — fold.`;
  }
  const threeBetTo = r1(raiseTo * (heroPos === "BB" || heroPos === "SB" ? 3.5 : 3));

  return {
    id: SEQ++,
    kind: "vs-raise",
    source: "chart",
    street: "preflop",
    heroPos,
    hole,
    handLabel: label,
    board: [],
    pot,
    toCall,
    bb: BBV,
    seats,
    frames,
    options: [
      { action: "fold", label: "Fold" },
      { action: "call", label: `Call ${toCall}`, amount: toCall },
      { action: "raise", label: `3-bet ${threeBetTo}`, amount: threeBetTo },
    ],
    best,
    accept: [best],
    rationale,
    difficulty: 2,
  };
}

/* ----------------------------- Postflop ----------------------------- */

const STREET_RANGE_PCT: Record<string, number> = { flop: 45, turn: 38, river: 32 };

function postflopBoard(deck: Card[], street: Street): { board: Card[]; next: number } {
  const n = street === "flop" ? 3 : street === "turn" ? 4 : 5;
  return { board: deck.slice(2, 2 + n), next: 2 + n };
}

function genPostflopBet(): Puzzle {
  const deck = shuffle(makeDeck());
  const hole: [Card, Card] = [deck[0], deck[1]];
  const label = cardsToLabel(hole[0], hole[1]);
  const street = (["flop", "turn", "river"] as Street[])[rint(0, 2)];
  const { board } = postflopBoard(deck, street);

  const heroPos: Position = Math.random() < 0.5 ? "BB" : "BTN";
  const villainPos: Position = heroPos === "BB" ? "CO" : "BB";
  const potBeforeBet = r1(5 + rint(0, 8)); // single-raised-ish pot
  const betFrac = [0.5, 0.66, 1][rint(0, 2)];
  const bet = r1(potBeforeBet * betFrac);
  const pot = r1(potBeforeBet + bet);
  const toCall = bet;

  const blocked = new Set<Card>([...hole, ...board]);
  const villRange = topPercentRange(STREET_RANGE_PCT[street]);
  const combos = rangeToCombos(villRange, blocked);
  const heroInts = comboToInts(hole);
  const boardInts = board.map(cardToInt);
  const eq = combos.length ? equityVsRange(heroInts, boardInts, combos, 1500).equity : 0.5;
  const breakEven = toCall / (pot + toCall);

  let best: DrillAction;
  let accept: DrillAction[];
  if (eq >= breakEven + 0.02) {
    best = "call";
    accept = eq > 0.72 ? ["call", "raise"] : ["call"];
  } else {
    best = "fold";
    accept = ["fold"];
  }

  const seats = fullSeats(
    heroPos,
    ORDER.filter((pp) => pp !== heroPos && pp !== villainPos),
    [villainPos],
  );

  const frames: DrillFrame[] = [
    { text: `Pre-flop: ${villainPos} raised, you called from the ${heroPos}. Heads-up.`, street: "preflop", board: [], pot: potBeforeBet },
    { text: `${capital(street)}: ${board.join(" ")}`, street, board: [...board], pot: potBeforeBet },
    { text: `${villainPos} bets ${bet} bb.`, street, board: [...board], pot },
    { text: `Action on you.`, street, board: [...board], pot },
  ];

  return {
    id: SEQ++,
    kind: "postflop-bet",
    source: "heuristic",
    street,
    heroPos,
    hole,
    handLabel: label,
    board,
    pot,
    toCall,
    bb: BBV,
    seats,
    frames,
    options: [
      { action: "fold", label: "Fold" },
      { action: "call", label: `Call ${toCall}`, amount: toCall },
      { action: "raise", label: `Raise ${r1(pot + bet)}`, amount: r1(pot + bet) },
    ],
    best,
    accept,
    rationale: `You have ~${Math.round(eq * 100)}% equity against a plausible ${street} continuing range, and you're being laid ${Math.round(breakEven * 100)}% pot odds. ${
      best === "call"
        ? eq > 0.72
          ? "That's a clear call — and strong enough to raise for value."
          : "Equity beats the price, so call."
        : "Equity is below the price, so fold."
    }`,
    equity: eq,
    potOdds: breakEven,
    difficulty: eq > breakEven - 0.06 && eq < breakEven + 0.06 ? 3 : 2,
  };
}

function genPostflopCheck(): Puzzle {
  const deck = shuffle(makeDeck());
  const hole: [Card, Card] = [deck[0], deck[1]];
  const label = cardsToLabel(hole[0], hole[1]);
  const street = (["flop", "turn"] as Street[])[rint(0, 1)];
  const { board } = postflopBoard(deck, street);

  const heroPos: Position = "BTN";
  const villainPos: Position = "BB";
  const pot = r1(5 + rint(0, 6));

  const blocked = new Set<Card>([...hole, ...board]);
  const combos = rangeToCombos(topPercentRange(STREET_RANGE_PCT[street]), blocked);
  const eq = combos.length ? equityVsRange(comboToInts(hole), board.map(cardToInt), combos, 1500).equity : 0.5;

  let best: DrillAction;
  let accept: DrillAction[];
  if (eq > 0.6) {
    best = "bet";
    accept = ["bet"];
  } else if (eq > 0.5) {
    best = "bet";
    accept = ["bet", "check"];
  } else {
    best = "check";
    accept = ["check"];
  }

  const seats = fullSeats(
    heroPos,
    ORDER.filter((pp) => pp !== heroPos && pp !== villainPos),
    [villainPos],
  );
  const betTo = r1(pot * 0.66);
  const frames: DrillFrame[] = [
    { text: `Pre-flop: you raised from the ${heroPos}, ${villainPos} called. Heads-up.`, street: "preflop", board: [], pot },
    { text: `${capital(street)}: ${board.join(" ")}`, street, board: [...board], pot },
    { text: `${villainPos} checks. Action on you.`, street, board: [...board], pot },
  ];

  return {
    id: SEQ++,
    kind: "postflop-check",
    source: "heuristic",
    street,
    heroPos,
    hole,
    handLabel: label,
    board,
    pot,
    toCall: 0,
    bb: BBV,
    seats,
    frames,
    options: [
      { action: "check", label: "Check" },
      { action: "bet", label: `Bet ${betTo}`, amount: betTo },
    ],
    best,
    accept,
    rationale: `With ~${Math.round(eq * 100)}% equity vs ${villainPos}'s range, ${
      eq > 0.6
        ? "you're ahead often enough to bet for value."
        : eq > 0.5
          ? "betting or checking are both fine — it's a marginal value/pot-control spot."
          : "you don't have enough to value bet; check and keep the pot small."
    }`,
    equity: eq,
    difficulty: 2,
  };
}

function capital(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Generate a random puzzle (weighted across the four kinds). */
export function generatePuzzle(): Puzzle {
  const roll = Math.random();
  if (roll < 0.3) return genRfi();
  if (roll < 0.55) return genVsRaise();
  if (roll < 0.85) return genPostflopBet();
  return genPostflopCheck();
}

/* ----------------------------- Push/Fold (Nash-style) ----------------------------- */

const SHOVE_BASE: Partial<Record<Position, number>> = { UTG: 16, MP: 22, CO: 38, BTN: 55, SB: 50 };
const CALL_BASE: Partial<Record<Position, number>> = { BTN: 38, CO: 30, SB: 42 };

const clampPct = (x: number) => Math.max(4, Math.min(92, Math.round(x)));

export function generatePushFold(): Puzzle {
  const deck = shuffle(makeDeck());
  const hole: [Card, Card] = [deck[0], deck[1]];
  const label = cardsToLabel(hole[0], hole[1]);
  const stack = rint(8, 14); // bb
  const stackFactor = 1 + (10 - stack) * 0.04; // shorter → wider

  if (Math.random() < 0.6) {
    // Open-shove: folded to hero late
    const heroPos = (["MP", "CO", "BTN", "SB"] as Position[])[rint(0, 3)];
    const pct = clampPct((SHOVE_BASE[heroPos] ?? 20) * stackFactor);
    const inRange = topPercentRange(pct).has(label);
    const best: DrillAction = inRange ? "raise" : "fold";
    const heroIdx = ORDER.indexOf(heroPos);
    const foldedBefore = ORDER.slice(0, heroIdx).filter((p) => p !== "SB" && p !== "BB");
    const pot = SB + BBV;
    const frames: DrillFrame[] = [
      { text: `${stack} bb stacks. Blinds ${SB}/${BBV}.`, street: "preflop", board: [], pot },
    ];
    for (const p of foldedBefore) frames.push({ text: `${p} folds.`, street: "preflop", board: [], pot });
    frames.push({ text: `Folded to you in the ${heroPos} with ${stack} bb. Shove or fold?`, street: "preflop", board: [], pot });

    return {
      id: SEQ++,
      kind: "pushfold",
      source: "chart",
      street: "preflop",
      heroPos,
      hole,
      handLabel: label,
      board: [],
      pot,
      toCall: heroPos === "SB" ? BBV - SB : BBV,
      bb: BBV,
      seats: fullSeats(heroPos, foldedBefore, ORDER.filter((p) => (p === "SB" || p === "BB") && p !== heroPos)),
      frames,
      options: [
        { action: "fold", label: "Fold" },
        { action: "raise", label: `Shove ${stack} bb`, amount: stack },
      ],
      best,
      accept: [best],
      rationale: `~${stack} bb, folded to you in the ${heroPos}. A Nash-style open-shove range here is about the top ${pct}% of hands — ${label} is ${inRange ? "in it, so jam" : "outside it, so fold"}.`,
      difficulty: 2,
    };
  }

  // Call a shove from the BB
  const shoverPos = (["BTN", "CO", "SB"] as Position[])[rint(0, 2)];
  const pct = clampPct((CALL_BASE[shoverPos] ?? 32) * stackFactor);
  const inRange = topPercentRange(pct).has(label);
  const best: DrillAction = inRange ? "call" : "fold";
  const pot = r1(SB + BBV + stack);
  const frames: DrillFrame[] = [
    { text: `${stack} bb stacks. Blinds ${SB}/${BBV}.`, street: "preflop", board: [], pot: SB + BBV },
    { text: `${shoverPos} moves all-in for ${stack} bb.`, street: "preflop", board: [], pot },
    { text: `Action on you in the BB. Call or fold?`, street: "preflop", board: [], pot },
  ];
  return {
    id: SEQ++,
    kind: "pushfold",
    source: "chart",
    street: "preflop",
    heroPos: "BB",
    hole,
    handLabel: label,
    board: [],
    pot,
    toCall: r1(stack - BBV),
    bb: BBV,
    seats: fullSeats("BB", ORDER.filter((p) => p !== "BB" && p !== shoverPos), [shoverPos]),
    frames,
    options: [
      { action: "fold", label: "Fold" },
      { action: "call", label: `Call ${r1(stack - BBV)} bb`, amount: r1(stack - BBV) },
    ],
    best,
    accept: [best],
    rationale: `Facing a ${stack} bb shove from the ${shoverPos}. A Nash-style calling range is about the top ${pct}% — ${label} ${inRange ? "is a call" : "is a fold"}.`,
    difficulty: 2,
  };
}

/* ----------------------------- Leak replay ----------------------------- */

export interface LeakSpot {
  id: string;
  street: Street;
  heroPos: Position;
  hole: [Card, Card];
  board: Card[];
  pot: number;
  toCall: number;
  bb: number;
  oppActive: Position[];
  options: DrillOption[];
  best: DrillAction;
  rationale: string;
  equity?: number;
  potOdds?: number;
  ts: number;
}

/** Rebuild a playable puzzle from a saved leak spot. */
export function puzzleFromLeak(spot: LeakSpot): Puzzle {
  const folded = ORDER.filter((p) => p !== spot.heroPos && !spot.oppActive.includes(p));
  const streetLabel = spot.street[0].toUpperCase() + spot.street.slice(1);
  const frames: DrillFrame[] = [
    {
      text: spot.board.length ? `${streetLabel}: ${spot.board.join(" ")}` : "Pre-flop.",
      street: spot.street,
      board: [...spot.board],
      pot: spot.pot,
    },
    {
      text: `Action on you in the ${spot.heroPos}${spot.toCall > 0 ? ` facing ${(spot.toCall / spot.bb).toFixed(1)} bb` : ""}. What's the play?`,
      street: spot.street,
      board: [...spot.board],
      pot: spot.pot,
    },
  ];
  return {
    id: SEQ++,
    kind: "leak",
    source: "heuristic",
    street: spot.street,
    heroPos: spot.heroPos,
    hole: spot.hole,
    handLabel: cardsToLabel(spot.hole[0], spot.hole[1]),
    board: spot.board,
    pot: spot.pot,
    toCall: spot.toCall,
    bb: spot.bb,
    seats: fullSeats(spot.heroPos, folded, spot.oppActive),
    frames,
    options: spot.options,
    best: spot.best,
    accept: [spot.best],
    rationale: spot.rationale,
    equity: spot.equity,
    potOdds: spot.potOdds,
    difficulty: 2,
  };
}

export interface GradeResult {
  correct: boolean;
  best: DrillAction;
  accept: DrillAction[];
  rationale: string;
}

export function gradePuzzle(p: Puzzle, action: DrillAction): GradeResult {
  return { correct: p.accept.includes(action), best: p.best, accept: p.accept, rationale: p.rationale };
}
