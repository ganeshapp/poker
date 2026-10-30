/**
 * Reading the other players — including the hero.
 *
 * Five strangers sit down. None of them knows you. Over an hour they watch
 * what you do, form an opinion, and start playing back at you — each in their
 * own way, because they are not the same person. Then the session ends, the
 * table breaks, and the next one starts from nothing.
 *
 * Everything here is built from facts anybody at the table could see: the
 * price somebody faced, what they did about it, and the hands they turned
 * over. No hole-card peeking, no omniscience.
 */
import type { HandLabel, Player, Position } from "../types/poker.ts";
import { buildPreflopRanges, topPercentRange } from "../engine/ranges.ts";

/** How hard the table plays back. */
export type TableDifficulty = "casual" | "regular" | "tough";

/** What one seat has shown you so far. */
export interface Read {
  /** Hands watched — everything below is worthless without it. */
  hands: number;
  /** 0 → "no idea who this is", 1 → "I have seen plenty". */
  confidence: number;
  vpip: number;
  pfr: number;
  threeBet: number;
  foldToRaise: number;
  foldTo3Bet: number;
  foldToCbet: number;
  cbet: number;
  postAggro: number;
  wtsd: number;
  /** The label a human would reach for, once they have seen enough. */
  style: "unknown" | "rock" | "nit" | "tight" | "solid" | "loose" | "maniac" | "station";
}

const r = (a: number, b: number, dflt: number) => (b > 0 ? a / b : dflt);

/**
 * How much weight to give a statistic given how often it has been tested.
 * Ten observations is roughly the point a person says "he keeps doing that";
 * a handful is still a coincidence.
 */
function weight(n: number, full = 12): number {
  if (n <= 0) return 0;
  return Math.min(1, n / full);
}

export function readPlayer(p: Player): Read {
  const hands = p.handsSeen;
  const vpip = r(p.vpipCount, hands, 0.25);
  const pfr = r(p.pfrCount, hands, 0.18);
  const postAggro = r(p.postAggroCount, p.postActionCount, 0.4);
  const read: Read = {
    hands,
    confidence: weight(hands, 25),
    vpip,
    pfr,
    threeBet: r(p.threeBetCount, p.threeBetOpp, 0.07),
    foldToRaise: r(p.foldToRaiseCount, p.faceRaiseCount, 0.6),
    foldTo3Bet: r(p.foldTo3BetCount, p.face3BetCount, 0.6),
    foldToCbet: r(p.foldToCbetCount, p.faceCbetCount, 0.5),
    cbet: r(p.cbetCount, p.cbetOpp, 0.6),
    postAggro,
    wtsd: r(p.showdownCount, p.sawFlopCount, 0.3),
    style: "unknown",
  };

  if (hands >= 12) {
    const loose = vpip > 0.4;
    const veryLoose = vpip > 0.6;
    // Passive means passive overall. Someone raising half their hands
    // before the flop is not a calling station, whatever they do after it.
    const passive = postAggro < 0.3 && pfr < 0.3;
    if (veryLoose && pfr > 0.35) read.style = "maniac";
    else if (loose && passive) read.style = "station";
    else if (veryLoose) read.style = "maniac";
    else if (loose) read.style = "loose";
    else if (vpip < 0.12) read.style = "rock";
    else if (vpip < 0.18) read.style = "nit";
    else if (vpip < 0.24) read.style = "tight";
    else read.style = "solid";
  }
  return read;
}

/**
 * The hands this player is likely holding, from what they have actually been
 * doing — not from a label stuck on them at the start of the session.
 *
 * `action` is what they just did pre-flop, which is the strongest single
 * piece of evidence: a raise is the top of their range, a call is the middle,
 * a re-raise is the very top.
 */
