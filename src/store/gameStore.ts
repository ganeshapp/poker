import { create } from "zustand";
import { applyAction, createTable, legalActions, startHand } from "@/game/engine";
import { decideBot } from "@/game/botBrain";
import { engine as math } from "@/engine/engineClient";
import { ARCHETYPES } from "@/game/archetypes";
import { buildPreflopRanges } from "@/engine/ranges";
import { combosInSet, comboCount, cardsToLabel } from "@/engine/notation";
import type { HHHand } from "@/game/handHistory";
import type {
  Action,
  Archetype,
  Card,
  GameConfig,
  GameState,
  HandLabel,
  Player,
  Street,
} from "@/types/poker";
import { useStats } from "./statsStore";

export type Verdict = "mistake" | "thin" | "ok" | "great" | "info";

export interface CoachReview {
  id: number;
  kind: "decision" | "bot";
  blocking: boolean;
  verdict: Verdict;
  title: string;
  equity?: number;
  potOdds?: number;
  evChips?: number;
  villainName?: string;
  villainArchetype?: Archetype;
  villainRange?: HandLabel[];
  board: Card[];
  text: string;
  steps?: string[];
  opponents?: number;
  multiway?: boolean;
}

export interface GuessSession {
  open: boolean;
  botId: number;
  street: Street;
  revealed: boolean;
  scored: boolean;
  actualRange: HandLabel[];
  botHole: [Card, Card] | null;
  accuracy: number | null;
  precision: number | null;
  recall: number | null;
}

export type PlayMode = "manual" | "auto";

interface Settings {
  coachEnabled: boolean;
  mode: PlayMode;
  speedMs: number;
}

interface SessionData {
  active: boolean;
  startedAt: number;
  hands: number;
  netChips: number;
  history: HHHand[];
}

interface GameStore {
  table: GameState;
  thinking: boolean;
  paused: boolean;
  guess: GuessSession | null;
  settings: Settings;
  session: SessionData;
  sessionEnded: boolean;
  reviewLog: CoachReview[];
  activeReviewId: number | null;
  rangeView: { name: string; range: HandLabel[] } | null;
  lastActorSeat: number | null;

  newSession: () => void;
  endSession: () => void;
  closeSummary: () => void;
  deal: () => void;
  heroAction: (a: Action) => Promise<void>;
  stepBot: () => void;
  explainLastBotMove: () => void;
  reopenReview: (id?: number) => void;
  dismissReview: () => void;
  openRangeView: (name: string, range: HandLabel[]) => void;
  closeRangeView: () => void;
  openGuess: (botId: number) => void;
  peek: (painted: HandLabel[]) => void;
  closeGuess: () => void;
  setSettings: (p: Partial<Settings>) => void;
}

const CONFIG: GameConfig = { seats: 6, startingStack: 2000, smallBlind: 10, bigBlind: 20 };
const ARCHE_POOL: Archetype[] = ["TAG", "LAG", "Nit", "Station"];

function villainRangeFor(state: GameState, p: Player): HandLabel[] {
  const stored = state.botRanges[p.id];
  if (stored && stored.length) return stored;
  if (p.archetype) {
    const cfg = ARCHETYPES[p.archetype];
    return [...buildPreflopRanges(cfg.vpip, cfg.pfr, p.position).play];
  }
  return [];
}

function firstOpponentInHand(state: GameState): number {
  for (const p of state.players) if (!p.isHero && !p.hasFolded) return p.id;
  return 1;
}

export function scoreGuess(painted: HandLabel[], actual: HandLabel[]) {
  const pSet = new Set(painted);
  const aSet = new Set(actual);
  let inter = 0;
  for (const l of pSet) if (aSet.has(l)) inter += comboCount(l);
  const pc = combosInSet(pSet);
  const ac = combosInSet(aSet);
  const precision = pc > 0 ? inter / pc : 0;
  const recall = ac > 0 ? inter / ac : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  return { accuracy: f1, precision, recall };
}

