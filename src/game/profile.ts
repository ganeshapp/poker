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
import type { Archetype, HandLabel, Player, Position } from "../types/poker.ts";
import { buildPreflopRanges, topPercentRange } from "../engine/ranges.ts";
import { hashSeed } from "../engine/equity.ts";

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
  /** Recency-weighted count of c-bets faced — how much the fold rate is
   *  worth trusting, as opposed to what it says. */
  faceCbetWeight: number;
  /** The label a human would reach for, once they have seen enough. */
  style: "unknown" | "rock" | "nit" | "tight" | "solid" | "loose" | "maniac" | "station";
}

/** A rate, or `dflt` when nothing has been observed. Operates on the decayed
 *  float accumulators, so `b` is a weight rather than a count. */
const r = (a: number, b: number, dflt: number) => (b > 1e-9 ? a / b : dflt);

/**
 * How much weight to give a statistic given how often it has been tested.
 * Ten observations is roughly the point a person says "he keeps doing that";
 * a handful is still a coincidence.
 */
function weight(n: number, full = 12): number {
  if (n <= 0) return 0;
  return Math.min(1, n / full);
}

/** Below this many hands, no label — the numbers are noise. */
export const STYLE_MIN_HANDS = 12;

/**
 * The label a human would put on these numbers.
 *
 * One definition, used by the bots to read the table and by the Stats page to
 * tell the player how they have been playing. Two copies of these thresholds
 * would mean the app could call you a TAG while the bots treated you as a
 * station.
 */
export function classifyStyle(
  vpip: number,
  pfr: number,
  postAggro: number,
): Read["style"] {
  const loose = vpip > 0.4;
  const veryLoose = vpip > 0.6;
  // Passive means passive overall. Someone raising half their hands before
  // the flop is not a calling station, whatever they do after it.
  const passive = postAggro < 0.3 && pfr < 0.3;
  if (veryLoose && pfr > 0.35) return "maniac";
  if (loose && passive) return "station";
  if (veryLoose) return "maniac";
  if (loose) return "loose";
  if (vpip < 0.12) return "rock";
  if (vpip < 0.18) return "nit";
  if (vpip < 0.24) return "tight";
  return "solid";
}

