import type { Card, EvaluatedHand } from "../types/poker.ts";
import { HandCategory } from "../types/poker.ts";
import { cardToInt } from "./cards.ts";

/* ------------------------------------------------------------------
   Fast 5–7 card hand evaluator.
   Produces a monotonic `score` (higher = better) that is safe to
   compare across any hands, plus a category and a human name.

   Score packing: category occupies the top tier, then up to 5
   tiebreak ranks are packed in base-16 (ranks 2..14 < 16).
   ------------------------------------------------------------------ */

const CAT = 16 ** 5; // 1,048,576

const RANK_NAME: Record<number, string> = {
  14: "Ace", 13: "King", 12: "Queen", 11: "Jack", 10: "Ten",
  9: "Nine", 8: "Eight", 7: "Seven", 6: "Six", 5: "Five",
  4: "Four", 3: "Three", 2: "Two",
};
const RANK_NAME_PLURAL: Record<number, string> = {
  14: "Aces", 13: "Kings", 12: "Queens", 11: "Jacks", 10: "Tens",
  9: "Nines", 8: "Eights", 7: "Sevens", 6: "Sixes", 5: "Fives",
  4: "Fours", 3: "Threes", 2: "Twos",
};

function pack(kickers: number[]): number {
  // up to 5 kickers, most significant first
  let t = 0;
  for (let i = 0; i < 5; i++) t = t * 16 + (kickers[i] ?? 0);
  return t;
}

/** Highest card of a 5-straight given a rank bitmask (bits 2..14). 0 if none. */
function straightHigh(mask: number): number {
  let m = mask;
  if (m & (1 << 14)) m |= 1 << 1; // wheel: Ace plays low
  for (let hi = 14; hi >= 5; hi--) {
    const need =
      (1 << hi) | (1 << (hi - 1)) | (1 << (hi - 2)) | (1 << (hi - 3)) | (1 << (hi - 4));
    if ((m & need) === need) return hi;
  }
  return 0;
}

/** Core evaluator operating on integer cards (0..51). Length 5–7. */
export function evaluateInts(cards: number[]): EvaluatedHand {
  const counts = new Array(15).fill(0); // index by rank 2..14
  const suitRankMask = [0, 0, 0, 0]; // per suit, bitmask of ranks
  const suitCount = [0, 0, 0, 0];
  let rankMask = 0;

  for (const c of cards) {
    const r = (c >> 2) + 2;
    const s = c & 3;
    counts[r]++;
    rankMask |= 1 << r;
    suitRankMask[s] |= 1 << r;
    suitCount[s]++;
  }

  // Flush suit (>=5)
  let flushSuit = -1;
  for (let s = 0; s < 4; s++) if (suitCount[s] >= 5) flushSuit = s;

  // 1) Straight flush
  if (flushSuit >= 0) {
    const sfHigh = straightHigh(suitRankMask[flushSuit]);
    if (sfHigh > 0) {
      const name =
        sfHigh === 14 ? "Royal Flush" : `Straight Flush, ${RANK_NAME[sfHigh]} high`;
      return { category: HandCategory.StraightFlush, score: 8 * CAT + pack([sfHigh]), name };
    }
  }

  // Build helpers: ranks present in descending order
  const ranksDesc: number[] = [];
  for (let r = 14; r >= 2; r--) if (counts[r] > 0) ranksDesc.push(r);

  const topKickers = (exclude: Set<number>, n: number): number[] => {
    const out: number[] = [];
    for (const r of ranksDesc) {
      if (exclude.has(r)) continue;
      out.push(r);
      if (out.length === n) break;
    }
    return out;
  };

  // Find quads / trips / pairs
  let quad = 0;
  const trips: number[] = [];
  const pairs: number[] = [];
  for (let r = 14; r >= 2; r--) {
    if (counts[r] === 4) quad = r;
    else if (counts[r] === 3) trips.push(r);
    else if (counts[r] === 2) pairs.push(r);
  }

  // 2) Quads
  if (quad) {
    const kicker = topKickers(new Set([quad]), 1)[0] ?? 0;
    return {
      category: HandCategory.Quads,
      score: 7 * CAT + pack([quad, kicker]),
      name: `Four of a Kind, ${RANK_NAME_PLURAL[quad]}`,
    };
  }

  // 3) Full house (supports two trips)
  if (trips.length > 0) {
    const tripRank = trips[0];
    let pairRank = 0;
    if (trips.length > 1) pairRank = trips[1];
    if (pairs.length > 0 && pairs[0] > pairRank) pairRank = pairs[0];
    if (pairRank > 0) {
      return {
        category: HandCategory.FullHouse,
        score: 6 * CAT + pack([tripRank, pairRank]),
        name: `Full House, ${RANK_NAME_PLURAL[tripRank]} full of ${RANK_NAME_PLURAL[pairRank]}`,
      };
    }
  }

  // 4) Flush
  if (flushSuit >= 0) {
    const fr: number[] = [];
    for (let r = 14; r >= 2 && fr.length < 5; r--) {
      if (suitRankMask[flushSuit] & (1 << r)) fr.push(r);
    }
    return {
      category: HandCategory.Flush,
      score: 5 * CAT + pack(fr),
      name: `Flush, ${RANK_NAME[fr[0]]} high`,
    };
  }

  // 5) Straight
  const sHigh = straightHigh(rankMask);
  if (sHigh > 0) {
    return {
      category: HandCategory.Straight,
      score: 4 * CAT + pack([sHigh]),
      name: `Straight, ${RANK_NAME[sHigh]} high`,
    };
  }

  // 6) Trips
  if (trips.length > 0) {
    const t = trips[0];
    const ks = topKickers(new Set([t]), 2);
    return {
      category: HandCategory.Trips,
      score: 3 * CAT + pack([t, ...ks]),
      name: `Three of a Kind, ${RANK_NAME_PLURAL[t]}`,
    };
  }

  // 7) Two pair
  if (pairs.length >= 2) {
    const hi = pairs[0];
    const lo = pairs[1];
    const kicker = topKickers(new Set([hi, lo]), 1)[0] ?? 0;
    return {
      category: HandCategory.TwoPair,
      score: 2 * CAT + pack([hi, lo, kicker]),
      name: `Two Pair, ${RANK_NAME_PLURAL[hi]} & ${RANK_NAME_PLURAL[lo]}`,
    };
  }

  // 8) Pair
  if (pairs.length === 1) {
    const p = pairs[0];
    const ks = topKickers(new Set([p]), 3);
    return {
      category: HandCategory.Pair,
      score: 1 * CAT + pack([p, ...ks]),
      name: `Pair of ${RANK_NAME_PLURAL[p]}`,
    };
  }

  // 9) High card
  const hc = topKickers(new Set(), 5);
  return {
    category: HandCategory.HighCard,
    score: 0 * CAT + pack(hc),
    name: `${RANK_NAME[hc[0]]} High`,
  };
}

/** String-facing evaluator. */
export function evaluateCards(cards: Card[]): EvaluatedHand {
  return evaluateInts(cards.map(cardToInt));
}

/** Compare two evaluated hands: positive if a is better. */
export function compareHands(a: EvaluatedHand, b: EvaluatedHand): number {
  return a.score - b.score;
}
