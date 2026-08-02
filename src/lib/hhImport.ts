import type { Card, Position, Street } from "../types/poker.ts";
import type { HHAction, HHHand, HHSeat } from "../game/handHistory.ts";
import { cardsToLabel } from "../engine/notation.ts";
import { equityVsRandom, comboToInts, hashSeed } from "../engine/equity.ts";
import { cardToInt } from "../engine/cards.ts";
import type { LeakSpot } from "../engine/puzzles.ts";

/* ==================================================================
   PokerStars-dialect hand-history IMPORT.

   Parses the layout this app exports (round-trip tested) and tolerates
   the common variations in genuine PokerStars files ($ amounts, seat
   annotations, "posts small & big blinds", uncalled-bet lines).
   Amount units are preserved as written (chips or $ both parse).
   ================================================================== */

const CARD_RE = /^[2-9TJQKA][cdhs]$/;

function parseCards(inside: string): Card[] {
  return inside
    .trim()
    .split(/\s+/)
    .filter((c) => CARD_RE.test(c));
}

function num(s: string): number {
  return Number.parseFloat(s.replace(/[$,]/g, ""));
}

export interface ImportedHand extends HHHand {
  imported: true;
  heroName: string | null;
}

/** Parse a text blob of one-or-more PokerStars-style hands. Unparseable
    blocks are skipped (count returned), never thrown. */
export function parsePokerStars(text: string): { hands: ImportedHand[]; skipped: number } {
  const blocks = text
    .replace(/\r/g, "")
    .split(/\n{2,}(?=PokerStars )/)
    .map((b) => b.trim())
    .filter((b) => b.startsWith("PokerStars "));
  const hands: ImportedHand[] = [];
  let skipped = 0;
  for (const block of blocks) {
    try {
      const h = parseOne(block);
      if (h) hands.push(h);
      else skipped++;
    } catch {
      skipped++;
    }
  }
  return { hands, skipped };
}

