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
  /** Hero's position this hand (recorded from schema v2 on). */
  position?: string | null;
  /** Hero saw the flop (didn't fold preflop) — v3 on. */
  sawFlop?: boolean;
  /** Full serialized HHHand — makes every hand replayable after a
      restart. Persisted, but not loaded into the stats snapshot. */
  handJson?: string;
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
const LS_HANDS_KEY = "allin.hands.v1";
const HISTORY_CAP = 800;
/** Replayable hands kept in the localStorage fallback (quota-bound;
    SQLite keeps every hand). */
const LS_HANDS_CAP = 100;
const SCHEMA_VERSION = 3;

type Backend = "sqlite" | "local";
let backend: Backend | null = null;
let lastError: string | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any = null;

/** Which storage backend is live, and the last error that caused a
    fallback (for the diagnostics surface). */
export function backendInfo(): { backend: Backend | null; lastError: string | null } {
  return { backend, lastError };
}

function noteError(context: string, e: unknown) {
  lastError = `${context}: ${String(e)}`;
  console.warn(lastError);
}

async function migrate() {
  const rows = (await db.select(`PRAGMA user_version;`)) as { user_version: number }[];
  const v = rows[0]?.user_version ?? 0;
  if (v < 2) {
    // v2: hero position + full replayable hand payloads.
    const addColumn = async (sql: string) => {
      try {
        await db.execute(sql);
      } catch {
        /* column already exists (partial earlier migration) */
      }
    };
    await addColumn(`ALTER TABLE hand_history ADD COLUMN position TEXT;`);
    await addColumn(`ALTER TABLE hand_history ADD COLUMN hand_json TEXT;`);
    await addColumn(`ALTER TABLE decisions ADD COLUMN position TEXT;`);
  }
  if (v < 3) {
    // v3: whether hero saw the flop (WTSD/W$SD denominators).
    try {
      await db.execute(`ALTER TABLE hand_history ADD COLUMN saw_flop INTEGER;`);
    } catch {
      /* exists */
    }
  }
  await db.execute(`PRAGMA user_version = ${SCHEMA_VERSION};`);
}

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
      await migrate();
      backend = "sqlite";
      return backend;
    } catch (e) {
      noteError("SQLite unavailable, using localStorage", e);
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
      `SELECT n, net_bb, pot_bb, showdown, won, archetypes, position, saw_flop, ts FROM hand_history ORDER BY id DESC LIMIT ${HISTORY_CAP};`,
    )) as Record<string, unknown>[];
    const guesses = (await db.select(
      `SELECT accuracy, archetype, street, ts FROM range_guess ORDER BY id DESC LIMIT ${HISTORY_CAP};`,
    )) as Record<string, unknown>[];
    const decisions = (await db.select(
      `SELECT verdict, action, equity, pot_odds, ev_bb, street, archetype, position, ts FROM decisions ORDER BY id DESC LIMIT ${HISTORY_CAP};`,
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
          position: (h.position as string) || null,
          sawFlop: h.saw_flop == null ? undefined : !!h.saw_flop,
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
          position: (d.position as string) || null,
          ts: Number(d.ts),
        })),
    };
  } catch (e) {
    noteError("SQLite read failed, falling back", e);
    backend = "local";
    return readLocal();
  }
}

/* ---- Replayable hands (full HHHand payloads) ---- */

function readLocalHands(): string[] {
  try {
    const raw = localStorage.getItem(LS_HANDS_KEY);
    if (raw) return JSON.parse(raw) as string[];
  } catch {
    /* ignore */
  }
  return [];
}

/** Most-recent-first serialized hands for the replayer. */
export async function loadRecentHands(limit = 50): Promise<string[]> {
  const b = await ensureBackend();
  if (b === "sqlite") {
    try {
      const rows = (await db.select(
        `SELECT hand_json FROM hand_history WHERE hand_json IS NOT NULL ORDER BY id DESC LIMIT ${limit};`,
      )) as { hand_json: string }[];
      return rows.map((r) => r.hand_json);
    } catch (e) {
      noteError("SQLite hand read failed", e);
    }
  }
  return readLocalHands().slice(0, limit);
}

/** Everything, as a JSON string — the pre-reset backup. */
export async function exportBackup(): Promise<string> {
  const b = await ensureBackend();
  const snapshot = await loadStats();
  const hands = await loadRecentHands(b === "sqlite" ? 100000 : LS_HANDS_CAP);
  return JSON.stringify({ exportedAt: Date.now(), backend: b, snapshot, hands }, null, 0);
}

export async function persistHand(rec: HandRecord, netChipsDelta: number): Promise<void> {
  const b = await ensureBackend();
  if (b === "sqlite") {
    try {
      await db.execute(
        `INSERT INTO hand_history (n, net_bb, pot_bb, showdown, won, archetypes, position, saw_flop, hand_json, ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          rec.n,
          rec.netBb,
          rec.potBb,
          rec.showdown ? 1 : 0,
          rec.won ? 1 : 0,
          JSON.stringify(rec.archetypes),
          rec.position ?? null,
          rec.sawFlop == null ? null : rec.sawFlop ? 1 : 0,
          rec.handJson ?? null,
          rec.ts,
        ],
      );
      await db.execute(
        `UPDATE user_stats SET hands_played = hands_played + 1, net_chips = net_chips + ? WHERE id = 1;`,
        [Math.round(netChipsDelta)],
      );
      return;
    } catch (e) {
      noteError("SQLite write failed, falling back", e);
      backend = "local";
    }
  }
  const s = readLocal();
  s.handsPlayed += 1;
  s.netChips += Math.round(netChipsDelta);
  const { handJson, ...slim } = rec;
  s.history.push(slim);
  if (s.history.length > HISTORY_CAP) s.history.splice(0, s.history.length - HISTORY_CAP);
  writeLocal(s);
  if (handJson) {
    try {
      const hands = readLocalHands();
      hands.unshift(handJson);
      localStorage.setItem(LS_HANDS_KEY, JSON.stringify(hands.slice(0, LS_HANDS_CAP)));
    } catch {
      /* quota — drop oldest hands silently */
    }
  }
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
      noteError("SQLite write failed, falling back", e);
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
        `INSERT INTO decisions (verdict, action, equity, pot_odds, ev_bb, street, archetype, position, ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [rec.verdict, rec.action, rec.equity, rec.potOdds, rec.evBb, rec.street, rec.villainArchetype, rec.position ?? null, rec.ts],
      );
      return;
    } catch (e) {
      noteError("SQLite write failed, falling back", e);
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
  try {
    localStorage.removeItem(LS_HANDS_KEY);
  } catch {
    /* ignore */
  }
}
