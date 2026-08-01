import type { Card, PotResult, Position, Street, ActionType } from "../types/poker.ts";
import { evaluateCards } from "../engine/evaluator.ts";

/* ==================================================================
   Structured hand-history recording + PokerStars-style export.

   The emitted text follows the widely-imported PokerStars Hold'em
   history layout so sessions can be loaded into trackers / replayers:
   globally unique hand ids, real muck semantics (folded players never
   show cards, whatever the in-app learning reveal displays), uncalled
   bets returned, and per-seat summary lines. Amounts are in chips
   (play-money style).
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

/** Globally unique, monotonic export id (session-local ids restart at 1). */
export function exportHandId(h: HHHand): number {
  return h.startedAt * 100 + (h.id % 100);
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** PokerStars-style timestamp: 2026/06/19 12:00:00 */
function psDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

/** "Two Pair, Aces & Kings" -> "two pair, Aces and Kings" (PS descriptor style). */
function psHandName(hole: [Card, Card], board: Card[]): string {
  const n = evaluateCards([...hole, ...board]).name.replace(" & ", " and ");
  if (n.startsWith("Pair of")) return `a pair of${n.slice(7)}`;
  if (n.startsWith("Two Pair")) return `two pair${n.slice(8)}`;
  if (n.startsWith("Three of a Kind")) return `three of a kind${n.slice(15)}`;
  if (n.startsWith("Straight Flush")) return `a straight flush${n.slice(14)}`;
  if (n.startsWith("Straight")) return `a straight${n.slice(8)}`;
  if (n.startsWith("Flush")) return `a flush${n.slice(5)}`;
  if (n.startsWith("Full House")) return `a full house${n.slice(10)}`;
  if (n.startsWith("Four of a Kind")) return `four of a kind${n.slice(14)}`;
  if (n === "Royal Flush") return "a royal flush";
  if (n.endsWith("High")) return `high card ${n.slice(0, -5)}`;
  return n.toLowerCase();
}

const FOLD_STREET_PHRASE: Record<string, string> = {
  preflop: "before Flop",
  flop: "on the Flop",
  turn: "on the Turn",
  river: "on the River",
};

export function formatHand(h: HHHand): string {
  const lines: string[] = [];
  lines.push(
    `PokerStars Hand #${exportHandId(h)}: Hold'em No Limit (${h.sb}/${h.bb}) - ${psDate(h.startedAt)} ET`,
  );
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

  // Who folded, and on which street. Seats that never acted and never
  // won are treated as folded before the flop (defensive for partial
  // records — the live engine always records an explicit fold).
  const winners = new Set(h.potResults.flatMap((p) => p.winners));
  const foldedOn = new Map<number, Street>();
  for (const a of h.actions) if (a.type === "fold" && !foldedOn.has(a.seat)) foldedOn.set(a.seat, a.street);
  for (const s of h.seats) {
    if (!foldedOn.has(s.seat) && !winners.has(s.seat) && !h.actions.some((a) => a.seat === s.seat)) {
      foldedOn.set(s.seat, "preflop");
    }
  }
  const live = h.seats.filter((s) => !foldedOn.has(s.seat));

  // Per-street committed chips, kept per street so the last betting
  // street tells us about any uncalled bet.
  const committed: Record<number, number> = {};
  const emitStreet = (street: Street) => {
    const acts = h.actions.filter((a) => a.street === street);
    if (street === "preflop") {
      committed[h.sbSeat] = h.sb;
      committed[h.bbSeat] = h.bb;
    } else {
      if (street === "flop" && h.board.length >= 3) lines.push(`*** FLOP *** [${h.board.slice(0, 3).join(" ")}]`);
      else if (street === "turn" && h.board.length >= 4)
        lines.push(`*** TURN *** [${h.board.slice(0, 3).join(" ")}] [${h.board[3]}]`);
      else if (street === "river" && h.board.length >= 5)
        lines.push(`*** RIVER *** [${h.board.slice(0, 4).join(" ")}] [${h.board[4]}]`);
      else if (acts.length === 0) return;
      if (acts.length > 0) for (const s of h.seats) committed[s.seat] = 0;
    }
    let streetBet = street === "preflop" ? h.bb : 0;
    for (const a of acts) {
      if (a.type === "call") committed[a.seat] = (committed[a.seat] ?? 0) + a.amount;
      else if (a.type === "bet" || a.type === "raise") committed[a.seat] = a.amount;
      const { line, newStreetBet } = actionLine(a, streetBet);
      streetBet = newStreetBet;
      lines.push(line);
    }
  };
  STREET_ORDER.forEach(emitStreet);

  // Uncalled bet: on the final betting street, any excess of the top
  // committed amount over the second-highest is returned to its owner.
  const commits = h.seats
    .map((s) => ({ seat: s.seat, amt: committed[s.seat] ?? 0 }))
    .sort((a, b) => b.amt - a.amt);
  const uncalled = commits.length > 1 ? commits[0].amt - commits[1].amt : 0;
  const uncalledSeat = uncalled > 0 ? commits[0].seat : null;
  if (uncalledSeat != null) {
    const name = h.seats.find((s) => s.seat === uncalledSeat)?.name ?? "";
    lines.push(`Uncalled bet (${uncalled}) returned to ${name}`);
  }

  // What each seat actually collects (pot totals minus any returned bet).
  const collected = new Map<number, number>();
  for (const p of h.potResults) {
    for (const w of p.winners) {
      collected.set(w, (collected.get(w) ?? 0) + Math.round(p.amount / p.winners.length));
    }
  }
  if (uncalledSeat != null) {
    collected.set(uncalledSeat, Math.max(0, (collected.get(uncalledSeat) ?? 0) - uncalled));
  }

  // Showdown: only genuine ones (river dealt, 2+ players still in).
  const wentToShowdown = h.board.length === 5 && live.length > 1;
  if (wentToShowdown) {
    lines.push("*** SHOW DOWN ***");
    for (const s of live) {
      const hole = h.holes[s.seat];
      if (hole) lines.push(`${s.name}: shows [${hole[0]} ${hole[1]}] (${psHandName(hole, h.board)})`);
    }
  }
  for (const [seat, amt] of collected) {
    if (amt > 0) {
      const name = h.seats.find((s) => s.seat === seat)?.name ?? "";
      lines.push(`${name} collected ${amt} from pot`);
    }
  }

  // Summary
  const totalPot = [...collected.values()].reduce((a, b) => a + b, 0);
  lines.push("*** SUMMARY ***");
  lines.push(`Total pot ${totalPot} | Rake 0`);
  if (h.board.length > 0) lines.push(`Board [${h.board.join(" ")}]`);
  for (const s of h.seats) {
    const tag =
      s.seat === h.sbSeat ? " (small blind)" : s.seat === h.bbSeat ? " (big blind)" : s.seat === h.button ? " (button)" : "";
    const won = collected.get(s.seat) ?? 0;
    const hole = h.holes[s.seat];
    const foldStreet = foldedOn.get(s.seat);
    if (foldStreet) {
      lines.push(`Seat ${seatNo(s.seat)}: ${s.name}${tag} folded ${FOLD_STREET_PHRASE[foldStreet] ?? "before Flop"}`);
    } else if (wentToShowdown && hole) {
      const outcome = won > 0 ? `won (${won})` : "lost";
      lines.push(
        `Seat ${seatNo(s.seat)}: ${s.name}${tag} showed [${hole[0]} ${hole[1]}] and ${outcome} with ${psHandName(hole, h.board)}`,
      );
    } else if (won > 0) {
      lines.push(`Seat ${seatNo(s.seat)}: ${s.name}${tag} collected (${won})`);
    } else {
      lines.push(`Seat ${seatNo(s.seat)}: ${s.name}${tag} mucked`);
    }
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
  const endStreet: Street =
    h.board.length >= 5 ? "showdown" : h.board.length === 4 ? "turn" : h.board.length === 3 ? "flop" : "preflop";
  frames.push({
    text: names.length ? `${names.join(", ")} win ${bb(total)} bb.` : "Hand over.",
    street: endStreet,
    board: [...h.board],
    pot,
    folded: [...folded],
    revealAll: true,
  });

  return frames;
}
