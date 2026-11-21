/* node --experimental-transform-types scripts/evaluate_test.ts
 *
 * The evaluation function. These are the properties that make it an
 * evaluator rather than another table of magic numbers.
 */
import {
  foldChance,
  allFoldChance,
  realisation,
  callEv,
  raiseEv,
  priceActions,
  chooseByEv,
} from "../src/game/evaluate.ts";
import { emptyRecentStats } from "../src/types/poker.ts";
import type { Player } from "../src/types/poker.ts";
import { readPlayer } from "../src/game/profile.ts";

let passed = 0;
let failed = 0;
function ok(cond: boolean, msg: string) {
  if (cond) passed++;
  else {
    failed++;
    console.error("  FAIL:", msg);
  }
}

function seat(over: Partial<Player> = {}): Player {
  const p = {
    id: 1, name: "V", isHero: false, archetype: "TAG", stack: 2000, hole: null,
    revealed: false, hasFolded: false, isAllIn: false, committed: 0,
    committedTotal: 0, acted: false, position: "BTN", lastAction: null,
    handsSeen: 0, vpipCount: 0, pfrCount: 0, threeBetCount: 0, threeBetOpp: 0,
    foldToRaiseCount: 0, faceRaiseCount: 0, foldTo3BetCount: 0, face3BetCount: 0,
    cbetCount: 0, cbetOpp: 0, foldToCbetCount: 0, faceCbetCount: 0,
    postAggroCount: 0, postActionCount: 0, sawFlopCount: 0, showdownCount: 0,
    shownHands: [], recent: emptyRecentStats(), bluffAttempts: 0, bluffWins: 0,
    bluffNetBb: 0, sittingOut: false, ...over,
  } as Player;
  if (over.recent === undefined) {
    p.recent = {
      ...emptyRecentStats(),
      hands: p.handsSeen,
      vpip: p.vpipCount, pfr: p.pfrCount,
      foldToRaise: p.foldToRaiseCount, faceRaise: p.faceRaiseCount,
      foldToCbet: p.foldToCbetCount, faceCbet: p.faceCbetCount,
      postAggro: p.postAggroCount, postAction: p.postActionCount,
    };
  }
  return p;
}

/* --------------------------------------------------------- the zero point */

// Folding is the zero. Chips already in the pot are not yours and must not
// enter the comparison — that single convention is what makes the real bug
// (a bot folding for 12 into a pot of 534) impossible to choose.
{
  const ranked = priceActions({
    equity: 0.25, pot: 534, callCost: 12, canCall: true, canRaise: false,
  });
  ok(ranked[0].kind === "call", "12 into 534 is a call, not a fold");
  const call = ranked.find((a) => a.kind === "call")!;
  ok(call.ev > 100, `and by a mile (${call.ev.toFixed(0)} chips)`);
  // Even a hand that is nearly dead calls here.
  const hopeless = priceActions({
    equity: 0.04, pot: 534, callCost: 12, canCall: true, canRaise: false,
  });
  ok(hopeless[0].kind === "call", "4% equity still calls 12 into 534");
  const dead = priceActions({
    equity: 0.01, pot: 534, callCost: 12, canCall: true, canRaise: false,
  });
  ok(dead[0].kind === "fold", "1% equity does not — the line is where it should be");
}

// The price matters, not the size of the number.
{
  const good = priceActions({ equity: 0.4, pot: 100, callCost: 20, canCall: true, canRaise: false });
  const bad = priceActions({ equity: 0.4, pot: 100, callCost: 300, canCall: true, canRaise: false });
  ok(good[0].kind === "call", "40% equity calls a fifth-pot bet");
  ok(bad[0].kind === "fold", "40% equity folds a three-times-pot bet");
}

/* ------------------------------------------------------------- callEv */

{
  // Break-even: equity exactly equals the pot odds.
  const pot = 100, cost = 50; // needs 50/150 = 33.3%
  ok(Math.abs(callEv(1 / 3, pot, cost)) < 1e-9, "at the pot odds, calling is exactly zero");
  ok(callEv(0.34, pot, cost) > 0, "a point above is positive");
  ok(callEv(0.32, pot, cost) < 0, "a point below is negative");
  ok(callEv(0.5, pot, cost, 0.5) < callEv(0.5, pot, cost, 1), "poor realisation is worth less");
}

/* ------------------------------------------------------------ raiseEv */

{
  // With nothing, a raise is worth exactly the fold equity it buys.
  const noHand = raiseEv(0, 100, 50, 0.6);
  ok(Math.abs(noHand - (0.6 * 100 + 0.4 * -50)) < 1e-9, "a pure bluff is fold equity minus what it loses");
  ok(raiseEv(0.5, 100, 50, 0.9) > raiseEv(0.5, 100, 50, 0.1), "more folds is worth more");
  // The caller matches our raise from further along than us: they already have
  // the current bet in. Counting their call as our full cost inflated the
  // called pot and made the raise outrank the call for a band of equities
  // where this function's own arithmetic says call.
  // Pot 240, we owe 110, raise to 352 so cost 302: they put in 192, so a
  // called pot is 240 + 302 + 192 = 734, not 844.
  {
    const pot = 240, cost = 302, toCall = 110;
    const got = raiseEv(1, pot, cost, 0, 1, toCall);
    ok(Math.abs(got - (pot + cost + (cost - toCall) - cost)) < 1e-9,
      "the caller only owes the raise minus what we owed");
    ok(got < raiseEv(1, pot, cost, 0), "over-counting was strictly generous");
    ok(raiseEv(0.5, pot, cost, 0.3, 1, 0) === raiseEv(0.5, pot, cost, 0.3),
      "with nothing owed the two agree");
  }
  ok(raiseEv(0.9, 100, 50, 0.2) > raiseEv(0.2, 100, 50, 0.2), "a better hand is worth more");
}

