import type { Action, Archetype, Card, GameState, HandLabel, Position } from "../types/poker.ts";
import { legalActions } from "./engine.ts";
import { ARCHETYPES } from "./archetypes.ts";
import { allLabels, cardsToLabel, labelToCombos } from "../engine/notation.ts";
import { equityVsRandom, equityVsRange, equityVsRanges, comboToInts, hashSeed } from "../engine/equity.ts";
import { evaluateInts } from "../engine/evaluator.ts";
import { cardToInt } from "../engine/cards.ts";
import { PREFLOP_100 } from "../data/preflop.ts";
import {
  adjustmentFor,
  bluffPolicy,
  bluffsThisHand,
  bluffViability,
  exploreRate,
  inferredPreflopRange,
  readPlayer,
  type Adjustment,
} from "./profile.ts";
import { topPercentRange, chartWidth, strengthRankMap, positionMultiplier } from "../engine/ranges.ts";

/* ==================================================================
   Bot decision policy.

   Preflop: the real 100bb baseline charts (src/data/preflop.ts) drive
   open / 3-bet / call / fold, with each archetype applying principled
   deviations (Nit continues tighter, Station calls wide but rarely
   raises, LAG adds bluffs) — bots are exploitable BY DESIGN, never
   absurd: premiums never fold preflop, junk never stacks off cold.
   Postflop: Monte-Carlo hand strength (TS engine, fast + synchronous)
   combined with the archetype's aggression and "stickiness" knobs.
   Also returns the perceived range it is representing, which the
   store records for the Peek feature.
   ================================================================== */

interface PreflopDials {
  open: number; // multiplier on RFI frequencies
  threebet: number; // multiplier on 3-bet frequencies
  call: number; // multiplier on calling frequencies
  limpWide: boolean; // limps playable-but-not-opened hands when cheap
}

const DIALS: Record<Archetype, PreflopDials> = {
  TAG: { open: 1.0, threebet: 1.0, call: 1.0, limpWide: false },
  LAG: { open: 1.3, threebet: 1.6, call: 1.15, limpWide: true },
  Nit: { open: 0.7, threebet: 0.55, call: 0.8, limpWide: false },
  Station: { open: 0.45, threebet: 0.3, call: 1.6, limpWide: true },
};

/**
 * The share of hands each archetype designates as bluffing hands.
 *
 * Scaled at the table by how foldable the field actually is, so these are the
 * rate against an ordinary opponent, not a floor. The spread is the point: if
 * a Nit bets, you should believe it, and if a LAG bets you should not.
 */
const BLUFF_HANDS: Record<Archetype, number> = {
  TAG: 0.3,
  LAG: 0.45,
  Nit: 0.12,
  Station: 0.06,
};

/** Hands that never fold preflop, whatever the price. */
const PREMIUM = new Set<HandLabel>(["AA", "KK", "QQ", "AKs", "AKo"] as HandLabel[]);
const PREMIUM_LIST = [...PREMIUM];

/** Labels a chart plays at least `min` of the time (perceived-range lists). */
function chartLabels(chart: Record<string, number>, min: number): HandLabel[] {
  const out: HandLabel[] = [];
  for (const [l, f] of Object.entries(chart)) if (f >= min) out.push(l as HandLabel);
  return out;
}

export interface BotDecision {
  action: Action;
  /** Perceived holding range (grid labels). null = leave stored range unchanged. */
  range: HandLabel[] | null;
}

const ALL_LABELS = allLabels();

function clampInt(x: number, lo: number, hi: number): number {
  return Math.round(Math.max(lo, Math.min(hi, x)));
}

function setDiff(a: Set<HandLabel>, b: Set<HandLabel>): HandLabel[] {
  const out: HandLabel[] = [];
  for (const x of a) if (!b.has(x)) out.push(x);
  return out;
}

function betOrRaise(s: GameState, to: number): Action {
  return s.currentBet === 0 ? { type: "bet", amount: to } : { type: "raise", amount: to };
}

/** Bot decision plus the range it's representing. The stored range is
    guaranteed to contain the bot's actual hand whenever it continues —
    mixed-frequency actions would otherwise "prove" impossible holdings
    and corrupt Peek grading and the coach. */
export function decideBot(s: GameState, seat: number): BotDecision {
  const d = decideBotInner(s, seat);
  const p = s.players[seat];
  if (d.range != null && d.action.type !== "fold" && p.hole) {
    const label = cardsToLabel(p.hole[0], p.hole[1]);
    if (!d.range.includes(label)) d.range = [...d.range, label];
  }
  return d;
}