function parseOne(block: string): ImportedHand | null {
  const lines = block.split("\n").map((l) => l.trim());
  const header = lines[0] ?? "";
  const hm = header.match(/Hand #(\d+):.*\(\$?([\d.,]+)\/\$?([\d.,]+)(?:\s|\))/);
  if (!hm) return null;
  const sb = num(hm[2]);
  const bb = num(hm[3]);
  const dm = header.match(/- (\d{4})[/-](\d{2})[/-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  const startedAt = dm
    ? new Date(+dm[1], +dm[2] - 1, +dm[3], +dm[4], +dm[5], +dm[6]).getTime()
    : Date.now();

  const tm = lines[1]?.match(/Seat #(\d+) is the button/);
  const buttonSeatNo = tm ? +tm[1] : 1;

  // Seats
  const seats: HHSeat[] = [];
  for (const l of lines) {
    const m = l.match(/^Seat (\d+): (.+?) \(\$?([\d.,]+) in chips\)/);
    if (m) {
      seats.push({ seat: +m[1] - 1, name: m[2].trim(), stack: num(m[3]), isHero: false, position: "BTN" });
    }
  }
  if (seats.length < 2) return null;
  const byName = new Map(seats.map((s) => [s.name, s]));

  // Blinds
  let sbSeat = -1;
  let bbSeat = -1;
  for (const l of lines) {
    let m = l.match(/^(.+?): posts small blind/);
    if (m && byName.has(m[1])) sbSeat = byName.get(m[1])!.seat;
    m = l.match(/^(.+?): posts big blind/);
    if (m && byName.has(m[1])) bbSeat = byName.get(m[1])!.seat;
  }

  // Hero
  const holes: Record<number, [Card, Card] | undefined> = {};
  let heroName: string | null = null;
  for (const l of lines) {
    const m = l.match(/^Dealt to (.+?) \[([^\]]+)\]/);
    if (m && byName.has(m[1])) {
      const cs = parseCards(m[2]);
      if (cs.length === 2) {
        heroName = m[1];
        const s = byName.get(m[1])!;
        s.isHero = true;
        holes[s.seat] = [cs[0], cs[1]];
      }
    }
  }

  // Streets + actions + board
  let street: Street = "preflop";
  let board: Card[] = [];
  const actions: HHAction[] = [];
  for (const l of lines) {
    let m = l.match(/^\*\*\* FLOP \*\*\* \[([^\]]+)\]/);
    if (m) {
      street = "flop";
      board = parseCards(m[1]);
      continue;
    }
    m = l.match(/^\*\*\* TURN \*\*\* \[[^\]]+\] \[([^\]]+)\]/);
    if (m) {
      street = "turn";
      board = [...board.slice(0, 3), ...parseCards(m[1])];
      continue;
    }
    m = l.match(/^\*\*\* RIVER \*\*\* \[[^\]]+\] \[([^\]]+)\]/);
    if (m) {
      street = "river";
      board = [...board.slice(0, 4), ...parseCards(m[1])];
      continue;
    }
    if (l.startsWith("*** SHOW DOWN") || l.startsWith("*** SUMMARY")) {
      street = "showdown" as Street;
      continue;
    }
    if ((street as string) === "showdown") {
      // Collect shown cards from summary/showdown lines.
      const sm = l.match(/^(?:Seat \d+: )?(.+?)[:]? (?:shows|showed) \[([^\]]+)\]/);
      if (sm && byName.has(sm[1])) {
        const cs = parseCards(sm[2]);
        if (cs.length === 2) holes[byName.get(sm[1])!.seat] = [cs[0], cs[1]];
      }
      continue;
    }
    // Action lines
    let am = l.match(/^(.+?): folds/);
    if (am && byName.has(am[1])) {
      actions.push({ street, seat: byName.get(am[1])!.seat, name: am[1], type: "fold", amount: 0, allIn: false });
      continue;
    }
    am = l.match(/^(.+?): checks/);
    if (am && byName.has(am[1])) {
      actions.push({ street, seat: byName.get(am[1])!.seat, name: am[1], type: "check", amount: 0, allIn: false });
      continue;
    }
    am = l.match(/^(.+?): calls \$?([\d.,]+)( and is all-in)?/);
    if (am && byName.has(am[1])) {
      actions.push({ street, seat: byName.get(am[1])!.seat, name: am[1], type: "call", amount: num(am[2]), allIn: !!am[3] });
      continue;
    }
    am = l.match(/^(.+?): bets \$?([\d.,]+)( and is all-in)?/);
    if (am && byName.has(am[1])) {
      actions.push({ street, seat: byName.get(am[1])!.seat, name: am[1], type: "bet", amount: num(am[2]), allIn: !!am[3] });
      continue;
    }
    am = l.match(/^(.+?): raises \$?[\d.,]+ to \$?([\d.,]+)( and is all-in)?/);
    if (am && byName.has(am[1])) {
      actions.push({ street, seat: byName.get(am[1])!.seat, name: am[1], type: "raise", amount: num(am[2]), allIn: !!am[3] });
      continue;
    }
  }

  // Winners from summary "collected" / "won" lines.
  const collected = new Map<number, number>();
  for (const l of lines) {
    const m =
      l.match(/^(.+?) collected \$?([\d.,]+) from/) ??
      l.match(/^Seat \d+: (.+?) (?:\([^)]+\) )?(?:collected \(\$?([\d.,]+)\)|showed \[[^\]]+\] and won \(\$?([\d.,]+)\))/);
    if (m) {
      const name = m[1].trim();
      const amt = num(m[2] ?? m[3] ?? "0");
      if (byName.has(name) && amt > 0) {
        collected.set(byName.get(name)!.seat, Math.max(collected.get(byName.get(name)!.seat) ?? 0, amt));
      }
    }
  }
  const potResults = [...collected.entries()].map(([seat, amount]) => ({
    winners: [seat],
    amount,
    potLabel: "Pot",
  }));

  // Positions (relative to the button), best-effort for 2-9 players.
  const n = seats.length;
  const order: Position[] = n === 2 ? ["BTN", "BB"] : ["BTN", "SB", "BB", "UTG", "MP", "CO", "MP", "MP", "CO"];
  for (const s of seats) {
    const off = (s.seat - (buttonSeatNo - 1) + n) % n;
    s.position = order[Math.min(off, order.length - 1)] ?? "MP";
  }

  const heroSeat = seats.find((s) => s.isHero);
  // Net is approximate on import (winnings only) — imported hands never
  // touch play statistics anyway.
  const heroNet = heroSeat != null ? (collected.get(heroSeat.seat) ?? 0) : 0;

  return {
    id: Number(String(hm[1]).slice(-6)),
    startedAt,
    button: buttonSeatNo - 1,
    sb,
    bb,
    sbSeat: sbSeat >= 0 ? sbSeat : (buttonSeatNo % n),
    bbSeat: bbSeat >= 0 ? bbSeat : ((buttonSeatNo + 1) % n),
    seats,
    holes,
    actions,
    board,
    potResults,
    heroNet,
    imported: true,
    heroName,
  };
}