/* --------------------------------------------------------- foldChance */

{
  const folder = readPlayer(seat({
    handsSeen: 40, faceCbetCount: 20, foldToCbetCount: 17,
    faceRaiseCount: 20, foldToRaiseCount: 17,
  }));
  const station = readPlayer(seat({
    handsSeen: 40, faceCbetCount: 20, foldToCbetCount: 2,
    faceRaiseCount: 20, foldToRaiseCount: 2,
  }));
  ok(foldChance(folder, "flop", 50, 100) > foldChance(station, "flop", 50, 100),
    "a folder folds more than a station");
  // Bigger bets fold more people out, with the curve flattening.
  const small = foldChance(folder, "flop", 20, 100);
  const big = foldChance(folder, "flop", 100, 100);
  ok(big > small, "a bigger bet folds out more");
  ok(big / small < 2.5, "but not proportionally — the curve flattens");
  for (const price of [1, 10, 100, 10000]) {
    const f = foldChance(folder, "flop", price, 100);
    ok(f > 0 && f < 1, `fold chance stays a probability at a price of ${price}`);
  }

  // Everybody has to fold, so a crowd is harder than one player.
  const one = allFoldChance([seat({ id: 1 })], "flop", 50, 100);
  const three = allFoldChance(
    [seat({ id: 1 }), seat({ id: 2 }), seat({ id: 3 })], "flop", 50, 100);
  ok(three < one, "three players are harder to bluff than one");
  const folded = allFoldChance([seat({ id: 1, hasFolded: true })], "flop", 50, 100);
  ok(folded === 1, "somebody already folded does not need folding again");
}

/* ------------------------------------------------------- realisation */

{
  ok(realisation(1, true) > realisation(1, false), "position is worth something");
  ok(realisation(3, false) < realisation(1, false), "a crowd realises less");
  ok(realisation(1, false, 20) < realisation(1, false, 2), "deep money is worse for the caller");
  for (const [n, ip, spr] of [[1, true, 1], [5, false, 50], [2, true, 0]] as const) {
    const r = realisation(n, ip, spr);
    ok(r > 0 && r <= 1, `realisation stays a fraction (${n}/${ip}/${spr} -> ${r.toFixed(2)})`);
  }
}

/* --------------------------------------------------------- chooseByEv */

{
  const ranked = priceActions({
    equity: 0.45, pot: 100, callCost: 30, canCall: true, canRaise: true,
    raiseTo: 90, raiseCost: 90, foldsEverybody: 0.5,
  });
  // A wide band mixes; a zero band never does.
  const strict = new Set<string>();
  for (let i = 0; i < 50; i++) strict.add(chooseByEv(ranked, i / 50, 0).kind);
  ok(strict.size === 1, "with no band the best action is always taken");
  const mixed = new Set<string>();
  for (let i = 0; i < 50; i++) mixed.add(chooseByEv(ranked, i / 50, 1000).kind);
  ok(mixed.size > 1, "with a wide band it mixes");

  // Mixing must never reach past the band into a clearly worse action. This
  // is the property that broke first: a band taken as a share of the pot
  // grew with the pot, and bots called off 157bb with J2o because a -900
  // call counted as "close enough".
  const lopsided = [
    { kind: "fold" as const, ev: 0 },
    { kind: "call" as const, ev: -900 },
  ];
  for (let i = 0; i < 50; i++) {
    ok(chooseByEv(lopsided, i / 50, 50).kind === "fold",
      "a 900-chip-worse call is never mixed in on a 50-chip band");
  }
  ok(chooseByEv([], 0.5, 10).kind === "fold", "no options at all is a fold");
}

/* -------------------------------------------------- the pot you can win */

// When a bot cannot cover a re-raise the engine returns the raiser's excess
// uncalled, so those chips were never winnable.
{
  const onTable = 480, toCall = 350, canPay = 100;
  const winnable = onTable - (toCall - canPay);
  const honest = priceActions({
    equity: 0.25, pot: winnable, callCost: canPay, canCall: true, canRaise: false, realise: 0.72,
  });
  const inflated = priceActions({
    equity: 0.25, pot: onTable, callCost: canPay, canCall: true, canRaise: false, realise: 0.72,
  });
  ok(honest[0].kind === "fold", "a pot it cannot win does not make the call positive");
  ok(inflated[0].kind === "call", "...and the full pot is what used to make it call");
}

/* ------------------------------------- nobody folds against an all-in */

// Somebody already all-in cannot fold, so "everybody folds" is impossible and
// a bluff has no fold equity at all. The 0.02 floor in foldChance used to
// credit a raise with fold equity against a player contesting regardless.
{
  const allIn = seat({ id: 1, isAllIn: true });
  const normal = seat({ id: 2 });
  ok(allFoldChance([allIn], "preflop", 192, 400) === 0,
    "a lone all-in opponent leaves no fold equity");
  ok(allFoldChance([allIn, normal], "preflop", 192, 400) === 0,
    "one all-in opponent is enough to kill the whole field's fold equity");
  ok(allFoldChance([normal], "preflop", 192, 400) > 0,
    "...but an opponent who can fold still might");
  ok(allFoldChance([seat({ id: 3, isAllIn: true, hasFolded: true })], "preflop", 192, 400) === 1,
    "somebody who folded does not need folding again, all-in flag or not");
}

console.log(`\nEvaluate tests: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
