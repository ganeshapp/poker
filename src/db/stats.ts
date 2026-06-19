import type { Archetype } from "@/types/poker";
import type { DecisionRecord } from "@/lib/leaks";
import { isNative } from "@/engine/engineClient";

/* ==================================================================
   Persistence layer.

   Primary backend: local SQLite via the Tauri SQL plugin (per the
   Notes spec). Falls back to localStorage in a plain browser, and on
   any SQL error — so stats tracking never breaks the app.
   ================================================================== */

export interface HandRecord {
  n: number;
  netBb: number;
  potBb: number;
  showdown: boolean;
  won: boolean;
  archetypes: Archetype[];
  ts: number;
}

export interface GuessRecord {
  accuracy: number;
  archetype: Archetype | null;
  street: string;
  ts: number;
}

export interface StatsSnapshot {
  handsPlayed: number;
  netChips: number;
  bigBlind: number;
  history: HandRecord[];
  guesses: GuessRecord[];
  decisions: DecisionRecord[];
}

const LS_KEY = "allin.stats.v1";
const HISTORY_CAP = 800;

type Backend = "sqlite" | "local";
let backend: Backend | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any = null;

async function ensureBackend(): Promise<Backend> {
  if (backend) return backend;
  if (isNative()) {
    try {
      const mod = await import("@tauri-apps/plugin-sql");
      const Database = mod.default;
      db = await Database.load("sqlite:allin.db");
      await db.execute(
        `CREATE TABLE IF NOT EXISTS user_stats (
           id INTEGER PRIMARY KEY CHECK (id = 1),
           hands_played INTEGER NOT NULL DEFAULT 0,
           net_chips INTEGER NOT NULL DEFAULT 0,
           big_blind INTEGER NOT NULL DEFAULT 20
         );`,
      );
      await db.execute(`INSERT OR IGNORE INTO user_stats (id) VALUES (1);`);
      await db.execute(
        `CREATE TABLE IF NOT EXISTS hand_history (
           id INTEGER PRIMARY KEY AUTOINCREMENT,
           n INTEGER, net_bb REAL, pot_bb REAL,
           showdown INTEGER, won INTEGER, archetypes TEXT, ts INTEGER
         );`,
      );
      await db.execute(
        `CREATE TABLE IF NOT EXISTS range_guess (
           id INTEGER PRIMARY KEY AUTOINCREMENT,
           accuracy REAL, archetype TEXT, street TEXT, ts INTEGER
         );`,
      );
      await db.execute(
        `CREATE TABLE IF NOT EXISTS decisions (
           id INTEGER PRIMARY KEY AUTOINCREMENT,
           verdict TEXT, action TEXT, equity REAL, pot_odds REAL,
           ev_bb REAL, street TEXT, archetype TEXT, ts INTEGER
         );`,
      );
      backend = "sqlite";
      return backend;
    } catch (e) {
      console.warn("SQLite unavailable, using localStorage:", e);
    }
  }
  backend = "local";
  return backend;
}

function readLocal(): StatsSnapshot {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw) as StatsSnapshot;
  } catch {
    /* ignore */
  }
  return { handsPlayed: 0, netChips: 0, bigBlind: 20, history: [], guesses: [], decisions: [] };
}

function writeLocal(s: StatsSnapshot) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  } catch {
    /* ignore quota errors */
  }
}