/**
 * The hands an opponent is likely holding right now.
 *
 * A bot that has been acting has a stored range (it narrows its own as it
 * plays). Anybody else — the hero above all — gets a range inferred from what
 * they have actually been doing this session. Before this existed the bots
 * measured every post-flop decision against RANDOM cards, which makes bottom
 * pair look like a 70% favourite and is why they could never fold.
 */
/**
 * Narrowing a hundred-odd labels against a board costs a Monte-Carlo run per
 * label, and every bot asks about every opponent on every decision — the same
 * question, with the same answer, several times per betting round. Cache it
 * for as long as the answer cannot have changed: same hand, same board, same
 * last thing that player did.
 */
const RANGE_MEMO = new Map<string, HandLabel[]>();
let RANGE_MEMO_HAND = -1;

function opponentRange(s: GameState, q: GameState["players"][number]): HandLabel[] {
  const stored = s.botRanges[q.id];
  if (stored && stored.length) return stored;
  const raisedPre = q.pfrThisHand === true;
  const action = raisedPre ? (s.aggressorPreflop === q.id ? "open" : "threebet") : "call";
  if (s.board.length === 0) return inferredPreflopRange(q, q.position, action);

  if (RANGE_MEMO_HAND !== s.handNumber) {
    RANGE_MEMO.clear();
    RANGE_MEMO_HAND = s.handNumber;
  }
  // What they have done on THIS board matters more than what they play in
  // general: somebody who plays every hand but only bets good ones has a
  // wide pre-flop range and a narrow betting range, and it is the betting
  // range you are up against.
  const label = q.lastAction?.label;
  const kind: "aggro" | "call" | "check" =
    label === "Bet" || label === "Raise" || label === "All-In"
      ? "aggro"
      : label === "Call"
        ? "call"
        : "check";
  const key = `${q.id}|${s.board.join("")}|${action}|${kind}|${q.handsSeen}`;
  const hit = RANGE_MEMO.get(key);
  if (hit) return hit;
  const out = narrowRange(inferredPreflopRange(q, q.position, action), s.board, kind, null);
  RANGE_MEMO.set(key, out);
  return out;
}

/**
 * The hands an archetype actually plays from a seat.
 *
 * The archetype table advertises a VPIP and a PFR. Those numbers used to be
 * decorative: play came from multipliers on the baseline chart, which
 * compressed all four archetypes into roughly the same tight player — a
 * "calling station" that folded 79% of its hands, and a table where only a
 * quarter of hands saw a flop. That is the real reason a loose player could
 * farm this table: three hands in four were being handed over before the flop.
 *
 * So the advertised numbers are the contract now. The chart still decides the
 * SHAPE — which hands are worth playing, in what order — and the archetype
 * decides the WIDTH. A Nit and a Station playing from the cutoff want the same
 * hands at the top; they disagree about where to stop.
 */
const RANGE_CACHE = new Map<string, { open: Set<HandLabel>; play: Set<HandLabel> }>();

const ALL_POSITIONS: Position[] = ["UTG", "MP", "CO", "BTN", "SB", "BB"];
const MEAN_POS_MULT =
  ALL_POSITIONS.reduce((a, p) => a + positionMultiplier(p), 0) / ALL_POSITIONS.length;

function combosFor(label: HandLabel): number {
  return label.length === 2 ? 6 : label.endsWith("s") ? 4 : 12;
}

function rangesFor(archetype: Archetype, pos: Position): { open: Set<HandLabel>; play: Set<HandLabel> } {
  const key = `${archetype}|${pos}`;
  const hit = RANGE_CACHE.get(key);
  if (hit) return hit;

  const cfg = ARCHETYPES[archetype];
  // The positional multipliers average 0.86, not 1, so using them raw shaves
  // a seventh off every advertised number. Normalise so the advertised VPIP is
  // what the archetype plays ACROSS the orbit, with position spreading it.
  const mult = positionMultiplier(pos) / MEAN_POS_MULT;
  // The charts are written for a solid player, so the TAG's advertised PFR is
  // the scale factor of 1: every other archetype opens that much wider or
  // tighter. Position comes from the chart itself, which already knows that
  // the button opens more than under the gun.
  const chart = PREFLOP_100.rfi[pos] ?? PREFLOP_100.rfi.SB;
  // chartWidth is a fraction of all 1326 combos, not a percentage.
  //
  // The chart is a RAISE-FIRST-IN range — conditional on nobody having opened
  // yet — while the archetype's advertised PFR is over every hand dealt. They
  // are not the same quantity and must not be compared: capping the chart by
  // `pfr * mult` was doing exactly that, and it quietly tightened the TAG
  // below its own baseline chart. So the chart sets the opening width and the
  // archetype only scales it by how much more or less it likes to raise.
  const openPct = Math.max(
    2,
    Math.min(70, chartWidth(chart) * 100 * (cfg.pfr / ARCHETYPES.TAG.pfr)),
  );
  const playPct = Math.max(openPct, Math.min(85, cfg.vpip * mult));

  // Candidates: chart hands first, strongest-and-most-often-opened first,
  // then everything else by raw strength once the chart runs out.
  const strength = strengthRankMap();
  const rank = (l: HandLabel) => strength.get(l) ?? 999;
  const inChart = Object.entries(chart).filter(([, f]) => f > 0);
  inChart.sort((a, b) => b[1] - a[1] || rank(a[0]) - rank(b[0]));
  const seen = new Set(inChart.map(([l]) => l));
  const rest = [...strength.keys()].filter((l) => !seen.has(l)).sort((a, b) => rank(a) - rank(b));
  const order: HandLabel[] = [...inChart.map(([l]) => l as HandLabel), ...rest];

  const open = new Set<HandLabel>();
  const play = new Set<HandLabel>();
  let acc = 0;
  for (const l of order) {
    const pct = (acc / 1326) * 100;
    if (pct >= playPct) break;
    if (pct < openPct) open.add(l);
    play.add(l);
    acc += combosFor(l);
  }
  for (const l of PREMIUM) {
    open.add(l);
    play.add(l);
  }

  const out = { open, play };
  RANGE_CACHE.set(key, out);
  return out;
}