function interpretBot(p: Player): string {
  if (!p.archetype) return "";
  const a = p.archetype;
  const label = p.lastAction?.label ?? "acts";
  if (label === "Fold") return `${p.name} folds — their range no longer matters this hand.`;
  if (label === "Check")
    return `A check from ${p.name} usually shows weakness or pot control. Consider betting to take it down.`;
  if (label === "Call" || label === "All-In") {
    if (a === "Station") return `${p.name} (Station) calls with almost anything — their range stays very wide and weak. Value bet relentlessly, never bluff.`;
    if (a === "Nit") return `Even a Nit's call is a fairly strong, capped range. Slow down with marginal hands.`;
    if (a === "LAG") return `${p.name} (LAG) calls wide and floats a lot — keep barreling good hands, expect bluff-catches.`;
    return `A call keeps ${p.name}'s range wide and uncapped — proceed with caution.`;
  }
  // Bet / Raise
  if (a === "Nit") return `A raise from a Nit is a red flag — expect a premium. Fold your marginal hands.`;
  if (a === "Station") return `${p.name} (Station) almost never raises — when they do, it's usually close to the nuts.`;
  if (a === "LAG") return `${p.name} (LAG) raises very wide; this is often a bluff or thin value. Don't over-fold.`;
  return `${p.name} (TAG) raises a credible, value-weighted range. Respect it unless you have a strong hand.`;
}

async function evaluateHero(state: GameState, action: Action, id: number): Promise<CoachReview | null> {
  const hero = state.players[0];
  if (!hero.hole) return null;
  const la = legalActions(state);
  if (action.type === "check") return null;

  const villId = state.aggressor != null && state.aggressor !== 0 ? state.aggressor : firstOpponentInHand(state);
  const vill = state.players[villId];
  const arche = vill.archetype;
  const cfg = arche ? ARCHETYPES[arche] : null;
  const range = villainRangeFor(state, vill);
  const combos = combosInSet(range);
  const bb = state.bigBlind;
  const heroLabel = cardsToLabel(hero.hole[0], hero.hole[1]);
  const boardStr = state.board.length ? state.board.join(" ") : "a pre-flop board";
  const opponents = state.players.filter((p) => !p.isHero && !p.hasFolded).length;
  const fieldMode = opponents > 1;
  const oppDesc = fieldMode ? `the ${opponents}-player field` : `${vill.name}'s range`;

  let equity = 0.5;
  let trials = 0;
  try {
    const r = fieldMode
      ? await math.equityVsField(hero.hole, state.board, opponents, 1600)
      : range.length
        ? await math.equityVsRange(hero.hole, state.board, range, 1600)
        : await math.equityVsRandom(hero.hole, state.board, 1600);
    equity = r.equity;
    trials = r.samples;
  } catch {
    equity = 0.5;
  }
  const pct = Math.round(equity * 100);
  const sourceLine = fieldMode
    ? `Equity is run against ${opponents} opponents as random hands (${trials}-trial sim) — more players, lower equity.`
    : `${vill.name}${cfg ? ` (${cfg.archetype})` : ""} range ≈ ${combos} combos (position + action).`;

  const base = {
    id,
    kind: "decision" as const,
    villainName: vill.name,
    villainArchetype: arche,
    villainRange: range,
    board: [...state.board],
    opponents,
    multiway: opponents > 1,
  };

  if (action.type === "fold") {
    if (la.toCall <= 0) return null;
    const cost = la.callAmount;
    const finalPot = state.pot + cost;
    const potOdds = cost / finalPot;
    const evCall = equity * finalPot - cost;
    if (evCall <= 1.5 * bb) return null;
    return {
      ...base,
      blocking: false,
      verdict: "mistake",
      title: "Fold spills value",
      equity,
      potOdds,
      evChips: evCall,
      text: `Against ${oppDesc} your ${heroLabel} has ${pct}% equity and you're getting ${Math.round(potOdds * 100)}% pot odds — calling is worth about +${(evCall / bb).toFixed(1)} bb.`,
      steps: [
        sourceLine,
        `${heroLabel} vs ${oppDesc} on ${boardStr} → ${pct}% equity.`,
        `Pot ${state.pot} + call ${cost} = ${finalPot}; pot odds = ${Math.round(potOdds * 100)}%.`,
        `EV(call) = ${pct}% × ${finalPot} − ${cost} ≈ +${evCall.toFixed(0)} chips (${(evCall / bb).toFixed(1)} bb) > EV(fold)=0.`,
      ],
    };
  }

  const cost = action.type === "call" ? la.callAmount : (action.amount ?? 0) - hero.committed;
  const finalPot = state.pot + cost;
  const potOdds = finalPot > 0 ? cost / finalPot : 0;
  const evAction = equity * finalPot - cost;

  if (action.type === "call") {
    let verdict: Verdict;
    let blocking = false;
    let text: string;
    if (evAction < -0.3 * bb) {
      verdict = "mistake";
      blocking = true;
      text = `Against ${oppDesc} your ${heroLabel} has only ${pct}% equity, but calling needs ${Math.round(potOdds * 100)}%. This call costs about ${(evAction / bb).toFixed(1)} bb — folding is better.`;
    } else if (equity < potOdds + 0.04) {
      verdict = "thin";
      text = `${pct}% equity vs ~${Math.round(potOdds * 100)}% needed — a marginal, close call against ${oppDesc}.`;
    } else {
      verdict = equity > 0.7 ? "great" : "ok";
      text = `${pct}% equity vs ${oppDesc}, needing ${Math.round(potOdds * 100)}% — a clear call worth +${(evAction / bb).toFixed(1)} bb.`;
    }
    return {
      ...base,
      blocking,
      verdict,
      title: "Your call",
      equity,
      potOdds,
      evChips: evAction,
      text,
      steps: [
        sourceLine,
        `${heroLabel} vs ${oppDesc} on ${boardStr} → ${pct}% equity.`,
        `Pot ${state.pot} + your call ${cost} = ${finalPot}; pot odds = ${cost}/${finalPot} = ${Math.round(potOdds * 100)}%.`,
        `EV(call) = ${pct}% × ${finalPot} − ${cost} ≈ ${evAction.toFixed(0)} chips (${(evAction / bb).toFixed(1)} bb). EV(fold) = 0.`,
        evAction < 0 ? `Because EV < 0, folding is the higher-EV play.` : `Because EV > 0, calling beats folding.`,
      ],
    };
  }

  // bet / raise
  let verdict: Verdict = "ok";
  let text: string;
  if (equity > 0.6) {
    verdict = "great";
    text = `Strong value — ${pct}% equity vs ${oppDesc}. Betting is correct.`;
  } else if (equity < 0.38 && cost > state.pot * 0.5) {
    verdict = "thin";
    text = `Aggressive: only ${pct}% equity if called. Works as a bluff but relies on folds.`;
  } else {
    text = `${pct}% equity vs ${oppDesc} — a reasonable bet mixing value and fold equity.`;
  }
  return {
    ...base,
    blocking: false,
    verdict,
    title: action.type === "bet" ? "Your bet" : "Your raise",
    equity,
    potOdds,
    evChips: evAction,
    text,
    steps: [
      sourceLine,
      `${heroLabel} vs ${oppDesc} on ${boardStr} → ${pct}% equity when called.`,
      `A bet also wins when opponents fold — fold equity isn't shown here, so treat this as the "called" floor.`,
    ],
  };
}

