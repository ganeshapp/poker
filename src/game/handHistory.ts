import type { Card, PotResult, Position, Street, ActionType } from "../types/poker.ts";

/* ==================================================================
   Structured hand-history recording + PokerStars-style export.

   The emitted text follows the widely-imported PokerStars Hold'em
   history layout so sessions can be loaded into trackers / replayers.
   Amounts are in chips (play-money style).
   ================================================================== */

export interface HHAction {
  street: Street;
  seat: number;
  name: string;
  type: ActionType;
  amount: number; // call: chips called; bet/raise: total "to" this street
  allIn: boolean;
}

export interface HHSeat {
  seat: number;
  name: string;
  stack: number; // at the start of the hand
  isHero: boolean;
  position: Position;
}

export interface HHHand {
  id: number;
  startedAt: number;
  button: number;
  sb: number;
  bb: number;
  sbSeat: number;
  bbSeat: number;
  seats: HHSeat[];
  holes: Record<number, [Card, Card] | undefined>;
  actions: HHAction[];
  board: Card[];
  potResults: PotResult[];
  heroNet: number;
}

const STREET_ORDER: Street[] = ["preflop", "flop", "turn", "river"];

function seatNo(seat: number): number {
  return seat + 1;
}

function actionLine(a: HHAction, streetBet: number): { line: string; newStreetBet: number } {
  const all = a.allIn ? " and is all-in" : "";
  switch (a.type) {
    case "fold":
      return { line: `${a.name}: folds`, newStreetBet: streetBet };
    case "check":
      return { line: `${a.name}: checks`, newStreetBet: streetBet };
    case "call":
      return { line: `${a.name}: calls ${a.amount}${all}`, newStreetBet: streetBet };
    case "bet":
      return { line: `${a.name}: bets ${a.amount}${all}`, newStreetBet: a.amount };
    case "raise": {
      const by = Math.max(0, a.amount - streetBet);
      return { line: `${a.name}: raises ${by} to ${a.amount}${all}`, newStreetBet: a.amount };
    }
    default:
      return { line: `${a.name}: posts`, newStreetBet: streetBet };
  }
}

export function formatHand(h: HHHand): string {
  const lines: string[] = [];
  const date = new Date(h.startedAt).toISOString().replace("T", " ").slice(0, 19);
  lines.push(`PokerStars Hand #${h.id}: Hold'em No Limit (${h.sb}/${h.bb}) - ${date} ET`);
  lines.push(`Table 'All-In Dojo' ${h.seats.length}-max Seat #${seatNo(h.button)} is the button`);

  for (const s of h.seats) {
    lines.push(`Seat ${seatNo(s.seat)}: ${s.name} (${s.stack} in chips)`);
  }

  const sbName = h.seats.find((s) => s.seat === h.sbSeat)?.name ?? "SB";
  const bbName = h.seats.find((s) => s.seat === h.bbSeat)?.name ?? "BB";
  lines.push(`${sbName}: posts small blind ${h.sb}`);
  lines.push(`${bbName}: posts big blind ${h.bb}`);

  lines.push("*** HOLE CARDS ***");
  const hero = h.seats.find((s) => s.isHero);
  if (hero && h.holes[hero.seat]) {
    const [c1, c2] = h.holes[hero.seat] as [Card, Card];
    lines.push(`Dealt to ${hero.name} [${c1} ${c2}]`);
  }

  const emitStreet = (street: Street) => {
    const acts = h.actions.filter((a) => a.street === street);
    if (street !== "preflop") {
      if (street === "flop" && h.board.length >= 3) lines.push(`*** FLOP *** [${h.board.slice(0, 3).join(" ")}]`);
      else if (street === "turn" && h.board.length >= 4)
        lines.push(`*** TURN *** [${h.board.slice(0, 3).join(" ")}] [${h.board[3]}]`);
      else if (street === "river" && h.board.length >= 5)
        lines.push(`*** RIVER *** [${h.board.slice(0, 4).join(" ")}] [${h.board[4]}]`);
      else if (acts.length === 0) return;
    }
    let streetBet = street === "preflop" ? h.bb : 0;
    for (const a of acts) {
      const { line, newStreetBet } = actionLine(a, streetBet);
      streetBet = newStreetBet;
      lines.push(line);
    }
  };
  STREET_ORDER.forEach(emitStreet);

  // Showdown
  const shown = h.seats.filter((s) => h.holes[s.seat] && h.actions.some((a) => a.seat === s.seat));
  const wentToShowdown = h.board.length === 5 && h.potResults.some((p) => p.winners.length > 0);
  if (wentToShowdown) {
    lines.push("*** SHOW DOWN ***");
    for (const s of shown) {
      const hole = h.holes[s.seat];
      if (hole) lines.push(`${s.name}: shows [${hole[0]} ${hole[1]}]`);
    }
  }

  // Summary
  const totalPot = h.potResults.reduce((a, b) => a + b.amount, 0);
  lines.push("*** SUMMARY ***");
  lines.push(`Total pot ${totalPot} | Rake 0`);
  if (h.board.length > 0) lines.push(`Board [${h.board.join(" ")}]`);
  for (const s of h.seats) {
    const won = h.potResults.filter((p) => p.winners.includes(s.seat)).reduce((acc, p) => acc + p.amount / p.winners.length, 0);
    if (won > 0) lines.push(`Seat ${seatNo(s.seat)}: ${s.name} won (${Math.round(won)})`);
  }

  return lines.join("\n");
}