/**
 * How wide to defend once the chart has run out of hands.
 *
 * A standard defend is roughly the top fifth of hands; against somebody
 * opening most of theirs it has to stretch a long way past that, and the
 * blinds stretch furthest because they are the ones being robbed.
 */
const DEFEND_CACHE = new Map<string, Set<HandLabel>>();
function defendRangeFor(defendMult: number, pos: GameState["players"][number]["position"]): Set<HandLabel> {
  const seat = pos === "BB" ? 1.35 : pos === "SB" ? 1.1 : pos === "BTN" ? 1.15 : 0.85;
  const pct = Math.max(12, Math.min(62, 18 * defendMult * seat));
  const key = `${Math.round(pct)}`;
  let r = DEFEND_CACHE.get(key);
  if (!r) {
    r = topPercentRange(Number(key));
    DEFEND_CACHE.set(key, r);
  }
  return r;
}

function decideBotInner(s: GameState, seat: number): BotDecision {
  const p = s.players[seat];
  if (!p.archetype || !p.hole) return { action: { type: "fold" }, range: [] };
  // Per-session jittered dials keep the archetype label from being a
  // full spoiler: two Nits won't play identically.
  const base = { ...ARCHETYPES[p.archetype], ...(p.dials ?? {}) };
  // …and on top of that, what this bot has made of whoever it is up against.
  // Each archetype leans in its own direction; none of them becomes the same
  // player, and none of them remembers any of it next session.
  const villain =
    s.aggressor != null && s.aggressor !== seat
      ? s.players[s.aggressor]
      : s.players.find((q) => !q.hasFolded && q.id !== seat);
  const difficulty = s.config.difficulty ?? "regular";
  let adj: Adjustment = villain
    ? adjustmentFor(p.archetype, villain, difficulty)
    : { aggression: 1, stickiness: 1, defend: 1, threebet: 1, note: null };
  // …and every so often it throws the read away for one hand and plays
  // straight, to find out whether the read is still true. Acting on a read
  // 100% of the time makes a bot's behaviour a function of yours, which is
  // its own kind of tell — and it means a stale read never gets corrected.
  // The draw happens here, before any other, so the mobile port can match it.
  if (villain && Math.random() < exploreRate(readPlayer(villain), difficulty)) {
    adj = { aggression: 1, stickiness: 1, defend: 1, threebet: 1, note: adj.note };
  }
  const cfg = {
    ...base,
    aggression: Math.min(0.98, base.aggression * adj.aggression),
    stickiness: Math.min(0.95, base.stickiness * adj.stickiness),
  };
  const la = legalActions(s);
  const label = cardsToLabel(p.hole[0], p.hole[1]);
  const bb = s.bigBlind;
  const rnd = Math.random();

  if (s.street === "preflop") {
    const dial = DIALS[cfg.archetype];
    const facingRaise = s.currentBet > bb;

    if (!facingRaise) {
      if (la.canCheck) {
        // BB with the option: raise premiums over limps, otherwise check.
        const f = Math.min(1, (PREFLOP_100.vsRfi.BB_vs_SB.threebet[label] ?? 0) * dial.threebet);
        if (rnd < f && la.canRaise) {
          const limpers = s.players.filter(
            (q) => !q.hasFolded && q.committed === bb && q.position !== "BB",
          ).length;
          const to = clampInt((3 + limpers) * bb, la.minRaiseTo, la.maxRaiseTo);
          return { action: betOrRaise(s, to), range: chartLabels(PREFLOP_100.vsRfi.BB_vs_SB.threebet, 0.25) };
        }
        return { action: { type: "check" }, range: setDiff(new Set(ALL_LABELS), new Set(chartLabels(PREFLOP_100.vsRfi.BB_vs_SB.threebet, 0.5))) };
      }

      const chart = PREFLOP_100.rfi[p.position] ?? PREFLOP_100.rfi.SB;
      const own = rangesFor(cfg.archetype, p.position);
      // Open the hands this archetype opens. A mixed-frequency hand in the
      // chart stays mixed, so two Nits in the same seat still differ.
      if (own.open.has(label)) {
        const mixed = chart[label];
        const openFreq = PREMIUM.has(label) ? 1 : mixed !== undefined && mixed < 1 ? Math.max(0.5, mixed) : 1;
        if (rnd < openFreq) {
          const limpers = s.players.filter(
            (q) => !q.hasFolded && q.committed === bb && q.position !== "BB",
          ).length;
          const to = clampInt((2.5 + limpers) * bb, la.minRaiseTo, la.maxRaiseTo);
          return { action: betOrRaise(s, to), range: [...own.open] };
        }
      }
      // Everything between the opening range and the playing range: the
      // passive types limp it, the aggressive ones throw it away. This gap is
      // what makes a Station a station — it is in the hand, cheaply, with
      // something it should not have.
      if (own.play.has(label) && la.canCall && la.callAmount <= bb && dial.limpWide) {
        return { action: { type: "call", amount: la.callAmount }, range: [...own.play] };
      }
      return { action: { type: "fold" }, range: [] };
    }

    // ---- Facing a raise ----
    const aggSeat = s.aggressor;
    const raiserPos = aggSeat != null && aggSeat !== seat ? s.players[aggSeat].position : "CO";
    const facing3bet = s.currentBet > 4.5 * bb; // beyond a standard single open
    const charts = PREFLOP_100.vsRfi[`${p.position}_vs_${raiserPos}`];

    if (!facing3bet && charts) {
      let f3 = charts.threebet[label] ?? 0;
      let fc = charts.call[label] ?? 0;
      if (cfg.archetype === "Station") {
        // Stations flat their whole continue range and only raise monsters.
        fc = Math.min(1, (f3 + fc) * dial.call);
        f3 = label === "AA" || label === "KK" ? 0.5 : 0;
      } else {
        if (cfg.archetype === "Nit" && f3 < 0.9) f3 *= 0.3; // drop bluff 3-bets
        f3 = Math.min(1, f3 * dial.threebet);
        fc = Math.min(1 - f3, fc * dial.call);
      }
      // A chart that has never heard of this hand is no reason to fold it when
      // the archetype plays it anyway. This is where most of a loose player's
      // VPIP actually comes from: not opening pots, but refusing to pass on
      // one somebody else opened.
      const ownPre = rangesFor(cfg.archetype, p.position);
      if (ownPre.play.has(label) && la.callAmount <= 4.5 * bb) {
        fc = Math.max(fc, base.stickiness * 0.9);
      }
      // The chart is written for somebody opening a sane range. Against a
      // player who has been raising every other hand, folding to it is the
      // mistake — so defend and play back harder the more they do it.
      f3 = Math.min(1, f3 * adj.threebet);
      fc = Math.min(1 - f3, fc * adj.defend);
      if (PREMIUM.has(label)) f3 = Math.max(f3, 0.85); // premiums stay aggressive
      if (rnd < f3 && la.canRaise) {
        const to = clampInt(s.currentBet * 3.2, la.minRaiseTo, la.maxRaiseTo);
        return { action: betOrRaise(s, to), range: chartLabels(charts.threebet, 0.25) };
      }
      if (rnd < f3 + fc && la.canCall) {
        return { action: { type: "call", amount: la.callAmount }, range: chartLabels(charts.call, 0.25) };
      }
      if (PREMIUM.has(label) && la.canCall) {
        // Safety net: a premium may never fold preflop.
        return { action: { type: "call", amount: la.callAmount }, range: PREMIUM_LIST };
      }
      // Defending wider cannot be done by scaling the chart: most hands sit
      // at zero there, and zero times anything is still zero. Against an
      // opener this loose, bring in hands the chart never contemplated —
      // the top of what is playable, sized by how wide they actually are.
      if (adj.defend > 1.2 && la.canCall && la.callAmount <= 6 * bb) {
        const widened = defendRangeFor(adj.defend, p.position);
        if (widened.has(label) && rnd < 0.55) {
          return { action: { type: "call", amount: la.callAmount }, range: [...widened] };
        }
      }
      return { action: { type: "fold" }, range: [] };
    }

    // ---- Facing a 3-bet or bigger (or an uncharted spot) ----
    // Half the position pairs have no chart, because they cannot arise in a
    // pot nobody limped. Now that the loose archetypes limp properly, they
    // arise all the time — so a single raise in an uncharted spot is played
    // from the archetype's own range rather than falling through to the
    // fold-everything-but-aces branch below.
    // Premiums are deliberately excluded: they have their own ladder below,
    // which 4-bets them. Letting this branch answer for them turns AA facing
    // a raise into a flat call.
    if (!facing3bet && !charts && !PREMIUM.has(label)) {
      const own = rangesFor(cfg.archetype, p.position);
      if (own.open.has(label) && la.canRaise && rnd < 0.35 * (0.5 + cfg.aggression)) {
        const to = clampInt(s.currentBet * 3.2, la.minRaiseTo, la.maxRaiseTo);
        return { action: betOrRaise(s, to), range: [...own.open] };
      }
      if (own.play.has(label) && la.canCall && la.callAmount <= 4.5 * bb &&
          rnd < 0.35 + base.stickiness * 0.6) {
        return { action: { type: "call", amount: la.callAmount }, range: [...own.play] };
      }
      return { action: { type: "fold" }, range: [] };
    }
    if (label === "AA" || label === "KK") {
      if (la.canRaise && rnd < 0.8) {
        const to = clampInt(s.currentBet * 2.6, la.minRaiseTo, la.maxRaiseTo);
        return { action: betOrRaise(s, to), range: PREMIUM_LIST };
      }
      if (la.canCall) return { action: { type: "call", amount: la.callAmount }, range: PREMIUM_LIST };
      if (la.canRaise) return { action: betOrRaise(s, la.maxRaiseTo), range: PREMIUM_LIST };
    }
    const f3vs = charts?.threebet[label] ?? (PREMIUM.has(label) ? 1 : 0);
    if (f3vs >= 0.9) {
      // QQ / AK class: continue — occasionally 4-bet, mostly call.
      if (la.canRaise && rnd < 0.1 + 0.35 * cfg.aggression) {
        const to = clampInt(s.currentBet * 2.6, la.minRaiseTo, la.maxRaiseTo);
        return { action: betOrRaise(s, to), range: PREMIUM_LIST };
      }
      if (la.canCall) return { action: { type: "call", amount: la.callAmount }, range: PREMIUM_LIST };
    }
    // Speculative continues vs a 3-bet: at a sane price, by the hand's own
    // 3-bet-chart frequency, widened by how often this particular player
    // re-raises. Somebody 3-betting half their hands is not representing
    // anything, and folding everything but QQ+ to them is free money.
    if (f3vs > 0 && la.canCall && la.callAmount <= 12 * bb &&
        rnd < f3vs * (0.4 + cfg.stickiness) * adj.defend) {
      return { action: { type: "call", amount: la.callAmount }, range: chartLabels(charts?.threebet ?? {}, 0.25) };
    }
    // Once the read is strong, hands that merely *call* an open are worth a
    // call here too — that is what punishing a serial re-raiser looks like.
    if (adj.defend > 1.25 && la.canCall && la.callAmount <= 10 * bb) {
      const fcVs = charts?.call[label] ?? 0;
      if (fcVs > 0 && rnd < fcVs * (adj.defend - 1)) {
        return { action: { type: "call", amount: la.callAmount }, range: chartLabels(charts?.call ?? {}, 0.25) };
      }
    }
    return { action: { type: "fold" }, range: [] };
  }

  // ---- Postflop ----
  const holeInts = comboToInts(p.hole);
  const boardInts = s.board.map(cardToInt);
  const facingBet = la.toCall > 0;
  // Perceived-range bookkeeping: whatever this bot does, its stored
  // range narrows consistently with the policy that produced the
  // action (and is guaranteed to contain its actual hand).
  const stored = s.botRanges[p.id] ?? [];
  const narrowed = (kind: "aggro" | "call" | "check") => narrowRange(stored, s.board, kind, label);

  // Equity vs the opponent's NARROWED range heads-up; vs random as the
  // multiway / no-range fallback.
  const liveOpps = s.players.filter((q) => !q.hasFolded && q.id !== seat);
  // Equity against the hands these people are actually likely to hold. Every
  // opponent now has a range — a bot's own narrowed one, or one inferred
  // from how that player has been playing this session.
  const blocked = new Set<number>([...holeInts, ...boardInts]);
  const toCombos = (labels: HandLabel[]): [number, number][] => {
    const combos: [number, number][] = [];
    for (const l of labels) {
      for (const [a, b] of labelToCombos(l)) {
        const ai = cardToInt(a);
        const bi = cardToInt(b);
        if (!blocked.has(ai) && !blocked.has(bi)) combos.push([ai, bi]);
      }
    }
    return combos;
  };
  const oppCombos = liveOpps.map((q) => toCombos(opponentRange(s, q))).filter((c) => c.length > 0);
  let e: number;
  if (oppCombos.length === liveOpps.length && oppCombos.length === 1) {
    e = equityVsRange(holeInts, boardInts, oppCombos[0], 260).equity;
  } else if (oppCombos.length === liveOpps.length && oppCombos.length > 1) {
    e = equityVsRanges(holeInts, boardInts, oppCombos, 400).equity;
  } else {
    // Somebody's range came back empty (fully blocked) — fall back rather
    // than pretend to know.
    e = equityVsRandom(holeInts, boardInts, 320).equity;
  }

  const tex = boardTexture(boardInts);
  const draw = drawStrength(holeInts, boardInts);
  const multiDamp = 1 / Math.max(1, liveOpps.length); // bluff less multiway

  // Whether this is one of the hands this bot is running a bluff on, and how
  // hard it is leaning on bluffs generally. Decided once for the hand and
  // shared by both branches below, so a bot that would have bet as a bluff
  // also raises as one — otherwise a raise always means a hand, which is the
  // easiest read at the table.
  const viable = bluffViability(liveOpps, difficulty);
  const policy = bluffPolicy(p);
  const bluffRate = BLUFF_HANDS[cfg.archetype] * policy.frequency * viable;
  const committed = bluffsThisHand(s.handNumber, seat, bluffRate);

  if (!facingBet) {
    if (la.canBet) {
      if (e > 0.8) {
        // Monster: usually bet big, but slowplay dry boards sometimes.
        const slowplayP = tex.wet ? 0.08 : 0.28;
        if (rnd < slowplayP && s.street !== "river") {
          return { action: { type: "check" }, range: narrowed("check") };
        }
        const frac = tex.wet ? 1.0 : [0.66, 0.75, 1.25][clampInt(rnd * 3, 0, 2)];
        const to = clampInt(s.pot * frac, la.minRaiseTo, la.maxRaiseTo);
        return { action: { type: "bet", amount: to }, range: narrowed("aggro") };
      }
      if (e > 0.6) {
        // Solid value: size up on wet boards to charge draws.
        const to = clampInt(s.pot * (tex.wet ? 0.75 : 0.55), la.minRaiseTo, la.maxRaiseTo);
        return { action: { type: "bet", amount: to }, range: narrowed("aggro") };
      }
      if (e > 0.4 && s.street === "flop" && rnd < (cfg.cbetFlop / 100) * (tex.wet ? 0.7 : 1) * multiDamp) {
        // Small range-style c-bet on favorable, drier flops.
        const to = clampInt(s.pot * 0.33, la.minRaiseTo, la.maxRaiseTo);
        return { action: { type: "bet", amount: to }, range: narrowed("aggro") };
      }
      // Bluffs.
      //
      // A draw is the best reason to bet without a hand, but it cannot be the
      // only one: a bot that bets air exactly never is a bot you can read off
      // a single street. So some share of hands are bluffing hands outright,
      // picked once per hand and held for the whole hand — which is what turns
      // a one-off stab into a barrel, and what stops "bet, check, bet" from
      // being a tell.
      //
      // How often is a read, not a constant. Firing at somebody who folds to
      // most c-bets is free money; firing at a station is setting money on
      // fire. The field decides it, not one nominated villain, because the
      // bluff has to get through all of them.
      // The range it is willing to bluff with. Getting caught raises this, so
      // the bot stops firing with pure air and goes back to hands that have
      // something behind them.
      const inRange = e >= policy.minEquity;
      // A bluff gets cheaper to start than to finish. Firing every street of
      // a hand marked for bluffing turns a small loss into a big one against
      // anybody who only continues with a real hand — which is exactly what
      // was happening: the showdown column went to 114 bb/100 against a
      // player who folds nothing good. So the barrel fades. Still a barrel,
      // because the turn rate is high enough that giving up is not a reliable
      // read either, but one that stops piling in on the river.
      const barrel =
        s.street === "flop" ? 1 : s.street === "turn" ? 0.55 : 0.28;
      const bluffP =
        draw === 2
          ? cfg.aggression * 0.55
          : draw === 1
            ? cfg.aggression * 0.28
            : committed && inRange
              // Air, but this is one of its bluffing hands and the hand is
              // inside the range it currently trusts: fire more readily on a
              // board it can credibly have hit.
              ? cfg.aggression * barrel *
                (tex.paired ? 0.4 : tex.highCard >= 12 ? 0.72 : 0.6)
              : tex.highCard >= 12 && s.street !== "flop"
                ? cfg.aggression * 0.12
                : 0;
      if (Math.random() < bluffP * viable) {
        // Remember that this was a bluff, so the hand's outcome can score it.
        if (e < 0.45) p.bluffedThisHand = true;
        // Size a pure bluff like a value bet — the point is to be the same
        // shape as the hand it is pretending to be.
        const to = clampInt(s.pot * (tex.wet ? 0.7 : 0.6), la.minRaiseTo, la.maxRaiseTo);
        return { action: { type: "bet", amount: to }, range: narrowed("aggro") };
      }
    }
    return { action: { type: "check" }, range: narrowed("check") };
  }

  // ---- Facing a bet ----
  const needed = la.callAmount / (s.pot + la.callAmount);
  // Value raises from 0.72 (non-nutted included), sized up on wet boards.
  if (e > 0.72 && la.canRaise && Math.random() < cfg.aggression * (e > 0.85 ? 1 : 0.6)) {
    const frac = tex.wet ? 1.0 : 0.8;
    const to = clampInt(s.currentBet + s.pot * frac, la.minRaiseTo, la.maxRaiseTo);
    return { action: { type: "raise", amount: to }, range: narrowed("aggro") };
  }
  // Semi-bluff (check-)raise with strong draws.
  const raiseOdds = policy.frequency * viable;
  if (draw === 2 && s.street !== "river" && la.canRaise &&
      Math.random() < cfg.aggression * 0.3 * raiseOdds) {
    const to = clampInt(s.currentBet + s.pot * 0.9, la.minRaiseTo, la.maxRaiseTo);
    return { action: { type: "raise", amount: to }, range: narrowed("aggro") };
  }
  // Thin value. Raising only the very top of the range is a range somebody
  // can read: if a raise always means two pair or better, folding to it is
  // free. A good hand that is probably best is worth a raise too, just less
  // often.
  if (e > 0.62 && e <= 0.72 && la.canRaise && Math.random() < cfg.aggression * 0.24) {
    const to = clampInt(s.currentBet + s.pot * 0.7, la.minRaiseTo, la.maxRaiseTo);
    return { action: { type: "raise", amount: to }, range: narrowed("aggro") };
  }
  // Bluff-raise — the most unreadable action in poker, and the bots had
  // none of it. Facing a bet they folded or called, so a raise from a bot
  // always meant a hand, every time. Now it sometimes means nothing at all,
  // on the hands this bot had already decided to run a bluff on, and the
  // bandit scores the result like any other bluff.
  if (
    e < 0.45 &&
    committed &&
    e >= policy.minEquity &&
    la.canRaise &&
    la.callAmount <= s.pot * 0.8 &&
    Math.random() < cfg.aggression * 0.2 * raiseOdds
  ) {
    p.bluffedThisHand = true;
    const to = clampInt(s.currentBet + s.pot * 0.75, la.minRaiseTo, la.maxRaiseTo);
    return { action: { type: "raise", amount: to }, range: narrowed("aggro") };
  }
  // Draws call a little wider (implied-odds proxy); rivers don't.
  const effE = Math.min(0.95, e + (s.street !== "river" ? draw * 0.05 : 0));
  const callThreshold = needed * (1 - cfg.stickiness * 0.5);
  if (effE >= callThreshold && la.canCall) {
    return { action: { type: "call", amount: la.callAmount }, range: narrowed("call") };
  }
  if (cfg.stickiness > 0.7 && la.canCall && la.callAmount <= s.pot * 0.5 && Math.random() < 0.7) {
    return { action: { type: "call", amount: la.callAmount }, range: narrowed("call") };
  }
  return { action: { type: "fold" }, range: [] };
}