export function readPlayer(p: Player): Read {
  // Every rate comes from the RECENCY-WEIGHTED window, not the lifetime
  // counters. Opponents change gear — somebody folds for thirty hands, then
  // picks up chips and starts playing back — and a cumulative average cannot
  // see it happen. `handsSeen` is still the sample size for confidence,
  // because trust should grow with how long you have been watching even
  // though the rates themselves only describe recent hands.
  const w = p.recent;
  const hands = p.handsSeen;
  const vpip = r(w.vpip, w.hands, 0.25);
  const pfr = r(w.pfr, w.hands, 0.18);
  const postAggro = r(w.postAggro, w.postAction, 0.4);
  const read: Read = {
    hands,
    confidence: weight(hands, 25),
    vpip,
    pfr,
    threeBet: r(w.threeBet, w.threeBetOpp, 0.07),
    foldToRaise: r(w.foldToRaise, w.faceRaise, 0.6),
    foldTo3Bet: r(w.foldTo3Bet, w.face3Bet, 0.6),
    foldToCbet: r(w.foldToCbet, w.faceCbet, 0.5),
    cbet: r(w.cbet, w.cbetOpp, 0.6),
    postAggro,
    wtsd: r(w.showdown, w.sawFlop, 0.3),
    faceCbetWeight: w.faceCbet,
    style: "unknown",
  };

  if (hands >= STYLE_MIN_HANDS) read.style = classifyStyle(vpip, pfr, postAggro);
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
 * What the table thinks this player is, as probabilities rather than a label.
 *
 * Nobody sits down knowing the others are a TAG and two stations. They watch,
 * and they form an opinion that firms up and sometimes changes. So this starts
 * at a flat 25% each and moves as the evidence comes in — "80% station, 5% nit"
 * rather than "station".
 *
 * Built only from the recency-weighted read, so a player who changes gear gets
 * re-assessed instead of being stuck with what they did an hour ago. The
 * declared archetype is never consulted; the bots genuinely do not know it.
 */
export type StyleBelief = Record<Archetype, number>;

/** What each archetype looks like from the outside: VPIP, PFR, post-flop
 *  aggression. The yardstick the observed numbers are compared against. */
const ARCHETYPE_SHAPE: Record<Archetype, { vpip: number; pfr: number; aggro: number }> = {
  TAG: { vpip: 0.22, pfr: 0.18, aggro: 0.55 },
  LAG: { vpip: 0.34, pfr: 0.27, aggro: 0.68 },
  Nit: { vpip: 0.12, pfr: 0.09, aggro: 0.4 },
  Station: { vpip: 0.46, pfr: 0.07, aggro: 0.18 },
};

const ARCHETYPE_KEYS: Archetype[] = ["TAG", "LAG", "Nit", "Station"];

export function archetypeBelief(p: Player): StyleBelief {
  const read = readPlayer(p);
  const flat = 1 / ARCHETYPE_KEYS.length;
  // Nothing watched yet: no opinion. Saying "probably a TAG" after two hands
  // would be worse than admitting there is no read.
  if (read.confidence <= 0.02) {
    return { TAG: flat, LAG: flat, Nit: flat, Station: flat } as StyleBelief;
  }
  // Sharpness grows with the sample, so early evidence nudges and later
  // evidence decides. Without this a single loose hand reads as a maniac.
  const sharpness = 1 + 7 * read.confidence;
  const scores: Record<string, number> = {};
  let total = 0;
  for (const a of ARCHETYPE_KEYS) {
    const shape = ARCHETYPE_SHAPE[a];
    // Squared error over the three signals that actually separate the four,
    // with PFR weighted hardest: it is what tells a station from a LAG, both
    // of whom play a lot of hands.
    const d =
      ((read.vpip - shape.vpip) / 0.18) ** 2 +
      (((read.pfr - shape.pfr) / 0.12) ** 2) * 1.5 +
      ((read.postAggro - shape.aggro) / 0.3) ** 2;
    const s = Math.exp(-d * sharpness * 0.5);
    scores[a] = s;
    total += s;
  }
  const out = {} as StyleBelief;
  // Degenerate case: nothing fits at all. Fall back to no opinion rather
  // than dividing by zero.
  if (total <= 1e-12) {
    for (const a of ARCHETYPE_KEYS) out[a] = flat;
    return out;
  }
  for (const a of ARCHETYPE_KEYS) out[a] = scores[a] / total;
  return out;
}

/**
 * How willing this player is to let a bet go through, as a multiplier on how
 * often it is worth bluffing at them.
 *
 * Someone who folds to most continuation bets is worth firing at relentlessly.
 * Someone who never folds is not worth bluffing at all — value-bet them
 * instead. With no read yet, assume an ordinary opponent rather than either
 * extreme.
 */
function foldability(p: Player): number {
  const read = readPlayer(p);
  // Two sources, because each is weak alone. The direct observation is the
  // better evidence once there is enough of it; the archetype belief covers
  // the early hands, where a station who has not yet been bet at still looks
  // like everybody else.
  const belief = archetypeBelief(p);
  const expected =
    belief.Station * 0.2 + belief.Nit * 0.72 + belief.TAG * 0.55 + belief.LAG * 0.42;
  const seen = read.foldToCbet;
  const trust = clamp(read.faceCbetWeight / 8, 0, 1);
  const f = seen * trust + expected * (1 - trust);
  // 0.8 folds → 1.6x; 0.5 → 1.0x; 0.2 → 0.4x.
  return clamp(f * 2, 0.35, 1.7);
}

/**
 * Whether a bluff is worth running against the people still in the hand.
 *
 * A bluff has to get through EVERYBODY, so the stickiest live opponent sets
 * the price: two nits are easy to bluff, one calling station makes it
 * hopeless no matter who else is in. That is why this takes the minimum over
 * the field rather than looking at one nominated villain — and why a flat
 * "bluff less multiway" damping is the wrong shape, since it cannot tell
 * three folders apart from one station.
 */
export function bluffViability(
  opponents: Player[],
  difficulty: TableDifficulty = "regular",
): number {
  const live = opponents.filter((q) => !q.hasFolded && !q.sittingOut);
  if (live.length === 0) return 0;
  let worst = Infinity;
  for (const q of live) worst = Math.min(worst, foldability(q));
  // Each extra body is another hand that has to miss, on top of whoever is
  // hardest to move. Milder than 1/n, because who they are matters more than
  // how many: 1/n says bluffing three nits is hopeless, and it is not.
  const crowd = 1 / (1 + (live.length - 1) * 0.45);
  // A tougher table is better at picking the moment, not more reckless.
  const { gain } = DIFFICULTY[difficulty];
  const sharpen = 1 + (worst - 1) * 0.35 * Math.min(gain, 1.3);
  return clamp(worst * crowd * sharpen, 0.1, 1.8);
}

/** What a seat has learned about bluffing, this session. */
export interface BluffPolicy {
  /** Multiplier on how often to try it. */
  frequency: number;
  /**
   * The least equity a hand needs before it counts as a bluffing candidate.
   * Zero means anything will do — 2-6 offsuit included. It climbs when the
   * bluffs keep getting caught, so the bot falls back on hands that have
   * something going for them instead of pure air.
   */
  minEquity: number;
  attempts: number;
  successRate: number;
}

/**
 * The bluffing bandit.
 *
 * A fixed bluff rate is a rate somebody can work out and then simply call.
 * So the rate is not fixed: the bot tries it, watches what happens, and moves.
 * Getting through means it can afford to do it more often and with worse
 * hands; getting caught means it does it less and needs a hand with some
 * equity behind it. Both dials move, because a human caught bluffing twice
 * does not only slow down, they also stop doing it with total air.
 *
 * The archetype sets the prior and nothing more. That part is who the bot is,
 * and it is also what stops a session of bad luck turning a Nit into a maniac.
 */
export function bluffPolicy(p: Player): BluffPolicy {
  const attempts = p.bluffAttempts;
  // Beta-style smoothing: with no history the archetype's prior stands, and
  // it takes a run of real evidence to move far from it.
  // Four, not six. Two properties pull against each other here: a bot that
  // opens a session firing at a table full of callers should notice inside
  // ten hands rather than forty, because the money it loses learning is money
  // it does not get back — but one caught bluff must not rewrite the policy
  // either. Four is where a single bad outcome moves the rate under a fifth,
  // and twenty hands of evidence all but replaces the prior. Both are pinned
  // by tests.
  const PRIOR_WEIGHT = 4;
  const PRIOR_RATE = 0.5;
  const rate = (p.bluffWins + PRIOR_WEIGHT * PRIOR_RATE) / (attempts + PRIOR_WEIGHT);
  // What the bluffing has actually been WORTH, in big blinds per attempt,
  // smoothed toward zero so one big pot does not decide the policy.
  //
  // This is the number that matters, not the success rate. How often a bluff
  // got through misses the asymmetry: the ones that work win a small pot and
  // the ones that get called lose a big one, so a bot can get through 43% of
  // the time and still be setting money on fire. It was — the exploiter's
  // showdown winnings went from 23 to 125 bb/100 when the rate alone drove
  // this, because bots kept firing into a player who only ever continued
  // with the goods.
  // Smoothed harder than the success rate, because chip results are far
  // noisier than fold counts: one big pot is worth twenty folds. With eight
  // phantom break-even attempts in the denominator, a single caught bluff
  // moves the rate about a seventh, while forty hands of real evidence moves
  // it most of the way. Both ends are pinned by tests.
  const NET_PRIOR = 8;
  const meanNet = p.bluffNetBb / (attempts + NET_PRIOR);
  // About 3bb per attempt either way covers the useful range.
  const edge = clamp(1 + meanNet / 3, 0.3, 1.9);
  return {
    // The LEARNED multiplier only. How foldable the field is is a separate
    // factor applied once at the call site — folding both in here double
    // counts it, which is quietly how bluffing got suppressed to nothing.
    frequency: edge,
    // Caught more often than break-even → demand equity. The ceiling is 0.32
    // because past that there is nothing left to bluff with: the branch is
    // only reached with a weak hand in the first place.
    minEquity: clamp((1 - edge) * 0.42, 0, 0.32),
    attempts,
    successRate: rate,
  };
}

/**
 * Does this seat run a bluff on THIS hand at all?
 *
 * Decided once per hand from a deterministic seed rather than re-rolled every
 * street. That is what produces barrels: a bot that fires the flop keeps
 * firing the turn instead of tossing a fresh coin, so "bet, check, bet" stops
 * being a reliable tell and you are left guessing whether the story is real.
 *
 * Stateless on purpose — nothing to serialise, and both languages compute the
 * same answer from the same FNV-1a hash.
 */
export function bluffsThisHand(
  handNumber: number,
  seat: number,
  rate: number,
): boolean {
  if (rate <= 0) return false;
  if (rate >= 1) return true;
  // FNV-1a leaves its top bits almost untouched by a one-character change, so
  // seat 1 and seat 2 in the same hand came out the same 97% of the time —
  // every bot at the table bluffing on the same hands. Finalise the hash
  // before using it as a probability.
  let h = hashSeed(`bluff:${handNumber}:${seat}`);
  h = (h ^ (h >>> 15)) >>> 0;
  h = Math.imul(h, 0x2c1b3c6d) >>> 0;
  h = (h ^ (h >>> 12)) >>> 0;
  h = Math.imul(h, 0x297a2d39) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  return h / 0x100000000 < rate;
}

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
