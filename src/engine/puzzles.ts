import type { Card, Position, Street, HandLabel } from "../types/poker.ts";
import { makeDeck, shuffle, cardToInt } from "./cards.ts";
import { cardsToLabel, labelToCombos } from "./notation.ts";
import { topPercentRange, chartWidth } from "./ranges.ts";
import { equityVsRange, comboToInts, hashSeed } from "./equity.ts";
import { NASH_SHOVE, NASH_CALL, type PushFoldPos } from "../data/pushfold.ts";
import { PREFLOP_100 } from "../data/preflop.ts";

/* ==================================================================
   Drills — procedural puzzle generator + heuristic grader.

   Preflop answers come from position-based opening/defending charts
   (heuristic top-% ranges — honest label, not GTO; real solver-derived
   charts are issue #7). Postflop answers come from equity vs a
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

const pctOf = (chart: Record<string, number>) => Math.round(chartWidth(chart) * 100);

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

  const chart = PREFLOP_100.rfi[heroPos] ?? {};
  const freq = chart[label] ?? 0;
  const mixed = freq > 0.2 && freq < 0.8;
  const best: DrillAction = freq >= 0.5 ? "raise" : "fold";
  const accept: DrillAction[] = mixed ? ["fold", "raise"] : [best];
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
    accept,
    rationale: mixed
      ? `${heroPos} opens about ${pctOf(chart)}% of hands here, and ${label} is a true mixed hand — the chart opens it ${Math.round(freq * 100)}% of the time, so raising and folding are both fine (limping still isn't).`
      : freq >= 0.5
        ? `${heroPos} opens about ${pctOf(chart)}% of hands. ${label} is in that range, so the chart play is to raise (limping isn't part of a solid opening strategy).`
        : `${heroPos} opens about ${pctOf(chart)}% of hands. ${label} isn't in that range, so fold — limping/calling here is −EV.`,
    difficulty: mixed ? 3 : 1,
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

  // Charts are keyed by hero AND raiser position — a BTN open gets
  // defended very differently from an UTG open.
  const charts = PREFLOP_100.vsRfi[`${heroPos}_vs_${raiserPos}`] ?? { threebet: {}, call: {} };
  const f3 = charts.threebet[label] ?? 0;
  const fc = charts.call[label] ?? 0;
  const ff = Math.max(0, 1 - f3 - fc);
  const freqs: [DrillAction, number][] = [
    ["raise", f3],
    ["call", fc],
    ["fold", ff],
  ];
  freqs.sort((a, b) => b[1] - a[1]);
  const best: DrillAction = freqs[0][0];
  const accept: DrillAction[] = freqs.filter(([, f]) => f >= 0.25).map(([a]) => a);
  if (!accept.includes(best)) accept.unshift(best);
  const mixed = accept.length > 1;
  const actName = (a: DrillAction) => (a === "raise" ? "3-bet" : a);
  let rationale: string;
  if (mixed) {
    rationale = `Facing a ${raiserPos} open from the ${heroPos}, ${label} is a genuine mix: the chart ${freqs
      .filter(([, f]) => f >= 0.25)
      .map(([a, f]) => `${actName(a)}s ${Math.round(f * 100)}%`)
      .join(" / ")} of the time. Any of those is fine.`;
  } else if (best === "raise") {
    rationale = `Facing a ${raiserPos} open, ${label} is in the ${heroPos} 3-bet range (~${pctOf(charts.threebet)}% of hands) — re-raise for value/pressure.`;
  } else if (best === "call") {
    rationale = `Facing a ${raiserPos} open, ${label} is too weak to 3-bet but inside the ${heroPos} calling range (~${pctOf(charts.call)}%), so call and see a flop.`;
  } else {
    rationale = `${label} is outside the ${heroPos} continuing range vs a ${raiserPos} open (~${pctOf(charts.threebet) + pctOf(charts.call)}% continues) — fold.`;
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
    accept,
    rationale,
    difficulty: mixed ? 3 : 2,
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
  // Seeded by the spot itself: re-grading the same puzzle always gives
  // the same answer. Turn/river spots are enumerated exactly.
  const r = combos.length
    ? equityVsRange(heroInts, boardInts, combos, 3000, hashSeed(`${hole.join("")}|${board.join("")}`))
    : null;
  const eq = r?.equity ?? 0.5;
  const breakEven = toCall / (pot + toCall);
  const band = Math.max(0.02, 2 * (r?.se ?? 0));

  let best: DrillAction;
  let accept: DrillAction[];
  let closeCall = false;
  if (eq >= breakEven + band) {
    best = "call";
    accept = eq > 0.72 ? ["call", "raise"] : ["call"];
  } else if (eq <= breakEven - band) {
    best = "fold";
    accept = ["fold"];
  } else {
    // Inside the noise/indifference band: either answer is accepted.
    closeCall = true;
    best = eq >= breakEven ? "call" : "fold";
    accept = ["fold", "call"];
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
    rationale: closeCall
      ? `Razor-thin: ~${Math.round(eq * 100)}% equity against a plausible ${street} continuing range vs ${Math.round(breakEven * 100)}% pot odds. That's inside the margin where folding and calling are both fine — ${best === "call" ? "calling" : "folding"} is marginally better.`
      : `You have ~${Math.round(eq * 100)}% equity against a plausible ${street} continuing range, and you're being laid ${Math.round(breakEven * 100)}% pot odds. ${
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
  const r = combos.length
    ? equityVsRange(comboToInts(hole), board.map(cardToInt), combos, 3000, hashSeed(`${hole.join("")}|${board.join("")}`))
    : null;
  const eq = r?.equity ?? 0.5;
  const band = Math.max(0.02, 2 * (r?.se ?? 0));

  let best: DrillAction;
  let accept: DrillAction[];
  if (eq > 0.6 + band) {
    best = "bet";
    accept = ["bet"];
  } else if (eq > 0.5 - band) {
    best = eq > 0.5 ? "bet" : "check";
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
      accept.length === 2
        ? "betting and checking are both fine — it's a marginal value/pot-control spot."
        : best === "bet"
          ? "you're ahead often enough to bet for value."
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

/* --------------- Push/Fold (computed Nash equilibrium tables) --------------- */

