/* ============================================================
   Core domain types for All-In
   ============================================================ */

export type Suit = "c" | "d" | "h" | "s";
export type Rank =
  | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"
  | "T" | "J" | "Q" | "K" | "A";

/** A card as a compact 2-char string, e.g. "Ah", "Td", "2c". */
export type Card = string;

export const RANKS: Rank[] = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
export const SUITS: Suit[] = ["c", "d", "h", "s"];
/** Ranks in descending order — used for the 13x13 matrix (A high, top-left). */
export const RANKS_DESC: Rank[] = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];

/** Made-hand categories, ordered weakest → strongest.
 *  (const object rather than `enum` so the engine runs under Node's
 *  type-stripping for tests, and to avoid enum runtime pitfalls.) */
export const HandCategory = {
  HighCard: 0,
  Pair: 1,
  TwoPair: 2,
  Trips: 3,
  Straight: 4,
  Flush: 5,
  FullHouse: 6,
  Quads: 7,
  StraightFlush: 8,
} as const;
export type HandCategory = (typeof HandCategory)[keyof typeof HandCategory];

export const HAND_CATEGORY_NAMES: Record<HandCategory, string> = {
  [HandCategory.HighCard]: "High Card",
  [HandCategory.Pair]: "Pair",
  [HandCategory.TwoPair]: "Two Pair",
  [HandCategory.Trips]: "Three of a Kind",
  [HandCategory.Straight]: "Straight",
  [HandCategory.Flush]: "Flush",
  [HandCategory.FullHouse]: "Full House",
  [HandCategory.Quads]: "Four of a Kind",
  [HandCategory.StraightFlush]: "Straight Flush",
};

export interface EvaluatedHand {
  category: HandCategory;
  /** Monotonic score; higher is better. Safe to compare across any 5–7 card hands. */
  score: number;
  name: string;
}

/** Hand label for the 13x13 grid, e.g. "AKs", "AKo", "TT". */
export type HandLabel = string;

export type Position = "UTG" | "MP" | "CO" | "BTN" | "SB" | "BB";

export type Street = "preflop" | "flop" | "turn" | "river" | "showdown";

export type ActionType = "fold" | "check" | "call" | "bet" | "raise" | "post";

export interface Action {
  type: ActionType;
  /** Total chips this action puts in front of the player on this street (for bet/raise/call). */
  amount?: number;
  allIn?: boolean;
}

export type Archetype = "TAG" | "LAG" | "Nit" | "Station";

export interface ArchetypeConfig {
  archetype: Archetype;
  name: string;
  blurb: string;
  vpip: number; // %
  pfr: number; // %
  cbetFlop: number; // %
  /** Aggression factor used to bias bet/raise vs call postflop. */
  aggression: number;
  /** How sticky they are with marginal made hands (calldown tendency 0..1). */
  stickiness: number;
  color: string;
}

export interface PlayerLastAction {
  label: string; // "Raise", "Call", "Check", "Fold", "All-In", "SB", "BB"
  street: Street;
}

export interface Player {
  id: number; // seat index 0..n-1; 0 is hero
  name: string;
  isHero: boolean;
  archetype?: Archetype;
  stack: number;
  hole: [Card, Card] | null;
  /** Cards revealed at showdown (for bots). */
  revealed: boolean;
  hasFolded: boolean;
  isAllIn: boolean;
  /** Chips committed on the current street. */
  committed: number;
  /** Total chips committed across all streets this hand. */
  committedTotal: number;
  /** Has acted since the last bet/raise on the current street. */
  acted: boolean;
  position: Position;
  lastAction: PlayerLastAction | null;
  /** Observed live stats (for the HUD). */
  handsSeen: number;
  vpipCount: number;
  pfrCount: number;
  sittingOut: boolean;
}

export type GamePhase = "idle" | "betting" | "street-end" | "showdown" | "hand-over";

export interface PotResult {
  winners: number[]; // player ids
  amount: number;
  potLabel: string; // "Main pot" / "Side pot 1"
}

export interface ShowdownEntry {
  playerId: number;
  hole: [Card, Card];
  hand: EvaluatedHand | null; // null if folded / mucked
  hadToShow: boolean;
}

export interface HandSummary {
  handNumber: number;
  potResults: PotResult[];
  showdown: ShowdownEntry[];
  board: Card[];
  heroNetChips: number;
}

export interface LogEntry {
  id: number;
  street: Street;
  text: string;
  kind: "action" | "deal" | "result" | "info";
}

export interface GameConfig {
  seats: number; // 6
  startingStack: number; // in chips
  smallBlind: number;
  bigBlind: number;
}

export interface LegalActions {
  toCall: number;
  canFold: boolean;
  canCheck: boolean;
  canCall: boolean;
  callAmount: number;
  canBet: boolean;
  canRaise: boolean;
  /** Minimum legal total bet/raise (chips put out this street). */
  minRaiseTo: number;
  /** Maximum (all-in) total. */
  maxRaiseTo: number;
  potSize: number;
  bigBlind: number;
}

export interface GameState {
  config: GameConfig;
  players: Player[];
  button: number;
  street: Street;
  board: Card[];
  deck: Card[];
  pot: number;
  /** Highest chips committed on the current street. */
  currentBet: number;
  /** Size of the last full bet/raise (for min-raise math). */
  lastRaiseSize: number;
  aggressor: number | null;
  toAct: number | null;
  handNumber: number;
  smallBlind: number;
  bigBlind: number;
  phase: GamePhase;
  log: LogEntry[];
  logSeq: number;
  /** Per-bot perceived holding range (labels) for the Peek feature. */
  botRanges: Record<number, HandLabel[]>;
  stacksAtStart: number[];
  summary: HandSummary | null;
}
