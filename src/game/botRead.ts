/**
 * Reading an opponent's move the way a player does — from the action, the
 * price, the board and the order things happened in. No simulation.
 *
 * The old `interpretBot` was handed a `Player` and nothing else, so the best
 * it could manage was archetype boilerplate: "Negreanu (LAG) calls with lots
 * of hands… expect them to call you down with medium ones." That is the same
 * sentence whether the board is three low cards in a row or three aces, which
 * is why it reads as nothing at all.
 *
 * A read is built from: the street; what they did and how big; what this
 * board does for the hands that call versus the hands that raise; whether a
 * draw just arrived; how many players are in; and the order of their actions
 * across streets. The player's style is the LAST sentence and is phrased as
 * an adjustment to the read above it — never the headline.
 */
import type { Archetype, Card, Street } from "../types/poker.ts";
import { cardToInt } from "../engine/cards.ts";

/** Everything the read needs, captured at the moment they acted. */
export interface BotMoveSnapshot {
  name: string;
  archetype?: Archetype;
  street: Street;
  /** The board they were looking at — not the one dealt after they acted. */
  board: Card[];
  action: "fold" | "check" | "call" | "bet" | "raise";
  /** Chips this action put in beyond what they had already committed. */
  amount: number;
  /** Pot before the action. */
  pot: number;
  /** Players still in the hand when they acted, hero included. */
  playersIn: number;
  /** They raised before the flop. */
  wasPreflopRaiser: boolean;
  /** They checked earlier on this same street, then raised. */
  checkedThisStreet: boolean;
  /** They bet the previous street. */
  betLastStreet: boolean;
  /** Hands seen from this seat, for an honest style note. */
  handsSeen: number;
  /** Size of their remaining likely holdings, if the app has a read at all. */
  rangeCombos: number;
}

export interface BotRead {
  title: string;
  /** Layer 1 — plain English, no arithmetic. */
  plain: string;
  /** Layer 2 — the numbers behind it. */
  steps: string[];
  /** Layer 3 — the reasoning, usable at a table with no screen. */
  expert: string[];
  confidence: "solid" | "weak" | "none";
}

/* ----------------------------------------------------------- board shape */

export interface BoardShape {
  /** "three low cards in a row", "three big cards"… */
  phrase: string;
  lowConnected: boolean;
  broadway: boolean;
  paired: boolean;
  twoTone: boolean;
  monotone: boolean;
  /** Nothing much to draw to. */
  dry: boolean;
}

export function boardShape(board: Card[]): BoardShape {
  const ints = board.map(cardToInt);
  const suits = [0, 0, 0, 0];
  const ranks: number[] = [];
  const counts = new Map<number, number>();
  for (const c of ints) {
    suits[c & 3]++;
    const r = (c >> 2) + 2;
    ranks.push(r);
    counts.set(r, (counts.get(r) ?? 0) + 1);
  }
  const maxSuit = Math.max(...suits, 0);
  const monotone = board.length >= 3 && maxSuit >= 3;
  const twoTone = !monotone && maxSuit >= 2;
  const paired = [...counts.values()].some((n) => n >= 2);
  const sorted = [...new Set(ranks)].sort((a, b) => a - b);
  const span = sorted.length >= 3 ? sorted[sorted.length - 1] - sorted[0] : 99;
  const connected = sorted.length >= 3 && span <= 4;
  const allLow = ranks.length > 0 && ranks.every((r) => r <= 9);
  const allBig = ranks.length > 0 && ranks.every((r) => r >= 10);
  const lowConnected = connected && allLow;
  const broadway = allBig;
  const dry = !connected && !twoTone && !monotone;

  let phrase: string;
  if (paired) phrase = "a paired board";
  else if (monotone) phrase = "three cards of one suit";
  else if (lowConnected) phrase = "three low cards in a row";
  else if (connected) phrase = "a run of connected cards";
  else if (broadway) phrase = "three big cards";
  else if (twoTone) phrase = "two cards of one suit, so a flush draw is out there";
  else phrase = "scattered cards with nothing much to draw to";

  return { phrase, lowConnected, broadway, paired, twoTone, monotone, dry };
}