/* ---- Board texture + draw detection (cheap bitmask heuristics) ---- */

function boardTexture(boardInts: number[]): { wet: boolean; paired: boolean; highCard: number } {
  const suits = [0, 0, 0, 0];
  const rankCounts = new Map<number, number>();
  let rankMask = 0;
  let highCard = 0;
  for (const c of boardInts) {
    suits[c & 3]++;
    const r = (c >> 2) + 2;
    rankCounts.set(r, (rankCounts.get(r) ?? 0) + 1);
    rankMask |= 1 << r;
    if (r > highCard) highCard = r;
  }
  const flushy = Math.max(...suits) >= Math.min(3, boardInts.length);
  // Connected: any 5-rank window holding 3+ board ranks.
  let straighty = false;
  const m = rankMask | (rankMask & (1 << 14) ? 1 << 1 : 0);
  for (let lo = 1; lo <= 10; lo++) {
    let n = 0;
    for (let r = lo; r < lo + 5; r++) if (m & (1 << r)) n++;
    if (n >= 3) straighty = true;
  }
  const paired = [...rankCounts.values()].some((n) => n >= 2);
  return { wet: flushy || straighty, paired, highCard };
}

/** 0 = none, 1 = weak (gutshot / flop 3-flush), 2 = strong (flush draw / OESD). */
function drawStrength(holeInts: [number, number], boardInts: number[]): number {
  if (boardInts.length >= 5) return 0;
  const all = [...holeInts, ...boardInts];
  const suits = [0, 0, 0, 0];
  let mask = 0;
  for (const c of all) {
    suits[c & 3]++;
    mask |= 1 << ((c >> 2) + 2);
  }
  const holeSuits = [holeInts[0] & 3, holeInts[1] & 3];
  const flushDraw = suits.some((n, si) => n === 4 && holeSuits.includes(si));
  if (mask & (1 << 14)) mask |= 1 << 1;
  let fourToStraight = false;
  for (let lo = 1; lo <= 10; lo++) {
    let n = 0;
    for (let r = lo; r < lo + 5; r++) if (mask & (1 << r)) n++;
    if (n >= 4) fourToStraight = true;
  }
  let run = 0;
  let bestRun = 0;
  for (let r = 1; r <= 14; r++) {
    run = mask & (1 << r) ? run + 1 : 0;
    bestRun = Math.max(bestRun, run);
  }
  const oesd = bestRun >= 4;
  const gutshot = fourToStraight && !oesd;
  const threeFlush = boardInts.length === 3 && suits.some((n, si) => n === 3 && holeSuits.includes(si));
  if (flushDraw || oesd) return 2;
  if (gutshot || threeFlush) return 1;
  return 0;
}

