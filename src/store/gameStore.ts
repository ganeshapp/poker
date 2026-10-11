import { create } from "zustand";
import { applyAction, createTable, legalActions, startHand } from "@/game/engine";
import { decideBot } from "@/game/botBrain";
import { engine as math } from "@/engine/engineClient";
import { readBotAction, type BotMoveSnapshot } from "@/game/botRead";
import { evaluateHero, villainRangeFor, scoreGuess, snapshotMove } from "@/game/coach";
import { useSettings, coachThresholds } from "./settingsStore";
import { useGoals } from "./goalStore";
import { ARCHETYPES } from "@/game/archetypes";
import type { HHHand } from "@/game/handHistory";
import type {
  Action,
  Archetype,
  Card,
  GameConfig,
  GameState,
  HandLabel,
  Street,
} from "@/types/poker";
import { useStats } from "./statsStore";
import { useLeaks } from "./leakStore";
import type { DrillAction, DrillOption } from "@/engine/puzzles";

export type { Verdict, CoachReview } from "./coachTypes";
import type { CoachReview } from "./coachTypes";


export interface GuessSession {
  open: boolean;
  botId: number;
  street: Street;
  revealed: boolean;
  scored: boolean;
  actualRange: HandLabel[];
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
  /** The last bot action, captured as they made it (see `snapshotMove`). */
  lastBotMove: { seat: number; snapshot: BotMoveSnapshot } | null;