export const useGame = create<GameStore>((set, get) => {
  let loopToken = 0;
  let reviewSeq = 1;
  let currentHH: HHHand | null = null;

  const recordAction = (t: GameState, seat: number, action: Action) => {
    if (!currentHH) return;
    const p = t.players[seat];
    const la = legalActions(t);
    let amount = 0;
    let allIn = false;
    if (action.type === "call") {
      amount = la.callAmount;
      allIn = amount >= p.stack;
    } else if (action.type === "bet" || action.type === "raise") {
      amount = action.amount ?? 0;
      allIn = amount >= p.committed + p.stack;
    }
    currentHH.actions.push({ street: t.street, seat, name: p.name, type: action.type, amount, allIn });
  };

  const finalizeHand = (nt: GameState) => {
    if (currentHH) {
      currentHH.board = [...nt.board];
      currentHH.potResults = nt.summary?.potResults ?? [];
      currentHH.heroNet = nt.summary?.heroNetChips ?? 0;
      for (const p of nt.players) currentHH.holes[p.id] = p.hole ?? undefined;
      const hh = currentHH;
      currentHH = null;
      set((s) => ({
        session: {
          ...s.session,
          hands: s.session.hands + 1,
          netChips: s.session.netChips + (nt.summary?.heroNetChips ?? 0),
          history: [...s.session.history, hh],
        },
      }));
    }
    // lifetime stats
    if (nt.summary) {
      const heroNet = nt.summary.heroNetChips;
      const potTotal = nt.summary.potResults.reduce((a, b) => a + b.amount, 0);
      const won = nt.summary.potResults.some((pr) => pr.winners.includes(0));
      const archetypes = nt.players
        .filter((p) => !p.isHero && p.archetype && p.committedTotal > nt.bigBlind)
        .map((p) => p.archetype as Archetype);
      useStats.getState().recordHand(
        {
          n: nt.handNumber,
          netBb: heroNet / nt.bigBlind,
          potBb: potTotal / nt.bigBlind,
          showdown: nt.summary.showdown.length > 0,
          won,
          archetypes,
          ts: Date.now(),
        },
        heroNet,
      );
    }
  };

  const applyStep = (seat: number, action: Action, range?: HandLabel[] | null): GameState => {
    const t = get().table;
    recordAction(t, seat, action);
    let nt = applyAction(t, seat, action);
    if (range != null) nt = { ...nt, botRanges: { ...nt.botRanges, [seat]: range } };
    set({ table: nt, lastActorSeat: seat });
    if (nt.phase === "hand-over") finalizeHand(nt);
    return nt;
  };

  const scheduleLoop = () => {
    const myToken = ++loopToken;
    const step = () => {
      if (myToken !== loopToken) return;
      const s = get();
      const t = s.table;
      if (s.settings.mode !== "auto") return;
      if (s.paused || s.guess?.open) {
        set({ thinking: false });
        return;
      }
      if (t.phase !== "betting" || t.toAct === null || t.toAct === 0) {
        set({ thinking: false });
        return;
      }
      set({ thinking: true });
      const seat = t.toAct;
      const dec = decideBot(t, seat);
      const nt = applyStep(seat, dec.action, dec.range);
      if (nt.phase === "hand-over" || nt.toAct === 0) {
        set({ thinking: false });
        return;
      }
      window.setTimeout(step, s.settings.speedMs);
    };
    window.setTimeout(step, get().settings.speedMs);
  };

  const maybeAutoLoop = () => {
    if (get().settings.mode === "auto") scheduleLoop();
  };

  const pushReview = (review: CoachReview) => {
    set((s) => ({
      reviewLog: [...s.reviewLog, review],
      activeReviewId: review.id,
      paused: review.blocking ? true : s.paused,
    }));
  };

  return {
    table: createTable(CONFIG),
    thinking: false,
    paused: false,
    guess: null,
    settings: { coachEnabled: true, mode: "manual", speedMs: 700 },
    session: { active: false, startedAt: 0, hands: 0, netChips: 0, history: [] },
    sessionEnded: false,
    reviewLog: [],
    activeReviewId: null,
    rangeView: null,
    lastActorSeat: null,

    newSession: () => {
      const base = createTable(CONFIG);
      const players = base.players.map((p) =>
        p.isHero ? p : { ...p, archetype: ARCHE_POOL[Math.floor(Math.random() * ARCHE_POOL.length)] },
      );
      set({
        table: { ...base, players },
        session: { active: true, startedAt: Date.now(), hands: 0, netChips: 0, history: [] },
        sessionEnded: false,
        reviewLog: [],
        activeReviewId: null,
        guess: null,
        paused: false,
        thinking: false,
      });
      get().deal();
    },

    endSession: () => set({ sessionEnded: true }),

    closeSummary: () => set({ sessionEnded: false }),

    deal: () => {
      const s = get();
      if (!s.session.active) return;
      const t0 = s.table;
      if (t0.players[0].stack <= 0) {
        set({ sessionEnded: true });
        return;
      }
      const players = t0.players.map((p) =>
        !p.isHero && p.stack <= 0 ? { ...p, stack: t0.config.startingStack } : p,
      );
      const nt = startHand({ ...t0, players });
      currentHH = {
        id: nt.handNumber,
        startedAt: Date.now(),
        button: nt.button,
        sb: nt.smallBlind,
        bb: nt.bigBlind,
        sbSeat: (nt.button + 1) % nt.config.seats,
        bbSeat: (nt.button + 2) % nt.config.seats,
        seats: nt.players.map((p) => ({
          seat: p.id,
          name: p.name,
          stack: nt.stacksAtStart[p.id],
          isHero: p.isHero,
          position: p.position,
        })),
        holes: { 0: nt.players[0].hole ?? undefined },
        actions: [],
        board: [],
        potResults: [],
        heroNet: 0,
      };
      set({
        table: nt,
        reviewLog: [],
        activeReviewId: null,
        rangeView: null,
        guess: null,
        paused: false,
        thinking: false,
        lastActorSeat: null,
      });
      maybeAutoLoop();
    },

    heroAction: async (a) => {
      const t = get().table;
      if (t.phase !== "betting" || t.toAct !== 0) return;
      const id = reviewSeq++;
      const review = get().settings.coachEnabled ? await evaluateHero(t, a, id) : null;
      applyStep(0, a);
      if (review) {
        pushReview(review);
        if (review.kind === "decision") {
          useStats.getState().recordDecision({
            verdict: review.verdict,
            action: a.type,
            equity: review.equity ?? 0,
            potOdds: review.potOdds ?? 0,
            evBb: (review.evChips ?? 0) / t.bigBlind,
            street: t.street,
            villainArchetype: review.villainArchetype ?? null,
            ts: Date.now(),
          });
        }
      }
      if (!(review && review.blocking)) maybeAutoLoop();
    },

    stepBot: () => {
      const s = get();
      const t = s.table;
      if (s.paused || s.guess?.open) return;
      if (t.phase !== "betting" || t.toAct === null || t.toAct === 0) return;
      const seat = t.toAct;
      const dec = decideBot(t, seat);
      applyStep(seat, dec.action, dec.range);
    },

    explainLastBotMove: () => {
      const s = get();
      const seat = s.lastActorSeat;
      if (seat === null || seat === 0) return;
      const p = s.table.players[seat];
      if (!p.archetype) return;
      const review: CoachReview = {
        id: reviewSeq++,
        kind: "bot",
        blocking: false,
        verdict: "info",
        title: `${p.name}'s ${(p.lastAction?.label ?? "move").toLowerCase()}`,
        villainName: p.name,
        villainArchetype: p.archetype,
        villainRange: villainRangeFor(s.table, p),
        board: [...s.table.board],
        text: interpretBot(p),
      };
      pushReview(review);
    },

    reopenReview: (id) =>
      set((s) => ({ activeReviewId: id ?? s.reviewLog[s.reviewLog.length - 1]?.id ?? null })),

    dismissReview: () => {
      const wasBlocking = (() => {
        const s = get();
        return s.reviewLog.find((r) => r.id === s.activeReviewId)?.blocking;
      })();
      set({ activeReviewId: null, paused: false });
      if (wasBlocking) maybeAutoLoop();
    },

    openRangeView: (name, range) => set({ rangeView: { name, range } }),
    closeRangeView: () => set({ rangeView: null }),

    openGuess: (botId) => {
      const t = get().table;
      set({
        guess: {
          open: true,
          botId,
          street: t.street,
          revealed: false,
          scored: false,
          actualRange: [],
          botHole: null,
          accuracy: null,
          precision: null,
          recall: null,
        },
        paused: true,
      });
    },

    peek: (painted) => {
      const t = get().table;
      const g = get().guess;
      if (!g) return;
      const bot = t.players[g.botId];
      const actual = villainRangeFor(t, bot);
      const scored = painted.length > 0;
      const score = scored ? scoreGuess(painted, actual) : { accuracy: null, precision: null, recall: null };
      set({
        guess: {
          ...g,
          revealed: true,
          scored,
          actualRange: actual,
          botHole: bot.hole,
          accuracy: score.accuracy,
          precision: score.precision,
          recall: score.recall,
        },
      });
      if (scored && bot.archetype && score.accuracy !== null) {
        useStats.getState().recordGuess({
          accuracy: score.accuracy,
          archetype: bot.archetype,
          street: g.street,
          ts: Date.now(),
        });
      }
    },

    closeGuess: () => {
      set({ guess: null, paused: false });
      maybeAutoLoop();
    },

    setSettings: (p) => {
      set((s) => ({ settings: { ...s.settings, ...p } }));
      if (p.mode === "auto") maybeAutoLoop();
    },
  };
});