/* ==================================================================
   Street-by-street range narrowing.

   Ranks every label in the stored range by its strength on the board
   (exact made-hand score on the river; a short seeded equity sample —
   which sees draws — on the flop/turn) and keeps the slice consistent
   with the action: aggression keeps the strong part plus a bluff tail,
   calling keeps the middle-and-up, checking sheds the very top. The
   bot's actual label is always retained.
   ================================================================== */

function representativeCombo(label: HandLabel, blocked: Set<number>): [number, number] | null {
  for (const [a, b] of labelToCombos(label)) {
    const ai = cardToInt(a);
    const bi = cardToInt(b);
    if (!blocked.has(ai) && !blocked.has(bi)) return [ai, bi];
  }
  return null;
}

export function narrowRange(
  stored: HandLabel[],
  board: Card[],
  kind: "aggro" | "call" | "check",
  /** The holder's real hand, so a bot's own range always contains it. Pass
      null for somebody else's range — we are not allowed to know theirs. */
  actualLabel: HandLabel | null,
): HandLabel[] {
  if (stored.length <= 8) {
    if (actualLabel == null) return stored;
    return stored.includes(actualLabel) ? stored : [...stored, actualLabel];
  }
  const boardInts = board.map(cardToInt);
  const blocked = new Set(boardInts);
  const isRiver = board.length === 5;

  const scored: { label: HandLabel; v: number }[] = [];
  for (const l of stored) {
    const combo = representativeCombo(l, blocked);
    if (!combo) continue; // fully blocked by the board
    const v = isRiver
      ? evaluateInts([combo[0], combo[1], ...boardInts]).score
      : equityVsRandom(combo, boardInts, 80, hashSeed(`${l}|${board.join("")}`)).equity;
    scored.push({ label: l, v });
  }
  scored.sort((a, b) => b.v - a.v);

  const n = scored.length;
  let kept: HandLabel[];
  if (kind === "aggro") {
    // Value region + a thin bluff tail from the bottom (bots do bluff).
    const top = scored.slice(0, Math.max(5, Math.round(n * 0.45))).map((x) => x.label);
    const tail = scored.slice(Math.round(n * 0.85)).map((x) => x.label);
    kept = [...top, ...tail];
  } else if (kind === "call") {
    kept = scored.slice(0, Math.max(6, Math.round(n * 0.65))).map((x) => x.label);
  } else {
    // Checking sheds the very strongest slice, keeps the rest.
    kept = scored.slice(Math.round(n * 0.12)).map((x) => x.label);
  }
  // Guarded explicitly rather than relying on `includes(null)` being false:
  // `actualLabel` is null for somebody else's range, and tsc rejects the
  // unguarded form. The Dart port has the same guard.
  if (actualLabel !== null && !kept.includes(actualLabel) && stored.includes(actualLabel)) {
    kept.push(actualLabel);
  }
  return kept;
}
