import type {
  Action,
  Card,
  EvaluatedHand,
  GameConfig,
  GameState,
  LegalActions,
  LogEntry,
  Player,
  Position,
  PotResult,
  ShowdownEntry,
  Street,
  UncalledBet,
} from "../types/poker.ts";
import { makeDeck, shuffle } from "../engine/cards.ts";
import { evaluateCards } from "../engine/evaluator.ts";
import { archetypeForSeat, botNameFor } from "./archetypes.ts";

/* ==================================================================
   Pure Texas Hold'em hand state machine (no React / no async).
   6-handed, no-limit. Handles blinds, betting rounds with proper
   min-raise + short-all-in (no-reopen) rules, all-in run-outs, and
   side pots at showdown. Kept dependency-free so it can be simulated
   in Node and driven by the Zustand store / Rust backend alike.
   ================================================================== */

const POS6: Position[] = ["BTN", "SB", "BB", "UTG", "MP", "CO"];
// 9-max approximated onto the six canonical labels the charts know.
const POS9: Position[] = ["BTN", "SB", "BB", "UTG", "UTG", "MP", "MP", "CO", "CO"];

/**
 * Seat labels by how many players are actually in the hand, indexed from the
 * button. A table playing down (`botRebuy: false`) passes through every size
 * on its way to heads-up, and the charts only know six names, so the short
 * tables drop the middle ones in the order a real table does.
 */
const POS_BY_COUNT: Position[][] = [
  [],
  ["BTN"],
  ["BTN", "BB"], // heads-up: the button is the small blind
  ["BTN", "SB", "BB"],
  ["BTN", "SB", "BB", "UTG"],
  ["BTN", "SB", "BB", "UTG", "CO"],
  POS6,
  ["BTN", "SB", "BB", "UTG", "UTG", "MP", "CO"],
  ["BTN", "SB", "BB", "UTG", "UTG", "MP", "MP", "CO"],
  POS9,
];

/** Seats still in the game, in seat order. */
export function seatedIds(s: GameState): number[] {
  return s.players.filter((p) => !p.sittingOut).map((p) => p.id);
}

/** Seats still in the game, ordered from the button round. */
function orderFromButton(s: GameState): number[] {
  const seated = seatedIds(s);
  const at = Math.max(0, seated.indexOf(s.button));
  return [...seated.slice(at), ...seated.slice(0, at)];
}

function clone(s: GameState): GameState {
  return {
    ...s,
    players: s.players.map((p) => ({
      ...p,
      hole: p.hole ? ([p.hole[0], p.hole[1]] as [Card, Card]) : null,
      lastAction: p.lastAction ? { ...p.lastAction } : null,
    })),
    board: [...s.board],
    deck: [...s.deck],
    log: [...s.log],
    botRanges: { ...s.botRanges },
    stacksAtStart: [...s.stacksAtStart],
    summary: s.summary ? { ...s.summary } : null,
  };
}