/** "about half the pot", "a pot-sized bet"… */
export function sizeWord(frac: number): string {
  if (frac < 0.25) return "about a quarter of the pot";
  if (frac < 0.4) return "about a third of the pot";
  if (frac < 0.6) return "about half the pot";
  if (frac < 0.85) return "about two-thirds of the pot";
  if (frac < 1.15) return "the size of the pot";
  return "more than the whole pot";
}

const STREET_WORD: Record<Street, string> = {
  preflop: "before the flop",
  flop: "on the flop",
  turn: "on the turn",
  river: "on the river",
  showdown: "at showdown",
};

/* --------------------------------------------------------- style modifier */

/**
 * The style note, last and phrased as an adjustment. Below fifteen hands the
 * honest answer is that we do not know them yet — which is also the right
 * order to think in, so the read never leans on it.
 */
function styleNote(s: BotMoveSnapshot, mode: "aggressive" | "call" | "passive"): string {
  if (s.handsSeen < 15) {
    return `You have only seen ${s.handsSeen} hand${s.handsSeen === 1 ? "" : "s"} from ${s.name}, which is not enough to call them anything yet — so this read leans on the board and the action instead, which is the right order anyway.`;
  }
  const a = s.archetype;
  if (mode === "aggressive") {
    if (a === "Nit") return `One adjustment: ${s.name} has put money in on very few hands all session. When someone this tight raises, drop the missed-hand half of the read entirely.`;
    if (a === "LAG") return `One adjustment: ${s.name} bets and raises far more hands than most, so the missed-hand half of the read is bigger than it looks. Same read, fold a little less often.`;
    if (a === "Station") return `One adjustment: ${s.name} almost never raises, which makes this read stronger rather than weaker. Believe it.`;
    return `One adjustment: ${s.name} has raised a tight set of hands all session, so take this at close to face value.`;
  }
  if (mode === "passive") {
    if (a === "Station") return `One adjustment: a check from someone who calls as much as ${s.name} really is a weak hand — they call, they do not check strong ones.`;
    if (a === "Nit") return `One adjustment: ${s.name} folds most hands, so pots like this one are there for the taking more often than against anybody else at the table.`;
    if (a === "LAG") return `One adjustment: ${s.name} checks strong hands more often than most to set up a raise later. Bet, but do not commit your stack to that bet.`;
    return `One adjustment: nothing to add — a solid player's check means what it says above.`;
  }
  if (a === "Station") return `One adjustment: ${s.name} calls far too much, so the call itself tells you almost nothing. Keep betting the hands that are ahead and stop bluffing them.`;
  if (a === "Nit") return `One adjustment: even a tight player's call is a real hand — they would have raised their very best, so this is the middle of a narrow set.`;
  if (a === "LAG") return `One adjustment: ${s.name} calls with a lot of hands and plans to take the pot on a later card. Expect a bet at you next street whether it helped them or not.`;
  return `One adjustment: nothing to add — a solid player's call means what it says above.`;
}

/* -------------------------------------------------------------- the read */

