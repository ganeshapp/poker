/**
 * Counting outs — the number a player can actually reach at the table.
 *
 * The coach's equity figure comes from thousands of simulated runouts, which
 * nobody can do in their head. Outs are the human version of the same idea,
 * and the app already teaches them (Study → "Counting Outs & the 2/4 Rule"),
 * so the coach should speak the same language: "four outs — the four 3s make
 * your straight" rather than only "26% equity".
 *
 * An out here is a card that takes the hero from BEHIND to AHEAD of the hands
 * the opponents would actually be holding — not a card that merely improves
 * the hand. A queen that pairs you is no out when they are betting a board
 * that beats a pair of queens.
 */
import type { Card, EvaluatedHand } from "../types/poker.ts";
import { cardToInt, intToCard, rankOf, suitOf } from "./cards.ts";
import { evaluateInts } from "./evaluator.ts";
import type { IntCombo } from "./equity.ts";

// `rankOf` returns 2..14, so these are indexed by rank - 2.
const RANK_PLURALS = ["2s", "3s", "4s", "5s", "6s", "7s", "8s", "9s", "10s", "jacks", "queens", "kings", "aces"];
// `suitOf` indexes SUITS = ["c", "d", "h", "s"].
const SUIT_PLURALS = ["clubs", "diamonds", "hearts", "spades"];
const COUNT_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

/** Share of their hands you must beat to call yourself ahead. */
const AHEAD_BAR = 0.7;

/**
 * One pair has to clear a much higher bar before it counts as an out. A pair
 * that beats 70% of their hands still folds to the next bet; a straight that
 * beats 70% of them is a hand you keep betting. This is the difference
 * between telling someone they have seven outs on 6-5-4 with Q2o and telling
 * them the truth, which is four.
 */
const ONE_PAIR_BAR = 0.9;

/** One group of outs that make the same kind of hand. */
export interface OutGroup {
  /** The cards themselves, so the UI can show them if it wants. */
  cards: Card[];
  /** "the four 3s", "nine hearts", "three queens". */
  cardsLabel: string;
  /** What they make: "a straight", "top pair". */
  makes: string;
  /**
   * Set when the hand this makes is the losing end of it — a straight any
   * higher card also completes, or a low flush. The most valuable thing the
   * count can tell you, and the thing that cost the Q2o hand 100 bb.
   */
  caution?: string;
}

export interface OutsResult {
  /** Cards that turn a losing hand into a winning one. */
  count: number;
  groups: OutGroup[];
  /** True when the hero is already ahead of most of the range. */
  ahead: boolean;
  /** Share of the opponents' hands the hero currently beats. */
  share: number;
  /** How often the biggest group of outs still wins once it arrives. */
  holdUp?: number;
}

/** "the four 3s" / "nine hearts" / "two cards" for a mixed group. */
function nameCards(cards: number[]): string {
  const n = cards.length;
  const count = COUNT_WORDS[n] ?? String(n);
  const byRank = new Map<number, number>();
  for (const c of cards) byRank.set(rankOf(c), (byRank.get(rankOf(c)) ?? 0) + 1);
  const suits = new Set(cards.map(suitOf));

  // All one suit is a flush draw: "nine hearts" beats listing nine ranks.
  if (suits.size === 1 && byRank.size > 2) return `${count} ${SUIT_PLURALS[[...suits][0]]}`;

  // Otherwise name the ranks, which is how a player counts them: "the four
  // 3s", "three 9s and three 8s", "the four 5s and four 10s".
  if (byRank.size <= 3) {
    const parts = [...byRank.entries()].map(
      ([r, k]) => `${k === 4 ? "the " : ""}${COUNT_WORDS[k] ?? k} ${RANK_PLURALS[r - 2]}`,
    );
    const last = parts.pop()!;
    return parts.length ? `${parts.join(", ")} and ${last}` : last;
  }
  if (suits.size === 1) return `${count} ${SUIT_PLURALS[[...suits][0]]}`;
  return `${count} cards`;
}