  newSession: (opts?: TableOptions) => void;
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

const BASE_CONFIG: GameConfig = { seats: 6, startingStack: 2000, smallBlind: 10, bigBlind: 20 };
const TABLE_KEY = "allin.table.v1";

export interface TableOptions {
  seats: 2 | 6 | 9;
  ante: number; // chips
  /** false = busted bots leave and the table plays down short-handed. */
  botRebuy: boolean;
}

export function loadTableOptions(): TableOptions {
  try {
    const v = JSON.parse(localStorage.getItem(TABLE_KEY) || "{}");
    return {
      seats: v.seats === 2 || v.seats === 9 ? v.seats : 6,
      ante: v.ante === 5 ? 5 : 0,
      botRebuy: v.botRebuy !== false,
    };
  } catch {
    return { seats: 6, ante: 0, botRebuy: true };
  }
}

function saveTableOptions(o: TableOptions) {
  try {
    localStorage.setItem(TABLE_KEY, JSON.stringify(o));
  } catch {
    /* ignore */
  }
}
const ARCHE_POOL: Archetype[] = ["TAG", "LAG", "Nit", "Station"];

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
    let handJson: string | undefined;
    if (currentHH) {
      currentHH.board = [...nt.board];
      currentHH.potResults = nt.summary?.potResults ?? [];
      currentHH.uncalled = nt.summary?.uncalled;
      currentHH.heroNet = nt.summary?.heroNetChips ?? 0;
      for (const p of nt.players) currentHH.holes[p.id] = p.hole ?? undefined;
      const hh = currentHH;
      currentHH = null;
      handJson = JSON.stringify(hh);
      set((s) => ({
        session: {
          ...s.session,
          hands: s.session.hands + 1,
          netChips: s.session.netChips + (nt.summary?.heroNetChips ?? 0),
          history: [...s.session.history, hh],
        },
      }));
    }
    useGoals.getState().record("hand");
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
          position: nt.players[0].position,
          sawFlop: nt.players[0].foldedStreet !== "preflop",
          handJson,
          ts: Date.now(),
        },
        heroNet,
      );
    }
  };

  const applyStep = (seat: number, action: Action, range?: HandLabel[] | null): GameState => {
    const t = get().table;
    recordAction(t, seat, action);
    // Snapshot BEFORE the action is applied: `applyAction` deals the next
    // street when the round closes, so reading the table afterwards shows a
    // board the player never saw.
    const snap = seat === 0 ? null : snapshotMove(t, seat, action, range ?? null);
    let nt = applyAction(t, seat, action);
    if (range != null) nt = { ...nt, botRanges: { ...nt.botRanges, [seat]: range } };
    set({ table: nt, lastActorSeat: seat, lastBotMove: snap ?? get().lastBotMove });
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
    table: createTable(BASE_CONFIG),
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
    lastBotMove: null,

    newSession: (opts) => {
      const table = opts ?? loadTableOptions();
      saveTableOptions(table);
      const base = createTable({
        ...BASE_CONFIG,
        seats: table.seats,
        ante: table.ante,
        botRebuy: table.botRebuy,
      });
      const jitter = (v: number, frac: number, lo: number, hi: number) =>
        Math.min(hi, Math.max(lo, v * (1 - frac + Math.random() * 2 * frac)));
      const players = base.players.map((p) => {
        if (p.isHero) return p;
        const archetype = ARCHE_POOL[Math.floor(Math.random() * ARCHE_POOL.length)];
        const cfg = ARCHETYPES[archetype];
        return {
          ...p,
          archetype,
          dials: {
            aggression: jitter(cfg.aggression, 0.2, 0.05, 0.95),
            stickiness: jitter(cfg.stickiness, 0.2, 0.05, 0.95),
            cbetFlop: jitter(cfg.cbetFlop, 0.15, 20, 95),
          },
        };
      });
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
      // Playing down: once the last bot is gone there is nobody to deal to,
      // so the session ends on the hero having taken the whole table.
      if (t0.config.botRebuy === false && t0.players.filter((p) => !p.sittingOut && p.stack > 0).length < 2) {
        set({ sessionEnded: true });
        return;
      }
      // `startHand` owns what happens to an empty stack — topping it up or
      // sitting it out, depending on the table.
      const nt = startHand(t0);
      currentHH = {
        id: nt.handNumber,
        startedAt: Date.now(),
        button: nt.button,
        sb: nt.smallBlind,
        bb: nt.bigBlind,
        // Who actually posted, so a short-handed table exports correctly.
        sbSeat: nt.players.find((p) => p.lastAction?.label === "SB")?.id ?? nt.button,
        bbSeat: nt.players.find((p) => p.lastAction?.label === "BB")?.id ?? nt.button,
        tableSize: nt.config.seats,
        seats: nt.players.filter((p) => !p.sittingOut).map((p) => ({
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
      const coachEnabled = get().settings.coachEnabled;
      // Apply the action immediately — the coach evaluates in the
      // background and pauses auto-play if the verdict is blocking.
      applyStep(0, a);
      maybeAutoLoop();
      if (!coachEnabled) return;
      const st = useSettings.getState();
      const { mistakeBb, foldFlagBb } = coachThresholds(st.coachStrictness);
      const review = await evaluateHero(t, a, id, {
        mistakeBb,
        foldFlagBb,
        baseIters: st.simQuality === "high" ? 4000 : 1600,
      }, math);
      if (review) {
        // Stats and leaks always record; the panel (and a blocking
        // pause) only if the verdict still belongs to the current hand.
        if (get().table.handNumber === t.handNumber) pushReview(review);
        if (review.kind === "decision") {
          useStats.getState().recordDecision({
            verdict: review.verdict,
            action: a.type,
            equity: review.equity ?? 0,
            potOdds: review.potOdds ?? 0,
            evBb: (review.evChips ?? 0) / t.bigBlind,
            street: t.street,
            villainArchetype: review.villainArchetype ?? null,
            position: t.players[0].position,
            ts: Date.now(),
          });

          // Capture clear mistakes so they can be re-drilled in "My leaks".
          if (review.verdict === "mistake") {
            const la2 = legalActions(t);
            const bb = t.bigBlind;
            // Best alternative per mistake type: bad call -> fold, bad
            // fold -> call, missed-value check -> bet, bad bluff bet ->
            // check, bad raise -> fold.
            const best: DrillAction =
              a.type === "call" ? "fold" : a.type === "fold" ? "call" : a.type === "check" ? "bet" : a.type === "bet" ? "check" : "fold";
            const options: DrillOption[] =
              la2.toCall > 0
                ? [
                    { action: "fold", label: "Fold" },
                    { action: "call", label: `Call ${(la2.callAmount / bb).toFixed(1)} bb`, amount: la2.callAmount },
                    { action: "raise", label: "Raise", amount: Math.round(t.pot + la2.callAmount) },
                  ]
                : [
                    { action: "check", label: "Check" },
                    { action: "bet", label: "Bet", amount: Math.round(t.pot * 0.66) },
                  ];
            useLeaks.getState().add({
              id: `${t.handNumber}-${t.street}-${Date.now()}`,
              street: t.street,
              heroPos: t.players[0].position,
              hole: t.players[0].hole as [Card, Card],
              board: [...t.board],
              pot: t.pot,
              toCall: la2.callAmount,
              bb,
              oppActive: t.players.filter((p) => !p.isHero && !p.hasFolded).map((p) => p.position),
              options,
              best,
              rationale: review.text,
              equity: review.equity,
              potOdds: review.potOdds,
              ts: Date.now(),
            });
          }
        }
      }
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
      const snap = s.lastBotMove;
      if (!snap || snap.seat !== seat) {
        // Honest rather than boilerplate: the read needs the pot, board and
        // price from the moment they acted, and that moment is gone.
        pushReview({
          id: reviewSeq++,
          kind: "bot",
          blocking: false,
          verdict: "info",
          title: "Last move",
          villainName: p.name,
          villainArchetype: p.archetype,
          board: [...s.table.board],
          text: `That read can't be rebuilt — it needs the pot, the board and the price from the moment ${p.name} acted. Ask again after their next action.`,
        });
        return;
      }
      const read = readBotAction(snap.snapshot);
      pushReview({
        id: reviewSeq++,
        kind: "bot",
        blocking: false,
        verdict: "info",
        title: read.title,
        villainName: p.name,
        villainArchetype: p.archetype,
        villainRange: read.confidence === "none" ? undefined : villainRangeFor(s.table, p),
        board: [...snap.snapshot.board],
        plain: read.plain,
        text: read.steps[0] ?? read.plain,
        steps: read.steps,
        expert: read.expert,
      });
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