/* ---- Analyzer: flag questionable hero calls for the Review queue.
   Villain ranges are unknown in imports, so equity runs vs random
   hands (exact on the river) and only CLEAR mistakes are flagged. ---- */

export function analyzeImported(hands: ImportedHand[]): { reviewed: number; leaks: LeakSpot[] } {
  const leaks: LeakSpot[] = [];
  let reviewed = 0;

  for (const h of hands) {
    const hero = h.seats.find((s) => s.isHero);
    const hole = hero ? h.holes[hero.seat] : undefined;
    if (!hero || !hole) continue;

    // Walk actions, tracking pot and per-street committed.
    let pot = h.sb + h.bb;
    const committed: Record<number, number> = { [h.sbSeat]: h.sb, [h.bbSeat]: h.bb };
    let street: Street = "preflop";
    for (const a of h.actions) {
      if (a.street !== street) {
        street = a.street;
        for (const k of Object.keys(committed)) committed[+k] = 0;
      }
      const prev = committed[a.seat] ?? 0;
      if (a.type === "call") {
        if (a.seat === hero.seat && a.amount > 0) {
          reviewed++;
          const boardNow =
            street === "preflop" ? [] : street === "flop" ? h.board.slice(0, 3) : street === "turn" ? h.board.slice(0, 4) : h.board.slice(0, 5);
          const needed = a.amount / (pot + a.amount);
          const r = equityVsRandom(
            comboToInts(hole),
            boardNow.map(cardToInt),
            2500,
            hashSeed(`imp|${h.startedAt}|${street}|${a.amount}`),
          );
          // Clear mistake only: pessimistic-edge equity still below price by a wide margin.
          if (r.equity + 2 * r.se + 0.08 < needed) {
            leaks.push({
              id: `imp-${h.startedAt}-${street}`,
              street,
              heroPos: hero.position,
              hole,
              board: boardNow,
              pot: pot / h.bb,
              toCall: a.amount / h.bb,
              bb: 1,
              oppActive: h.seats.filter((s) => !s.isHero).map((s) => s.position),
              options: [
                { action: "fold", label: "Fold" },
                { action: "call", label: `Call ${(a.amount / h.bb).toFixed(1)} bb`, amount: a.amount / h.bb },
              ],
              best: "fold",
              rationale: `Imported hand: you called ${(a.amount / h.bb).toFixed(1)} bb needing ${Math.round(needed * 100)}% but ${cardsToLabel(hole[0], hole[1])} wins only ~${Math.round(r.equity * 100)}% even against a random hand — real ranges make it worse.`,
              equity: r.equity,
              potOdds: needed,
              ts: Date.now(),
            });
          }
        }
        committed[a.seat] = prev + a.amount;
        pot += a.amount;
      } else if (a.type === "bet" || a.type === "raise") {
        pot += a.amount - prev;
        committed[a.seat] = a.amount;
      }
    }
  }
  return { reviewed, leaks };
}