function pushLog(s: GameState, street: Street, text: string, kind: LogEntry["kind"]) {
  s.log.push({ id: s.logSeq++, street, text, kind });
  if (s.log.length > 200) s.log.splice(0, s.log.length - 200);
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function createTable(config: GameConfig): GameState {
  const players: Player[] = [];
  for (let i = 0; i < config.seats; i++) {
    const isHero = i === 0;
    players.push({
      id: i,
      name: isHero ? "You" : botNameFor(i),
      isHero,
      archetype: isHero ? undefined : archetypeForSeat(i),
      stack: config.startingStack,
      hole: null,
      revealed: false,
      hasFolded: false,
      isAllIn: false,
      committed: 0,
      committedTotal: 0,
      acted: false,
      position: "BTN",
      lastAction: null,
      handsSeen: 0,
      vpipCount: 0,
      pfrCount: 0,
      sittingOut: false,
    });
  }
  return {
    config,
    players,
    button: Math.floor(Math.random() * config.seats),
    street: "preflop",
    board: [],
    deck: [],
    pot: 0,
    currentBet: 0,
    lastRaiseSize: config.bigBlind,
    aggressor: null,
    toAct: null,
    handNumber: 0,
    smallBlind: config.smallBlind,
    bigBlind: config.bigBlind,
    phase: "idle",
    log: [],
    logSeq: 1,
    botRanges: {},
    stacksAtStart: players.map((p) => p.stack),
    summary: null,
  };
}

function seatAtOffset(s: GameState, offset: number): number {
  return (s.button + offset) % s.config.seats;
}

/** The next seat after `from` that is still in the game. */
function nextSeated(s: GameState, from: number): number {
  const n = s.config.seats;
  for (let k = 1; k <= n; k++) {
    const q = (from + k) % n;
    if (!s.players[q].sittingOut) return q;
  }
  return from;
}

function assignPositions(s: GameState) {
  const order = orderFromButton(s);
  const table = POS_BY_COUNT[order.length] ?? POS9;
  order.forEach((id, off) => {
    s.players[id].position = table[off] ?? "MP";
  });
}

function commit(s: GameState, p: Player, amount: number) {
  const amt = Math.max(0, Math.min(amount, p.stack));
  p.stack -= amt;
  p.committed += amt;
  p.committedTotal += amt;
  s.pot += amt;
  if (p.stack === 0) p.isAllIn = true;
}

function postBlind(s: GameState, seat: number, amount: number, label: string) {
  const p = s.players[seat];
  commit(s, p, amount);
  p.lastAction = { label, street: "preflop" };
}

export function startHand(prev: GameState): GameState {
  const s = clone(prev);
  s.handNumber += 1;

  // An empty stack is either topped back up (the default: the table keeps its
  // shape so every hand is a full-ring rep) or it is the end of that bot's
  // game, and the table plays on short-handed. The hero is never sat out
  // here — the session layer ends the session on a busted hero.
  const rebuy = s.config.botRebuy !== false;
  for (const p of s.players) {
    if (p.stack > 0 || p.sittingOut) continue;
    if (rebuy || p.isHero) p.stack = s.config.startingStack;
    else p.sittingOut = true;
  }

  // The button only ever sits on a player who is still in the game. The
  // `handNumber` guard keeps hand #1 on the button `createTable` drew — but
  // not when that seat is already out, which a restored play-down table can
  // hand us.
  if (s.handNumber > 1 || s.players[s.button].sittingOut) {
    s.button = nextSeated(s, s.button);
  }

  for (const p of s.players) {
    p.hole = null;
    p.revealed = false;
    // A seat that is out plays no part in the hand, and every "is this player
    // still in?" test in the engine already asks `hasFolded`.
    p.hasFolded = p.sittingOut;
    p.foldedStreet = undefined;
    p.vpipThisHand = false;
    p.pfrThisHand = false;
    p.isAllIn = false;
    p.committed = 0;
    p.committedTotal = 0;
    p.acted = false;
    p.lastAction = null;
    if (!p.sittingOut) p.handsSeen += 1;
  }

  s.board = [];
  s.pot = 0;
  s.currentBet = s.bigBlind;
  s.lastRaiseSize = s.bigBlind;
  s.aggressor = null;
  s.summary = null;
  s.street = "preflop";
  s.phase = "betting";
  s.botRanges = {};
  assignPositions(s);

  s.deck = shuffle(makeDeck());
  for (const p of s.players) {
    if (!p.sittingOut) p.hole = [s.deck.pop()!, s.deck.pop()!];
  }
  s.stacksAtStart = s.players.map((p) => p.stack);

  // Antes (if configured) go straight to the pot: they count toward
  // side-pot totals but never toward matching the current street bet.
  const ante = s.config.ante ?? 0;
  if (ante > 0) {
    for (const p of s.players) {
      if (p.sittingOut) continue;
      const a = Math.min(ante, p.stack);
      p.stack -= a;
      p.committedTotal += a;
      s.pot += a;
      if (p.stack === 0) p.isAllIn = true;
    }
  }

  // Blinds and the first actor count round the players still in the game, so
  // a table that has played down to three deals like a three-handed table.
  const order = orderFromButton(s);
  const headsUp = order.length === 2;
  const sbSeat = headsUp ? order[0] : order[1 % order.length];
  const bbSeat = headsUp ? order[1] : order[2 % order.length];
  postBlind(s, sbSeat, s.smallBlind, "SB");
  postBlind(s, bbSeat, s.bigBlind, "BB");
  s.aggressor = bbSeat;

  pushLog(
    s,
    "preflop",
    `Hand #${s.handNumber} · blinds ${s.smallBlind}/${s.bigBlind}${ante > 0 ? ` · ante ${ante}` : ""}`,
    "deal",
  );

  s.toAct = headsUp
    ? nextLiveActor(s, sbSeat, true)
    : nextLiveActor(s, order[3 % order.length], true);
  return s;
}

/** First seat from `start` (inclusive optional) that can still act. */
function nextLiveActor(s: GameState, start: number, inclusive: boolean): number | null {
  const n = s.config.seats;
  for (let k = inclusive ? 0 : 1; k < n + (inclusive ? 0 : 1); k++) {
    const q = (start + k) % n;
    const p = s.players[q];
    if (!p.hasFolded && !p.isAllIn) return q;
  }
  return null;
}

function nextToAct(s: GameState, fromSeat: number): number | null {
  const n = s.config.seats;
  for (let k = 1; k <= n; k++) {
    const q = (fromSeat + k) % n;
    const p = s.players[q];
    if (p.hasFolded || p.isAllIn) continue;
    if (!p.acted || p.committed < s.currentBet) return q;
  }
  return null;
}

function resetActedExcept(s: GameState, seat: number) {
  for (const p of s.players) {
    if (p.id === seat) continue;
    if (!p.hasFolded && !p.isAllIn) p.acted = false;
  }
}

export function legalActions(s: GameState): LegalActions {
  const seat = s.toAct;
  const empty: LegalActions = {
    toCall: 0, canFold: false, canCheck: false, canCall: false, callAmount: 0,
    canBet: false, canRaise: false, minRaiseTo: 0, maxRaiseTo: 0, potSize: s.pot, bigBlind: s.bigBlind,
  };
  if (seat === null) return empty;
  const p = s.players[seat];
  const toCall = s.currentBet - p.committed;
  const maxTotal = p.committed + p.stack;
  return {
    toCall,
    canFold: true,
    canCheck: toCall <= 0,
    canCall: toCall > 0 && p.stack > 0,
    callAmount: Math.min(toCall, p.stack),
    canBet: s.currentBet === 0 && p.stack > 0,
    canRaise: s.currentBet > 0 && p.stack > toCall,
    minRaiseTo:
      s.currentBet === 0
        ? Math.min(s.bigBlind, maxTotal)
        : Math.min(s.currentBet + s.lastRaiseSize, maxTotal),
    maxRaiseTo: maxTotal,
    potSize: s.pot,
    bigBlind: s.bigBlind,
  };
}

export function applyAction(prev: GameState, seat: number, action: Action): GameState {
  const s = clone(prev);
  if (s.phase !== "betting" || s.toAct !== seat) return s;
  const p = s.players[seat];
  const toCall = s.currentBet - p.committed;
  const maxTotal = p.committed + p.stack;

  switch (action.type) {
    case "fold": {
      p.hasFolded = true;
      p.foldedStreet = s.street;
      p.acted = true;
      p.lastAction = { label: "Fold", street: s.street };
      pushLog(s, s.street, `${p.name} folds`, "action");
      break;
    }
    case "check": {
      p.acted = true;
      p.lastAction = { label: "Check", street: s.street };
      pushLog(s, s.street, `${p.name} checks`, "action");
      break;
    }
    case "call": {
      if (s.street === "preflop" && !p.vpipThisHand) {
        p.vpipThisHand = true;
        p.vpipCount += 1;
      }
      const amt = Math.min(toCall, p.stack);
      commit(s, p, amt);
      p.acted = true;
      p.lastAction = { label: p.isAllIn ? "All-In" : "Call", street: s.street };
      pushLog(s, s.street, `${p.name} calls ${amt}${p.isAllIn ? " (all-in)" : ""}`, "action");
      break;
    }
    case "bet": {
      if (s.street === "preflop") {
        if (!p.vpipThisHand) { p.vpipThisHand = true; p.vpipCount += 1; }
        if (!p.pfrThisHand) { p.pfrThisHand = true; p.pfrCount += 1; }
      }
      let to = Math.max(action.amount ?? 0, Math.min(s.bigBlind, maxTotal));
      to = Math.min(to, maxTotal);
      commit(s, p, to - p.committed);
      s.currentBet = to;
      s.lastRaiseSize = to;
      s.aggressor = seat;
      resetActedExcept(s, seat);
      p.acted = true;
      p.lastAction = { label: p.isAllIn ? "All-In" : "Bet", street: s.street };
      pushLog(s, s.street, `${p.name} bets ${to}${p.isAllIn ? " (all-in)" : ""}`, "action");
      break;
    }
    case "raise": {
      if (s.street === "preflop") {
        if (!p.vpipThisHand) { p.vpipThisHand = true; p.vpipCount += 1; }
        if (!p.pfrThisHand) { p.pfrThisHand = true; p.pfrCount += 1; }
      }
      let to = action.amount ?? s.currentBet + s.lastRaiseSize;
      to = Math.min(to, maxTotal);
      const raiseSize = to - s.currentBet;
      commit(s, p, to - p.committed);
      const fullRaise = raiseSize >= s.lastRaiseSize;
      if (to > s.currentBet) s.currentBet = to;
      if (fullRaise) {
        s.lastRaiseSize = raiseSize;
        resetActedExcept(s, seat);
      }
      s.aggressor = seat;
      p.acted = true;
      p.lastAction = { label: p.isAllIn ? "All-In" : "Raise", street: s.street };
      pushLog(s, s.street, `${p.name} raises to ${to}${p.isAllIn ? " (all-in)" : ""}`, "action");
      break;
    }
    case "post":
      break;
  }

  advanceAfterAction(s, seat);
  return s;
}

function advanceAfterAction(s: GameState, seat: number) {
  const live = s.players.filter((p) => !p.hasFolded);
  if (live.length === 1) {
    settleByFold(s, live[0].id);
    return;
  }
  const n = nextToAct(s, seat);
  if (n !== null) {
    s.toAct = n;
    return;
  }
  closeStreet(s);
}

function burnDeal(s: GameState, count: number) {
  s.deck.pop(); // burn
  for (let i = 0; i < count; i++) s.board.push(s.deck.pop()!);
}

function closeStreet(s: GameState) {
  if (s.street === "river") {
    settleShowdown(s);
    return;
  }
  if (s.street === "preflop") {
    burnDeal(s, 3);
    s.street = "flop";
  } else if (s.street === "flop") {
    burnDeal(s, 1);
    s.street = "turn";
  } else if (s.street === "turn") {
    burnDeal(s, 1);
    s.street = "river";
  }

  for (const p of s.players) {
    p.committed = 0;
    p.acted = false;
    if (!p.hasFolded && !p.isAllIn) p.lastAction = null;
  }
  s.currentBet = 0;
  s.lastRaiseSize = s.bigBlind;
  s.aggressor = null;
  pushLog(s, s.street, `${capitalize(s.street)} — ${s.board.join(" ")}`, "deal");

  const canAct = s.players.filter((p) => !p.hasFolded && !p.isAllIn);
  if (canAct.length <= 1) {
    closeStreet(s); // run out remaining streets, then showdown
    return;
  }
  s.toAct = nextLiveActor(s, seatAtOffset(s, 1), true);
}

function seatOrderFromButton(s: GameState, id: number): number {
  return (id - s.button - 1 + s.config.seats) % s.config.seats;
}

interface RawPot {
  amount: number;
  eligible: number[];
}

export interface PotBreakdown {
  pots: RawPot[];
  uncalled?: UncalledBet;
}

type Contribution = { id: number; amt: number; folded: boolean };

/**
 * The top of the last bet, when only one player put it in, was never called:
 * the dealer pushes it straight back, so it is not part of any pot. A folded
 * top contributor is a different thing — those chips are dead money and stay
 * in, which is why this only fires for a live player.
 */
function takeUncalled(contribs: Contribution[]): { rest: Contribution[]; uncalled?: UncalledBet } {
  const live = contribs.filter((c) => c.amt > 0);
  if (live.length < 2) return { rest: contribs };
  const byAmt = [...live].sort((a, b) => b.amt - a.amt);
  const [top, second] = byAmt;
  if (top.folded || top.amt <= second.amt) return { rest: contribs };
  const excess = top.amt - second.amt;
  return {
    rest: contribs.map((c) => (c.id === top.id ? { ...c, amt: second.amt } : c)),
    uncalled: { playerId: top.id, amount: excess, inPot: false },
  };
}

function sameEligible(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

/**
 * Split total contributions into main + side pots.
 *
 * A side pot exists to separate chips a short all-in player cannot win, so a
 * new one starts only where the set of players eligible for it changes.
 * Consecutive betting levels contested by exactly the same people are one
 * pot — splitting on every level turned a single three-way all-in into
 * "Main pot / Side pot 1 / Side pot 2 / Side pot 3", which reads like three
 * separate contests that never happened.
 *
 * Folded players' chips are dead money in whichever level they reached; a
 * level with no live player rolls forward into the next one.
 */
export function buildSidePots(contribs: Contribution[]): PotBreakdown {
  const { rest, uncalled } = takeUncalled(contribs.map((c) => ({ ...c })));
  let rem = rest.filter((c) => c.amt > 0).map((c) => ({ ...c }));
  const pots: RawPot[] = [];
  let carry = 0;
  while (rem.length) {
    const min = Math.min(...rem.map((c) => c.amt));
    const amount = min * rem.length + carry;
    const eligible = rem.filter((c) => !c.folded).map((c) => c.id);
    if (eligible.length === 0) {
      carry = amount; // dead money rolls forward
    } else {
      carry = 0;
      const last = pots[pots.length - 1];
      if (last && sameEligible(last.eligible, eligible)) last.amount += amount;
      else pots.push({ amount, eligible });
    }
    rem = rem.map((c) => ({ ...c, amt: c.amt - min })).filter((c) => c.amt > 0);
  }
  // Dead money with no level above it to join (only reachable when a folded
  // player out-contributed everyone still live) belongs to the last real pot
  // rather than vanishing off the table.
  if (carry > 0 && pots.length) pots[pots.length - 1].amount += carry;
  return { pots, uncalled };
}

function settleByFold(s: GameState, winnerId: number) {
  const w = s.players[winnerId];
  const amount = s.pot;
  w.stack += amount;
  // Everyone folded, so the top of the winner's own bet was never called.
  // The pot result still reports the whole pot — the number the table has
  // been showing all hand — but the refund is recorded so the hand history
  // can account for it exactly instead of re-deriving it.
  const matched = Math.max(0, ...s.players.filter((p) => p.id !== winnerId).map((p) => p.committedTotal));
  const excess = Math.max(0, w.committedTotal - matched);
  s.summary = {
    handNumber: s.handNumber,
    potResults: [{ winners: [winnerId], amount, potLabel: "Pot" }],
    showdown: [],
    board: [...s.board],
    heroNetChips: s.players[0].stack - s.stacksAtStart[0],
    uncalled: excess > 0 ? { playerId: winnerId, amount: excess, inPot: true } : undefined,
  };
  pushLog(s, s.street, `${w.name} wins ${amount} (uncontested)`, "result");
  // Learning reveal: at hand end every dealt hand is shown, folds included.
  for (const p of s.players) if (p.hole) p.revealed = true;
  s.toAct = null;
  s.phase = "hand-over";
}

function settleShowdown(s: GameState) {
  const liveIds = s.players.filter((p) => !p.hasFolded).map((p) => p.id);
  // Learning reveal: at hand end every dealt hand is shown, folds included.
  for (const p of s.players) if (p.hole) p.revealed = true;

  const evals: Record<number, EvaluatedHand> = {};
  for (const id of liveIds) {
    const p = s.players[id];
    evals[id] = evaluateCards([...(p.hole as [Card, Card]), ...s.board]);
  }

  const contribs = s.players.map((p) => ({ id: p.id, amt: p.committedTotal, folded: p.hasFolded }));
  const { pots, uncalled } = buildSidePots(contribs);
  const potResults: PotResult[] = [];

  // The uncalled chips go back before anything is awarded, exactly as a
  // dealer returns them — they were never anybody's to win.
  if (uncalled) {
    s.players[uncalled.playerId].stack += uncalled.amount;
    pushLog(
      s,
      "showdown",
      `${s.players[uncalled.playerId].name} gets ${uncalled.amount} back (uncalled bet)`,
      "result",
    );
  }

  pots.forEach((pot, idx) => {
    const contenders = pot.eligible.filter((id) => liveIds.includes(id));
    if (contenders.length === 0) return;
    let best = -1;
    let winners: number[] = [];
    for (const id of contenders) {
      const sc = evals[id].score;
      if (sc > best) {
        best = sc;
        winners = [id];
      } else if (sc === best) {
        winners.push(id);
      }
    }
    const share = Math.floor(pot.amount / winners.length);
    const rem = pot.amount - share * winners.length;
    for (const id of winners) s.players[id].stack += share;
    if (rem > 0) {
      const first = [...winners].sort((a, b) => seatOrderFromButton(s, a) - seatOrderFromButton(s, b))[0];
      s.players[first].stack += rem;
    }
    potResults.push({
      winners,
      amount: pot.amount,
      potLabel: pots.length > 1 ? (idx === 0 ? "Main pot" : `Side pot ${idx}`) : "Pot",
    });
  });

  const showdown: ShowdownEntry[] = liveIds.map((id) => ({
    playerId: id,
    hole: s.players[id].hole as [Card, Card],
    hand: evals[id],
    hadToShow: true,
  }));

  s.summary = {
    handNumber: s.handNumber,
    potResults,
    showdown,
    board: [...s.board],
    heroNetChips: s.players[0].stack - s.stacksAtStart[0],
    uncalled,
  };
  for (const pr of potResults) {
    pushLog(
      s,
      "showdown",
      `${pr.winners.map((id) => s.players[id].name).join(", ")} wins ${pr.amount} (${pr.potLabel})`,
      "result",
    );
  }
  s.toAct = null;
  s.phase = "hand-over";
}

/* ---- Small read helpers used by the store / UI ---- */

export function heroSeat(s: GameState): Player {
  return s.players[0];
}

export function playersLeftOfButtonOrder(s: GameState): Player[] {
  const n = s.config.seats;
  const out: Player[] = [];
  for (let k = 1; k <= n; k++) out.push(s.players[(s.button + k) % n]);
  return out;
}

export function isHeroTurn(s: GameState): boolean {
  return s.phase === "betting" && s.toAct === 0;
}