export function readBotAction(s: BotMoveSnapshot): BotRead {
  const shape = boardShape(s.board);
  const where = STREET_WORD[s.street];
  const frac = s.pot > 0 ? s.amount / s.pot : 0;
  const size = sizeWord(frac);
  const multi = s.playersIn > 2;
  const steps: string[] = [];
  const expert: string[] = [];
  const method = `This read comes from the board, the size and how ${s.name} has played this hand — no simulation. More in About → How the grading works.`;

  /* ---- fold ---- */
  if (s.action === "fold") {
    return {
      title: `${s.name}'s fold`,
      plain: `${s.name} folds. Their hand no longer matters — what matters is that one fewer player can beat you, so the hands worth betting just got wider.`,
      steps: [`${s.playersIn - 1} player${s.playersIn - 1 === 1 ? "" : "s"} left in the hand.`],
      expert: [
        `The plan from here — every player who folds makes the pot easier to win and your own hand worth more. Against one opponent you can bet hands you would check against three.`,
        method,
      ],
      confidence: "solid",
    };
  }

  /* ---- check ---- */
  if (s.action === "check") {
    const gaveUp = s.betLastStreet;
    const plain = gaveUp
      ? `${s.name} bet the last card and has now checked. That pairing is the clearest signal in poker: they were betting a hand that wanted to win right there, it did not, and they have given up on it. Bet, almost regardless of what you hold.`
      : `${s.name} checks ${where}. On ${shape.phrase} a check is usually a hand that could not stand a bet — this is a pot you can take by betting at it.`;
    return {
      title: `${s.name}'s check`,
      plain,
      steps: [`Pot ${s.pot} chips; checking costs them nothing and gives you the choice.`],
      expert: [
        gaveUp
          ? `What the check said — betting then checking is a line that strong hands almost never take. A hand good enough to bet the last card is good enough to bet this one, so the hands left are the ones that missed.`
          : `What the check said — checking keeps the pot small, which is what the weak part of their hands wants. Some players check strong hands here to raise you later, so size your bet to find out cheaply rather than to commit.`,
        `The plan from here — bet, and have an answer ready for a raise. If they raise after checking, that is the one line that is almost always real.`,
        styleNote(s, "passive"),
        method,
      ],
      confidence: "solid",
    };
  }

  /* ---- call ---- */
  if (s.action === "call") {
    steps.push(`${s.name} called ${s.amount} into a ${s.pot} pot.`);
    if (s.rangeCombos > 0) steps.push(`About ${s.rangeCombos} hands are still consistent with how they have played.`);
    const plain = shape.lowConnected
      ? `${s.name} called ${where} on ${shape.phrase}. A call on this board keeps in exactly the hands it suits — small pairs and connected cards — and folds out the big cards. Their hand just got stronger on average, not weaker.`
      : `${s.name} called ${where}. A call is the widest action in poker: it keeps every hand that is good enough to continue and none that is good enough to raise. Expect middling strength, and expect to be called again.`;
    return {
      title: `${s.name}'s call`,
      plain,
      steps,
      expert: [
        `What their action said — calling leaves their strongest hands in and their weakest out, so the set of hands narrows from both ends. Against one caller your bluffs work less often and your good hands get paid more.`,
        `The plan from here — decide now what you do on the next card. A caller who checks to you again is usually giving up; a caller who suddenly bets or raises has either hit or decided you have nothing.`,
        styleNote(s, "call"),
        method,
      ],
      confidence: s.rangeCombos > 0 ? "solid" : "weak",
    };
  }

  /* ---- bet / raise ---- */
  const isRaise = s.action === "raise";
  const checkRaise = isRaise && s.checkedThisStreet;
  steps.push(`${s.name} ${isRaise ? "raised to" : "bet"} ${s.amount} into a ${s.pot} pot — ${Math.round(frac * 100)}% of it.`);
  if (s.rangeCombos > 0) steps.push(`About ${s.rangeCombos} hands are still consistent with how they have played.`);

  let plain: string;
  if (checkRaise) {
    plain = `${s.name} checked, let you bet, then raised — a check-raise. It is the strongest line in poker, because it needs you to put money in first and risks the pot if you simply fold. Players do not build that with nothing. Unless you have a hand you would happily get all the chips in with, this is a fold.`;
    expert.push(
      `What the raise said — a check-raise gives up the chance to win the pot by betting, so it is made by hands that want more money in, not fewer. On ${shape.phrase} the hands that do that here are the ones already past one pair.`,
    );
  } else if (s.street === "river" && shape.twoTone) {
    plain = `${s.name} bet ${size} on the river, on a board where a flush was possible. A river bet is the one bet that can never be a draw — by now they either have a hand or they are telling a story. The question is simply whether the card that just came helped them.`;
    expert.push(
      `What the bet said — on the river there is nothing left to draw to, so the bet is either a hand that wants to be called or a hand that cannot win any other way. Big river bets on a completed draw are far more often real than not.`,
    );
  } else if (shape.lowConnected) {
    plain = `${s.name} bet ${size} ${where} on ${shape.phrase}. This is the one board that hits the hands that CALL far harder than the hands that RAISE — small pairs and connected cards like 8-7 and 7-6. Big cards have nothing here. So when money goes in on a board like this, the person putting it in usually really has it, and the hands you make are the bottom of everything.`;
    expert.push(
      `What the bet said — low connected boards reverse the usual order. Before the flop the strong hands are big cards; on three low cards in a row the big cards are the weakest thing on the table and the hands that just called are the strongest. Treat a bet here with more respect than the same bet on big cards.`,
    );
  } else if (shape.broadway) {
    plain = `${s.name} bet ${size} ${where} on ${shape.phrase}. Big cards are what most players raise with before the flop, so this board hits the raiser's hands and misses the caller's. A bet here is expected whether or not it connected — it is the most routine bet in poker, and the least informative.`;
    expert.push(
      `What the bet said — on a board of big cards the person who raised before the flop can credibly have all of them, so they bet nearly every time. That makes the bet cheap to make and cheap to believe. Give it less weight than the same bet on low cards.`,
    );
  } else if (shape.paired) {
    plain = `${s.name} bet ${size} ${where} on ${shape.phrase}. Paired boards miss almost everybody, which cuts both ways: they rarely have three of a kind, and neither do you. Most of the time this is a bet at the pot rather than a bet with a hand.`;
    expert.push(
      `What the bet said — a pair on the board means fewer hands improved, so both of you missed more often than usual. That makes the bet more likely to be a try at the pot, and a raise more likely to be believed.`,
    );
  } else {
    plain = `${s.name} bet ${size} ${where} on ${shape.phrase}. Size is the tell here: small bets are cheap to make with anything, big bets ask you to pay to find out. ${frac >= 0.6 ? "This one is big enough that it wants to be called by worse or to make you fold — not a hand looking for a cheap look." : "This one is small enough that it costs them little to try, so do not fold anything decent to it."}`;
    expert.push(
      `What the bet said — on ${shape.phrase} there is less to draw to, so bets are made by made hands and by nothing, with little in between. Work out which by what they do when you do not go away.`,
    );
  }

  if (s.wasPreflopRaiser && s.street === "flop" && !isRaise) {
    expert.push(
      `What the bet said — they raised before the flop and are following it up, which players call a c-bet (continuation bet). Good players make it on roughly two flops in three whether the flop helped them or not, so on its own it is close to no information. The size and the board are what carry the meaning.`,
    );
  }

  if (multi) {
    expert.push(
      `The plan from here — they bet into ${s.playersIn - 1} other players, not one. Betting into a crowd with a weak hand is a good way to lose a big pot, so the hands that do it skew strong. Fold more here than you would heads-up.`,
    );
  } else {
    expert.push(
      `The plan from here — name the hand you are continuing with before you put chips in. If you cannot say what you beat that keeps betting, that is the answer.`,
    );
  }
  expert.push(
    shape.lowConnected
      ? `What would change the answer — the same bet on three big cards. There the bet is at the pot and the hands that called before the flop have missed, so you stop folding pairs.`
      : `What would change the answer — the same bet from a player who has been betting every pot, or a size small enough to be cheap. Either turns this from a hand to respect into a hand to look up.`,
  );
  expert.push(styleNote(s, "aggressive"));
  expert.push(method);

  return {
    title: `${s.name}'s ${checkRaise ? "check-raise" : isRaise ? "raise" : "bet"}`,
    plain,
    steps,
    expert,
    confidence: s.rangeCombos > 0 ? "solid" : "weak",
  };
}
