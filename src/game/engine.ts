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

function assignPositions(s: GameState) {
  const n = s.config.seats;
  for (let seat = 0; seat < n; seat++) {
    const off = (seat - s.button + n) % n;
    s.players[seat].position = n === 6 ? POS6[off] : off === 0 ? "BTN" : off === 1 ? "SB" : off === 2 ? "BB" : "MP";
  }
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
  if (s.handNumber > 1) s.button = (s.button + 1) % s.config.seats;

  for (const p of s.players) {
    if (p.stack <= 0) p.stack = s.config.startingStack; // auto-rebuy for continuous training
    p.hole = null;
    p.revealed = false;
    p.hasFolded = false;
    p.isAllIn = false;
    p.committed = 0;
    p.committedTotal = 0;
    p.acted = false;
    p.lastAction = null;
    p.handsSeen += 1;
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
  for (const p of s.players) p.hole = [s.deck.pop()!, s.deck.pop()!];
  s.stacksAtStart = s.players.map((p) => p.stack);

  const sbSeat = seatAtOffset(s, 1);
  const bbSeat = seatAtOffset(s, 2);
  postBlind(s, sbSeat, s.smallBlind, "SB");
  postBlind(s, bbSeat, s.bigBlind, "BB");
  s.aggressor = bbSeat;

  pushLog(s, "preflop", `Hand #${s.handNumber} · blinds ${s.smallBlind}/${s.bigBlind}`, "deal");

  s.toAct = nextLiveActor(s, seatAtOffset(s, 3), true);
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
      const amt = Math.min(toCall, p.stack);
      commit(s, p, amt);
      p.acted = true;
      p.lastAction = { label: p.isAllIn ? "All-In" : "Call", street: s.street };
      pushLog(s, s.street, `${p.name} calls ${amt}${p.isAllIn ? " (all-in)" : ""}`, "action");
      break;
    }
    case "bet": {
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

function buildSidePots(contribs: { id: number; amt: number; folded: boolean }[]): RawPot[] {
  let rem = contribs.filter((c) => c.amt > 0).map((c) => ({ ...c }));
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
      pots.push({ amount, eligible });
    }
    rem = rem.map((c) => ({ ...c, amt: c.amt - min })).filter((c) => c.amt > 0);
  }
  return pots;
}

function settleByFold(s: GameState, winnerId: number) {
  const w = s.players[winnerId];
  const amount = s.pot;
  w.stack += amount;
  s.summary = {
    handNumber: s.handNumber,
    potResults: [{ winners: [winnerId], amount, potLabel: "Pot" }],
    showdown: [],
    board: [...s.board],
    heroNetChips: s.players[0].stack - s.stacksAtStart[0],
  };
  pushLog(s, s.street, `${w.name} wins ${amount} (uncontested)`, "result");
  s.toAct = null;
  s.phase = "hand-over";
}

function settleShowdown(s: GameState) {
  const liveIds = s.players.filter((p) => !p.hasFolded).map((p) => p.id);
  for (const id of liveIds) s.players[id].revealed = true;

  const evals: Record<number, EvaluatedHand> = {};
  for (const id of liveIds) {
    const p = s.players[id];
    evals[id] = evaluateCards([...(p.hole as [Card, Card]), ...s.board]);
  }

  const contribs = s.players.map((p) => ({ id: p.id, amt: p.committedTotal, folded: p.hasFolded }));
  const pots = buildSidePots(contribs);
  const potResults: PotResult[] = [];

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