const PF_STACKS = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

/** Grade + accept-set + beginner-first rationale from an equilibrium
    frequency. True mixed-frequency hands accept either answer. */
function gradeFromFreq(
  freq: number,
  label: string,
  stack: number,
  aggressive: DrillAction,
  aggroWord: string,
  context: string,
): { best: DrillAction; accept: DrillAction[]; rationale: string } {
  const best: DrillAction = freq >= 0.5 ? aggressive : "fold";
  const mixed = freq > 0.2 && freq < 0.8;
  const accept: DrillAction[] = mixed ? ["fold", aggressive] : [best];
  let rationale: string;
  if (freq >= 0.98) {
    rationale = `${context} ${label} is clearly inside the equilibrium ${aggroWord} range at ${stack} bb — ${aggroWord}.`;
  } else if (freq <= 0.02) {
    rationale = `${context} ${label} is outside the equilibrium ${aggroWord} range at ${stack} bb — fold.`;
  } else {
    rationale = `${context} A true mixed spot: the equilibrium ${aggroWord}s ${label} about ${Math.round(freq * 100)}% of the time here, so ${aggroWord}ing and folding are both fine.`;
  }
  return { best, accept, rationale };
}

export function generatePushFold(): Puzzle {
  const deck = shuffle(makeDeck());
  const hole: [Card, Card] = [deck[0], deck[1]];
  const label = cardsToLabel(hole[0], hole[1]);
  const stack = PF_STACKS[rint(0, PF_STACKS.length - 1)]; // bb

  if (Math.random() < 0.6) {
    // Open-shove: folded to hero late
    const heroPos = (["MP", "CO", "BTN", "SB"] as Position[])[rint(0, 3)];
    const freq = NASH_SHOVE[stack]?.[heroPos as PushFoldPos]?.[label] ?? 0;
    const {
      best,
      accept,
      rationale,
    } = gradeFromFreq(freq, label, stack, "raise", "jam", `Folded to you in the ${heroPos} with ${stack} bb (Nash, chip-EV, no antes).`);
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
      accept,
      rationale,
      difficulty: freq > 0.2 && freq < 0.8 ? 3 : 2,
    };
  }

  // Call a shove from the BB
  const shoverPos = (["BTN", "CO", "SB"] as Position[])[rint(0, 2)];
  const freq = NASH_CALL[stack]?.[`${shoverPos}>BB`]?.[label] ?? 0;
  const { best, accept, rationale } = gradeFromFreq(
    freq,
    label,
    stack,
    "call",
    "call",
    `Facing a ${stack} bb all-in from the ${shoverPos} (Nash, chip-EV, no antes).`,
  );
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
    accept,
    rationale,
    difficulty: freq > 0.2 && freq < 0.8 ? 3 : 2,
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