export function formatSession(hands: HHHand[]): string {
  return hands.map(formatHand).join("\n\n\n");
}

/* ---- Step-by-step replay frames (for the in-app hand replayer) ---- */

export interface ReplayFrame {
  text: string;
  street: Street;
  board: Card[];
  pot: number;
  folded: number[];
  revealAll?: boolean;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function buildReplayFrames(h: HHHand): ReplayFrame[] {
  const frames: ReplayFrame[] = [];
  const committed: Record<number, number> = {};
  for (const s of h.seats) committed[s.seat] = 0;
  committed[h.sbSeat] = h.sb;
  committed[h.bbSeat] = h.bb;
  let pot = h.sb + h.bb;
  const folded: number[] = [];
  const bb = (chips: number) => {
    const v = chips / h.bb;
    return Number.isInteger(v) ? String(v) : v.toFixed(1);
  };

  frames.push({ text: `Blinds ${bb(h.sb)}/${bb(h.bb)} bb posted.`, street: "preflop", board: [], pot, folded: [] });

  const STREETS: Street[] = ["preflop", "flop", "turn", "river"];
  for (const street of STREETS) {
    const boardForStreet =
      street === "preflop"
        ? []
        : street === "flop"
          ? h.board.length >= 3 ? h.board.slice(0, 3) : null
          : street === "turn"
            ? h.board.length >= 4 ? h.board.slice(0, 4) : null
            : h.board.length >= 5 ? h.board.slice(0, 5) : null;

    if (street !== "preflop") {
      if (!boardForStreet) continue;
      for (const s of h.seats) committed[s.seat] = 0;
      frames.push({ text: `${cap(street)}: ${boardForStreet.join(" ")}`, street, board: boardForStreet, pot, folded: [...folded] });
    }

    const vis = boardForStreet ?? [];
    for (const a of h.actions.filter((x) => x.street === street)) {
      let text = "";
      if (a.type === "fold") {
        folded.push(a.seat);
        text = `${a.name} folds`;
      } else if (a.type === "check") {
        text = `${a.name} checks`;
      } else if (a.type === "call") {
        pot += a.amount;
        committed[a.seat] = (committed[a.seat] || 0) + a.amount;
        text = `${a.name} calls ${bb(a.amount)} bb${a.allIn ? " (all-in)" : ""}`;
      } else if (a.type === "bet") {
        pot += a.amount - (committed[a.seat] || 0);
        committed[a.seat] = a.amount;
        text = `${a.name} bets ${bb(a.amount)} bb${a.allIn ? " (all-in)" : ""}`;
      } else if (a.type === "raise") {
        pot += a.amount - (committed[a.seat] || 0);
        committed[a.seat] = a.amount;
        text = `${a.name} raises to ${bb(a.amount)} bb${a.allIn ? " (all-in)" : ""}`;
      }
      frames.push({ text, street, board: vis, pot, folded: [...folded] });
    }
  }

  const winnerIds = [...new Set(h.potResults.flatMap((p) => p.winners))];
  const names = winnerIds.map((id) => h.seats.find((s) => s.seat === id)?.name ?? `Seat ${id + 1}`);
  const total = h.potResults.reduce((a, b) => a + b.amount, 0);
  const showdown = h.board.length === 5 && h.seats.length - folded.length > 1;
  const endStreet: Street =
    h.board.length >= 5 ? "showdown" : h.board.length === 4 ? "turn" : h.board.length === 3 ? "flop" : "preflop";
  frames.push({
    text: names.length ? `${names.join(", ")} win ${bb(total)} bb.` : "Hand over.",
    street: endStreet,
    board: [...h.board],
    pot,
    folded: [...folded],
    revealAll: showdown,
  });

  return frames;
}