export function inferredPreflopRange(
  p: Player,
  pos: Position,
  action: "open" | "call" | "threebet" | "defend",
): HandLabel[] {
  const read = readPlayer(p);
  // Until there is a sample, fall back to a sane default rather than
  // pretending to know: a typical opening range, not "any two cards".
  const vpip = read.confidence > 0.2 ? read.vpip : 0.26;
  const pfr = read.confidence > 0.2 ? read.pfr : 0.19;
  const ranges = buildPreflopRanges(vpip * 100, pfr * 100, pos);

  switch (action) {
    case "threebet": {
      // Re-raising range: scaled by how often they actually do it, floored
      // so a maniac's 3-bet is still wide and a rock's is still premium.
      const pct = Math.max(2.5, Math.min(30, read.threeBet * 100 * 1.6));
      return [...topPercentRange(pct)];
    }
    case "open":
      return [...ranges.raise];
    case "call":
    case "defend":
    default: {
      // Calling range: what they play minus the top they would have raised.
      const flat = [...ranges.play].filter((l) => !ranges.raise.has(l));
      return flat.length >= 6 ? flat : [...ranges.play];
    }
  }
}

/* ------------------------------------------------------------- adaptation */

/** The knobs a bot turns once it thinks it has somebody figured out. */
export interface Adjustment {
  /** Multiplier on how often it bets or raises at this player. */
  aggression: number;
  /** Multiplier on how willing it is to call them down. */
  stickiness: number;
  /** Multiplier on how wide it defends against their raises. */
  defend: number;
  /** Multiplier on how often it re-raises them. */
  threebet: number;
  /** One line, in the bot's own voice, about what it has noticed. */
  note: string | null;
}

export const NO_ADJUSTMENT: Adjustment = {
  aggression: 1,
  stickiness: 1,
  defend: 1,
  threebet: 1,
  note: null,
};

