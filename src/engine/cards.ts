import type { Card, Rank, Suit } from "../types/poker.ts";
import { RANKS, SUITS } from "../types/poker.ts";

/* ------------------------------------------------------------------
   Card <-> integer encoding (0..51).
   int = rankIndex * 4 + suitIndex, where rankIndex 0..12 maps 2..A.
   ------------------------------------------------------------------ */

export function cardToInt(card: Card): number {
  const r = RANKS.indexOf(card[0] as Rank);
  const s = SUITS.indexOf(card[1] as Suit);
  return r * 4 + s;
}

export function intToCard(i: number): Card {
  return RANKS[i >> 2] + SUITS[i & 3];
}

/** Rank value 2..14 (Ace high) from an int card. */
export function rankOf(i: number): number {
  return (i >> 2) + 2;
}

/** Suit index 0..3 from an int card. */
export function suitOf(i: number): number {
  return i & 3;
}

export function makeDeckInts(): number[] {
  const d: number[] = new Array(52);
  for (let i = 0; i < 52; i++) d[i] = i;
  return d;
}

export function makeDeck(): Card[] {
  const d: Card[] = [];
  for (const r of RANKS) for (const s of SUITS) d.push(r + s);
  return d;
}

/** In-place Fisher–Yates shuffle (also returns the array). */
export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

export const SUIT_SYMBOL: Record<Suit, string> = {
  s: "♠", // ♠
  h: "♥", // ♥
  d: "♦", // ♦
  c: "♣", // ♣
};

export function isRedSuit(s: Suit): boolean {
  return s === "h" || s === "d";
}

export function cardRank(card: Card): Rank {
  return card[0] as Rank;
}
export function cardSuit(card: Card): Suit {
  return card[1] as Suit;
}