/** Plain name for what the improved hand is. */
function makesName(h: EvaluatedHand): string {
  const n = h.name.toLowerCase();
  if (n.startsWith("straight flush") || n.startsWith("royal")) return "a straight flush";
  if (n.startsWith("four of a kind")) return "four of a kind";
  if (n.startsWith("full house")) return "a full house";
  if (n.startsWith("flush")) return "a flush";
  if (n.startsWith("straight")) return "a straight";
  if (n.startsWith("three of a kind")) return "three of a kind";
  if (n.startsWith("two pair")) return "two pair";
  if (n.startsWith("pair")) return "a pair";
  return h.name.toLowerCase();
}

/**
 * Is this straight the losing end — would a card the hero does not hold make
 * a bigger one for somebody else? Drawing to the bottom end is the trap the
 * 2/4 rule alone never warns you about.
 */
function straightCaution(hero: IntCombo, board: number[], card: number): string | undefined {
  const made = evaluateInts([hero[0], hero[1], ...board, card]);
  if (!made.name.toLowerCase().startsWith("straight")) return undefined;
  const mine = made.score;
  // Any two cards somebody else could hold that beat this straight on the
  // same board — if one exists, the hero is drawing to the low end.
  const seen = new Set<number>([hero[0], hero[1], ...board, card]);
  const free: number[] = [];
  for (let i = 0; i < 52; i++) if (!seen.has(i)) free.push(i);
  for (let a = 0; a < free.length; a++) {
    for (let b = a + 1; b < free.length; b++) {
      const theirs = evaluateInts([free[a], free[b], ...board, card]);
      if (theirs.score > mine && theirs.name.toLowerCase().startsWith("straight")) {
        return "it is the low end — a higher straight is possible on that card";
      }
    }
  }
  return undefined;
}

/** Is this flush beatable by a higher one of the same suit? */
function flushCaution(hero: IntCombo, board: number[], card: number): string | undefined {
  const made = evaluateInts([hero[0], hero[1], ...board, card]);
  if (!made.name.toLowerCase().startsWith("flush")) return undefined;
  const suit = suitOf(card);
  const mineHigh = Math.max(
    ...[hero[0], hero[1]].filter((c) => suitOf(c) === suit).map(rankOf),
    -1,
  );
  const seen = new Set<number>([hero[0], hero[1], ...board, card]);
  for (let r = mineHigh + 1; r < 13; r++) {
    const higher = r * 4 + suit;
    if (!seen.has(higher)) return "a higher card of that suit beats it";
  }
  return undefined;
}

/**
 * Count the hero's outs against the hands the opponents are actually holding.
 *
 * `ranges` is one range per opponent still in the hand. The hero is "ahead"
 * when they already beat more than half of those hands; a card is an out when
 * it flips them from behind to ahead. Cost is one evaluation per unseen card
 * per sampled opponent hand, which is why the range is capped: the answer only
 * has to be right to the nearest out.
 */