const DIFFICULTY: Record<TableDifficulty, { gain: number; patience: number }> = {
  // `gain` scales how far they move; `patience` how long before they move.
  casual: { gain: 0.45, patience: 1.8 },
  regular: { gain: 1, patience: 1 },
  tough: { gain: 1.55, patience: 0.6 },
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * How often to ignore the read and just play straight — the explore arm.
 *
 * A bot that acts on a read every single time has two problems. It can be
 * read back, because its own behaviour becomes a function of yours. And it
 * never finds out when the read goes stale: having decided you fold to
 * continuation bets, it bets at you forever and never learns that you stopped.
 *
 * So it probes. Early in a session there is nothing to lose — it has no read
 * worth protecting, so it tests constantly. As the read firms up, probing gets
 * expensive and the rate decays. It never reaches zero: the last few percent
 * are what stop you from reverse-engineering the thing.
 *
 * Tough tables probe least, because they settle on the right read fastest and
 * waste the fewest chips finding out. Casual tables keep poking at it.
 */
export function exploreRate(read: Read, difficulty: TableDifficulty = "regular"): number {
  const floor = difficulty === "tough" ? 0.07 : difficulty === "casual" ? 0.17 : 0.11;
  return floor + (1 - read.confidence) * 0.2;
}

/**
 * What this particular opponent makes of that particular player.
 *
 * Each archetype watches a different thing, because people do. The Nit is
 * looking for whether you are stealing from them; the Station is slowly
 * working out that your bets mean something; the LAG is hunting for somebody
 * who folds; the TAG is doing all of it, moderately. None of them turns into
 * the same player — they stay themselves and lean.
 */
export function adjustmentFor(
  archetype: Player["archetype"],
  target: Player,
  difficulty: TableDifficulty = "regular",
): Adjustment {
  const read = readPlayer(target);
  const { gain, patience } = DIFFICULTY[difficulty];
  // Nobody reacts to two hands. Confidence has to clear the patience bar.
  const c = clamp((read.confidence - 0.15 * patience) / (1 - 0.15 * patience), 0, 1) * gain;
  if (c <= 0.05) return NO_ADJUSTMENT;

  const a = { ...NO_ADJUSTMENT };
  const lean = (base: number, amount: number) => base + amount * c;
  // The dials may lean early, but nobody says "he keeps doing that" after
  // six hands. The sentence waits until the read is worth stating.
  const spoken = (s: string) => (c >= 0.3 ? s : null);

  switch (archetype) {
    case "Nit": {
      // Tight players notice one thing above all: somebody picking on them.
      if (read.pfr > 0.3 || read.threeBet > 0.18) {
        a.defend = lean(1, 0.55);
        a.threebet = lean(1, 0.8);
        // Deliberately NOT stickier. Somebody raising every pot before the
        // flop is not necessarily betting light after it, and calling them
        // down wider was measurably the most expensive thing the table did:
        // it paid off their value hands while the wider defence was already
        // costing chips out of position.
        a.note = spoken(`${target.name} raises a lot — I have to stop folding every time.`);
      }
      // But they still believe a quiet player completely.
      if (read.postAggro < 0.25 && read.hands >= 15) {
        a.stickiness = lean(1, -0.3);
        a.note = a.note ?? spoken(`${target.name} only bets when they have it.`);
      }
      break;
    }
    case "Station": {
      // Calling stations do not stop calling. What they eventually learn is
      // which player's bets are always real — and stop paying that one off.
      if (read.postAggro < 0.35 && read.hands >= 18) {
        a.stickiness = lean(1, -0.45);
        a.note = spoken(`${target.name} does not bluff. I keep paying them off.`);
      }
      if (read.postAggro > 0.6) {
        a.stickiness = lean(1, 0.2);
        a.note = a.note ?? spoken(`${target.name} bets at everything.`);
      }
      break;
    }
    case "LAG": {
      // Hunting for somebody who folds. Fastest to react, least disciplined.
      if (read.foldToCbet >= 0.5 || read.foldToRaise >= 0.68) {
        a.aggression = lean(1, 0.7);
        a.threebet = lean(1, 0.9);
        a.note = spoken(`${target.name} folds too much — I can bet at them relentlessly.`);
      }
      if (read.foldToCbet < 0.3 && read.hands >= 15) {
        a.aggression = lean(1, -0.35);
        a.stickiness = lean(1, 0.25);
        a.note = a.note ?? spoken(`${target.name} never folds. Stop bluffing them.`);
      }
      break;
    }
    default: {
      // TAG: reads everything, moves moderately, in the right direction.
      if (read.foldToCbet > 0.55) {
        a.aggression = lean(1, 0.4);
        a.note = spoken(`${target.name} folds to most continuation bets.`);
      } else if (read.foldToCbet < 0.3 && read.hands >= 15) {
        a.aggression = lean(1, -0.3);
        a.stickiness = lean(1, 0.2);
        a.note = spoken(`${target.name} calls down light — value bet, do not bluff.`);
      }
      if (read.threeBet > 0.2) {
        a.defend *= lean(1, 0.5);
        a.threebet *= lean(1, 0.6);
        a.note = a.note ?? spoken(`${target.name} re-raises constantly — I can play back.`);
      }
      if (read.vpip > 0.45) {
        a.defend *= lean(1, 0.35);
        a.note = a.note ?? spoken(`${target.name} plays almost every hand.`);
      }
      break;
    }
  }

  // Somebody who folds to most bets is not defending light. So on the
  // occasions they DO put money in, it is real — and the right response is to
  // believe them more, not less. Without this, reading a player as a folder
  // only makes a bot bet harder at them, which is half a read: it collects the
  // small pots and then pays off every big one.
  if (read.foldToCbet > 0.5 && read.hands >= 12) {
    a.stickiness *= 1 - 0.35 * c;
  }

  // NOTE: the mirror rule — "stop believing a player who bets at everything" —
  // was tried and measurably HURT, because `postAggro` lumps pre-flop
  // aggression in with post-flop follow-through, so a player who raises every
  // pot and then only bets made hands reads as a bluffer and gets paid off.
  // Telling those two apart needs a post-flop-only aggression read against
  // what the player actually turns over, which is what `shownHands` is for.

  // A chart written for somebody opening one hand in five is the wrong chart
  // against somebody opening three in five. Scale by how far off they are.
  if (read.pfr > 0.26 && read.hands >= 12) {
    const timesWider = clamp(read.pfr / 0.2, 1, 3.2);
    a.defend *= 1 + (timesWider - 1) * 0.55 * c;
  }

  a.aggression = clamp(a.aggression, 0.4, 2.2);
  a.stickiness = clamp(a.stickiness, 0.45, 1.8);
  // Capped well short of the old 3.0. Tripling a defending range is not a
  // real adjustment: the hands it brings in are played out of position with
  // poor equity realisation, and the measured cost at showdown swamped
  // everything the wider defence won before the flop.
  a.defend = clamp(a.defend, 0.6, 1.9);
  a.threebet = clamp(a.threebet, 0.5, 2.6);
  return a;
}