export async function loadStats(): Promise<StatsSnapshot> {
  const b = await ensureBackend();
  if (b === "local") return readLocal();
  try {
    const us = (await db.select(`SELECT hands_played, net_chips, big_blind FROM user_stats WHERE id = 1;`)) as {
      hands_played: number;
      net_chips: number;
      big_blind: number;
    }[];
    const hist = (await db.select(
      `SELECT n, net_bb, pot_bb, showdown, won, archetypes, ts FROM hand_history ORDER BY id DESC LIMIT ${HISTORY_CAP};`,
    )) as Record<string, unknown>[];
    const guesses = (await db.select(
      `SELECT accuracy, archetype, street, ts FROM range_guess ORDER BY id DESC LIMIT ${HISTORY_CAP};`,
    )) as Record<string, unknown>[];
    const decisions = (await db.select(
      `SELECT verdict, action, equity, pot_odds, ev_bb, street, archetype, ts FROM decisions ORDER BY id DESC LIMIT ${HISTORY_CAP};`,
    )) as Record<string, unknown>[];
    return {
      handsPlayed: us[0]?.hands_played ?? 0,
      netChips: us[0]?.net_chips ?? 0,
      bigBlind: us[0]?.big_blind ?? 20,
      history: hist
        .reverse()
        .map((h) => ({
          n: Number(h.n),
          netBb: Number(h.net_bb),
          potBb: Number(h.pot_bb),
          showdown: !!h.showdown,
          won: !!h.won,
          archetypes: JSON.parse((h.archetypes as string) || "[]"),
          ts: Number(h.ts),
        })),
      guesses: guesses
        .reverse()
        .map((g) => ({
          accuracy: Number(g.accuracy),
          archetype: (g.archetype as Archetype) || null,
          street: String(g.street),
          ts: Number(g.ts),
        })),
      decisions: decisions
        .reverse()
        .map((d) => ({
          verdict: (d.verdict as DecisionRecord["verdict"]) || "ok",
          action: (d.action as DecisionRecord["action"]) || "call",
          equity: Number(d.equity),
          potOdds: Number(d.pot_odds),
          evBb: Number(d.ev_bb),
          street: String(d.street),
          villainArchetype: (d.archetype as string) || null,
          ts: Number(d.ts),
        })),
    };
  } catch (e) {
    console.warn("SQLite read failed, falling back:", e);
    backend = "local";
    return readLocal();
  }
}

export async function persistHand(rec: HandRecord, netChipsDelta: number): Promise<void> {
  const b = await ensureBackend();
  if (b === "sqlite") {
    try {
      await db.execute(
        `INSERT INTO hand_history (n, net_bb, pot_bb, showdown, won, archetypes, ts) VALUES (?, ?, ?, ?, ?, ?, ?);`,
        [rec.n, rec.netBb, rec.potBb, rec.showdown ? 1 : 0, rec.won ? 1 : 0, JSON.stringify(rec.archetypes), rec.ts],
      );
      await db.execute(
        `UPDATE user_stats SET hands_played = hands_played + 1, net_chips = net_chips + ? WHERE id = 1;`,
        [Math.round(netChipsDelta)],
      );
      return;
    } catch (e) {
      console.warn("SQLite write failed, falling back:", e);
      backend = "local";
    }
  }
  const s = readLocal();
  s.handsPlayed += 1;
  s.netChips += Math.round(netChipsDelta);
  s.history.push(rec);
  if (s.history.length > HISTORY_CAP) s.history.splice(0, s.history.length - HISTORY_CAP);
  writeLocal(s);
}

export async function persistGuess(rec: GuessRecord): Promise<void> {
  const b = await ensureBackend();
  if (b === "sqlite") {
    try {
      await db.execute(`INSERT INTO range_guess (accuracy, archetype, street, ts) VALUES (?, ?, ?, ?);`, [
        rec.accuracy,
        rec.archetype,
        rec.street,
        rec.ts,
      ]);
      return;
    } catch (e) {
      console.warn("SQLite write failed, falling back:", e);
      backend = "local";
    }
  }
  const s = readLocal();
  s.guesses.push(rec);
  if (s.guesses.length > HISTORY_CAP) s.guesses.splice(0, s.guesses.length - HISTORY_CAP);
  writeLocal(s);
}

export async function persistDecision(rec: DecisionRecord): Promise<void> {
  const b = await ensureBackend();
  if (b === "sqlite") {
    try {
      await db.execute(
        `INSERT INTO decisions (verdict, action, equity, pot_odds, ev_bb, street, archetype, ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
        [rec.verdict, rec.action, rec.equity, rec.potOdds, rec.evBb, rec.street, rec.villainArchetype, rec.ts],
      );
      return;
    } catch (e) {
      console.warn("SQLite write failed, falling back:", e);
      backend = "local";
    }
  }
  const s = readLocal();
  s.decisions.push(rec);
  if (s.decisions.length > HISTORY_CAP) s.decisions.splice(0, s.decisions.length - HISTORY_CAP);
  writeLocal(s);
}

export async function resetStats(): Promise<void> {
  const b = await ensureBackend();
  if (b === "sqlite") {
    try {
      await db.execute(`DELETE FROM hand_history;`);
      await db.execute(`DELETE FROM range_guess;`);
      await db.execute(`DELETE FROM decisions;`);
      await db.execute(`UPDATE user_stats SET hands_played = 0, net_chips = 0 WHERE id = 1;`);
      return;
    } catch {
      backend = "local";
    }
  }
  writeLocal({ handsPlayed: 0, netChips: 0, bigBlind: 20, history: [], guesses: [], decisions: [] });
}