export function countOuts(
  hero: IntCombo,
  board: number[],
  ranges: IntCombo[][],
  sampleCap = 120,
): OutsResult {
  const empty: OutsResult = { count: 0, groups: [], ahead: false, share: 0.5 };
  if (board.length < 3 || board.length > 4) return empty;

  const used = new Set<number>([hero[0], hero[1], ...board]);
  // One pooled set of opponent hands: outs are about "do I beat what they
  // have", and which seat holds it does not change the count.
  const pool: IntCombo[] = [];
  for (const r of ranges) {
    for (const c of r) if (!used.has(c[0]) && !used.has(c[1])) pool.push(c);
  }
  if (pool.length === 0) return empty;
  // Evenly thin a large range rather than taking the first N, which would be
  // sorted by label and bias toward one corner of the grid.
  const step = Math.max(1, Math.ceil(pool.length / sampleCap));
  const sample: IntCombo[] = [];
  for (let i = 0; i < pool.length; i += step) sample.push(pool[i]);

  const beats = (extra: number[]) => {
    const mine = evaluateInts([hero[0], hero[1], ...board, ...extra]).score;
    let ahead = 0;
    let counted = 0;
    for (const c of sample) {
      // A hand that needs the card we are testing cannot be held, so it is
      // out of the comparison entirely rather than counted as a loss.
      if (extra.some((e) => e === c[0] || e === c[1])) continue;
      counted++;
      if (mine > evaluateInts([c[0], c[1], ...board, ...extra]).score) ahead++;
    }
    return counted ? ahead / counted : 0;
  };
  // Beating one opponent is not beating three: a hand has to get past all of
  // them, so the shares multiply.
  const beatsAll = (extra: number[]) => Math.pow(beats(extra), Math.max(1, ranges.length));

  // Beating half their hands by a nose is not "ahead" — a flush draw that is
  // nominally 50% still wants its outs counted. An out has to clear the same
  // bar, so a blank that nudges a coin-flip over 50% is not mistaken for one.
  const share = beatsAll([]);
  if (share >= AHEAD_BAR) return { count: 0, groups: [], ahead: true, share };

  const winners: number[] = [];
  for (let c = 0; c < 52; c++) {
    if (used.has(c)) continue;
    const after = evaluateInts([hero[0], hero[1], ...board, c]);
    const onePair = after.name.toLowerCase().startsWith("pair");
    if (beatsAll([c]) >= (onePair ? ONE_PAIR_BAR : AHEAD_BAR)) winners.push(c);
  }
  if (winners.length === 0) return { count: 0, groups: [], ahead: false, share };

  // Group by the hand each card makes, so the count reads as poker rather
  // than as a list of 47 cards.
  const byMakes = new Map<string, number[]>();
  for (const c of winners) {
    const key = makesName(evaluateInts([hero[0], hero[1], ...board, c]));
    const list = byMakes.get(key);
    if (list) list.push(c);
    else byMakes.set(key, [c]);
  }

  const groups: OutGroup[] = [];
  for (const [makes, cards] of byMakes) {
    // An open-ended draw can have one end that wins and one that does not,
    // so the warning has to describe the group rather than its first card.
    const flagged = cards.filter(
      (c) => straightCaution(hero, board, c) ?? flushCaution(hero, board, c),
    );
    const sample = flagged.length
      ? (straightCaution(hero, board, flagged[0]) ?? flushCaution(hero, board, flagged[0]))
      : undefined;
    const caution =
      flagged.length === 0
        ? undefined
        : flagged.length === cards.length
          ? sample
          : "the low ones can still lose to a better version of the same hand";
    groups.push({
      cards: cards.map(intToCard),
      cardsLabel: nameCards(cards),
      makes,
      caution,
    });
  }
  // Biggest groups first — that is the draw the player is really on.
  groups.sort((a, b) => b.cards.length - a.cards.length);

  // How often the headline out actually holds up once it lands. Four outs you
  // only win four times in five with are not really four outs, and this is
  // exactly what a draw to the small end of a straight hides.
  const head = groups[0];
  const holdUp = head ? beatsAll([cardToInt(head.cards[0])]) : 1;

  return { count: winners.length, groups, ahead: false, share, holdUp };
}

/** "four outs — the four 3s make a straight, but it is the low end". */
export function describeOuts(o: OutsResult): string {
  if (o.ahead || o.count === 0) return "";
  const n = COUNT_WORDS[o.count] ?? String(o.count);
  const parts = o.groups.map((g) => {
    const base = `${g.cardsLabel} make ${g.makes}`;
    return g.caution ? `${base} — though ${g.caution}` : base;
  });
  return `${n} out${o.count === 1 ? "" : "s"}: ${parts.join("; ")}`;
}

/** The 2/4 rule the app teaches, as a percentage. */
export function ruleOfTwoFour(outs: number, cardsToCome: number): number {
  return Math.min(1, (outs * (cardsToCome >= 2 ? 4 : 2)) / 100);
}

export type { Card };
