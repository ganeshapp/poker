import type { Archetype, ArchetypeConfig } from "../types/poker.ts";

/* The four bot archetypes, parameterised by VPIP / PFR plus a couple of
   behavioural knobs used by the postflop heuristics. */
export const ARCHETYPES: Record<Archetype, ArchetypeConfig> = {
  TAG: {
    archetype: "TAG",
    name: "Tight-Aggressive",
    blurb: "Plays few hands but bets and raises them hard. The textbook winner.",
    vpip: 22,
    pfr: 18,
    cbetFlop: 65,
    aggression: 0.72,
    stickiness: 0.28,
    color: "#2f6fd0",
  },
  LAG: {
    archetype: "LAG",
    name: "Loose-Aggressive",
    blurb: "Plays many hands with relentless pressure. Hard to put on a hand.",
    vpip: 34,
    pfr: 27,
    cbetFlop: 72,
    aggression: 0.86,
    stickiness: 0.34,
    color: "#8a5cd1",
  },
  Nit: {
    archetype: "Nit",
    name: "Nit",
    blurb: "Extremely tight. If a Nit raises, believe them.",
    vpip: 12,
    pfr: 9,
    cbetFlop: 55,
    aggression: 0.5,
    stickiness: 0.2,
    color: "#2faa66",
  },
  Station: {
    archetype: "Station",
    name: "Calling Station",
    blurb: "Calls far too much, rarely raises. Value-bet relentlessly, never bluff.",
    vpip: 46,
    pfr: 7,
    cbetFlop: 32,
    aggression: 0.18,
    stickiness: 0.82,
    color: "#d23b3b",
  },
};

export const ARCHETYPE_LIST: ArchetypeConfig[] = [
  ARCHETYPES.TAG,
  ARCHETYPES.LAG,
  ARCHETYPES.Nit,
  ARCHETYPES.Station,
];

const BOT_NAMES = [
  "Ivey", "Negreanu", "Polk", "Selbst", "Hellmuth",
  "Brunson", "Antonius", "Dwan", "Galfond", "Chidwick",
];

export function botNameFor(seat: number): string {
  return BOT_NAMES[(seat - 1 + BOT_NAMES.length) % BOT_NAMES.length];
}

/** Deterministic-ish spread of archetypes across the bot seats. */
export function archetypeForSeat(seat: number): Archetype {
  const order: Archetype[] = ["TAG", "Station", "LAG", "Nit", "TAG", "LAG"];
  return order[(seat - 1) % order.length];
}
