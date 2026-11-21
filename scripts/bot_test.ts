/* Bot preflop policy tests — the property assertions from issue #9.
 *   node --experimental-transform-types scripts/bot_test.ts
 *
 * Run A: full bot tables; over thousands of preflop decisions, AA/KK
 * never fold and pure junk never calls a big raise.
 * Run B: a maniac hero open-jams 100bb every hand — the field must
 * clearly beat that strategy (the old bots lost to it).
 */
import { createTable, startHand, applyAction, legalActions } from "../src/game/engine.ts";
import { decideBot } from "../src/game/botBrain.ts";
import { cardsToLabel } from "../src/engine/notation.ts";
import type { Archetype, Card, GameConfig, GameState } from "../src/types/poker.ts";

const config: GameConfig = { seats: 6, startingStack: 2000, smallBlind: 10, bigBlind: 20 };
const BB = config.bigBlind;
const ARCH: Archetype[] = ["TAG", "LAG", "Nit", "Station"];

let passed = 0;
let failed = 0;
function ok(cond: boolean, msg: string) {
  if (cond) passed++;
  else {
    failed++;
    console.error("  FAIL:", msg);
  }
}

const JUNK = new Set(["72o", "82o", "92o", "T2o", "J2o", "83o", "73o", "62o", "52o", "42o", "32o"]);

/* ---------------- Run A: all-bot tables, decision properties ---------------- */
{
  let state = createTable(config);
  state = {
    ...state,
    players: state.players.map((p, i) => ({ ...p, isHero: false, archetype: ARCH[i % ARCH.length] })),
  };
  let premiumFolds = 0;
  let junkBigCalls = 0;
  let decisions = 0;
  let rangeExclusions = 0;
  let postflopNarrowings = 0;
  let postflopGrowths = 0;
  let checkRaises = 0;
  const sizings = new Set<string>();
  let checkedThisStreet: Record<string, Set<number>> = {};
  for (let h = 0; h < 1200; h++) {
    state = startHand(state);
    checkedThisStreet = {};
    let guard = 0;
    while (state.phase === "betting" && state.toAct !== null && guard++ < 5000) {
      const seat = state.toAct;
      const p = state.players[seat];
      const dec = decideBot(state, seat);
      // Behavioral richness: sizing diversity and check-raises exist.
      if (state.street !== "preflop") {
        const key = state.street;
        checkedThisStreet[key] ??= new Set();
        if (dec.action.type === "check") checkedThisStreet[key].add(seat);
        if (dec.action.type === "bet" && state.pot > 0) {
          sizings.add((Math.round(((dec.action.amount ?? 0) / state.pot) * 4) / 4).toFixed(2));
        }
        if (dec.action.type === "raise" && checkedThisStreet[key].has(seat)) checkRaises++;
      }
      const label = p.hole ? cardsToLabel(p.hole[0], p.hole[1]) : null;
      if (state.street === "preflop" && label) {
        decisions++;
        const la = legalActions(state);
        if ((label === "AA" || label === "KK") && dec.action.type === "fold") {
          premiumFolds++;
          if (premiumFolds <= 3) console.error(`    ${p.archetype} folded ${label} facing ${state.currentBet / BB}bb`);
        }
        if (JUNK.has(label) && dec.action.type === "call" && la.callAmount >= 8 * BB) {
          junkBigCalls++;
          if (junkBigCalls <= 3) console.error(`    ${p.archetype} called ${la.callAmount / BB}bb with ${label}`);
        }
      }
      // Range-narrowing invariants (issue #10): the stored range always
      // contains the bot's actual hand, and postflop actions shrink it.
      if (dec.range != null && label && dec.action.type !== "fold") {
        if (!dec.range.includes(label)) rangeExclusions++;
        if (state.street !== "preflop") {
          const before = state.botRanges[seat]?.length ?? 0;
          if (before > 8 && dec.range.length < before) postflopNarrowings++;
          else if (before > 8 && dec.range.length > before) postflopGrowths++;
        }
      }
      if (dec.range != null) {
        state = { ...state, botRanges: { ...state.botRanges, [seat]: dec.range } };
      }
      state = applyAction(state, seat, dec.action);
    }
    ok(state.phase === "hand-over", "hand completes");
  }
  ok(decisions > 5000, `saw plenty of preflop decisions (${decisions})`);
  ok(premiumFolds === 0, `AA/KK never fold preflop (${premiumFolds} folds)`);
  ok(junkBigCalls === 0, `junk never calls a big raise (${junkBigCalls} calls)`);
  ok(rangeExclusions === 0, `stored range never excludes the bot's actual hand (${rangeExclusions} exclusions)`);
  ok(postflopNarrowings > 200, `postflop actions narrow ranges (${postflopNarrowings} narrowings)`);
  ok(postflopGrowths === 0, `postflop ranges never grow (${postflopGrowths} growths)`);
  ok(sizings.size >= 3, `bots use 3+ distinct bet sizings (saw: ${[...sizings].join(", ")})`);
  ok(checkRaises > 0, `bots check-raise (${checkRaises} seen)`);
}

/* ------- Run C: the stab-every-check exploit must not print money ------- */
{
  let state = createTable(config);
  state = {
    ...state,
    players: state.players.map((p, i) =>
      p.isHero ? p : { ...p, archetype: ARCH[(i - 1) % ARCH.length] },
    ),
  };
  let heroNet = 0;
  const HANDS = 1200;
  for (let h = 0; h < HANDS; h++) {
    state = startHand(state);
    let guard = 0;
    while (state.phase === "betting" && state.toAct !== null && guard++ < 5000) {
      const seat = state.toAct;
      if (seat === 0) {
        const la = legalActions(state);
        if (state.street === "preflop") {
          if (la.canCheck) state = applyAction(state, 0, { type: "check" });
          else if (la.canCall && la.callAmount <= config.bigBlind) state = applyAction(state, 0, { type: "call", amount: la.callAmount });
          else state = applyAction(state, 0, { type: "fold" });
        } else if (la.canBet) {
          state = applyAction(state, 0, { type: "bet", amount: Math.max(la.minRaiseTo, Math.round(state.pot * 0.66)) });
        } else if (la.canCheck) {
          state = applyAction(state, 0, { type: "check" });
        } else {
          state = applyAction(state, 0, { type: "fold" });
        }
      } else {
        state = applyAction(state, seat, decideBot(state, seat).action);
      }
    }
    heroNet += state.summary?.heroNetChips ?? 0;
  }
  const bb100 = (heroNet / BB / HANDS) * 100;
  console.log(`  stab-every-check bot: ${bb100.toFixed(0)} bb/100 over ${HANDS} hands`);
  ok(heroNet < 0, `stabbing every check with any two loses (net ${(heroNet / BB).toFixed(0)} bb)`);
}

/* ---------------- Run B: the open-jam exploit must lose now ---------------- */
{
  let state = createTable(config);
  state = {
    ...state,
    players: state.players.map((p, i) =>
      p.isHero ? p : { ...p, archetype: ARCH[(i - 1) % ARCH.length] },
    ),
  };
  let heroNet = 0;
  const HANDS = 1000;
  for (let h = 0; h < HANDS; h++) {
    state = startHand(state);
    let guard = 0;
    while (state.phase === "betting" && state.toAct !== null && guard++ < 5000) {
      const seat = state.toAct;
      if (seat === 0) {
        const la = legalActions(state);
        if (state.street === "preflop" && la.canRaise) {
          state = applyAction(state, 0, { type: "raise", amount: la.maxRaiseTo });
        } else if (la.canCheck) {
          state = applyAction(state, 0, { type: "check" });
        } else if (la.canCall) {
          state = applyAction(state, 0, { type: "call", amount: la.callAmount });
        } else {
          state = applyAction(state, 0, { type: "fold" });
        }
      } else {
        state = applyAction(state, seat, decideBot(state, seat).action);
      }
    }
    heroNet += state.summary?.heroNetChips ?? 0;
  }
  const bb100 = (heroNet / BB / HANDS) * 100;
  console.log(`  open-jam maniac: ${bb100.toFixed(0)} bb/100 over ${HANDS} hands`);
  ok(heroNet < 0, `open-shoving every hand loses vs the field (net ${(heroNet / BB).toFixed(0)} bb)`);
}

/* ------- Run D: facing a 3-bet it prices rather than folds ------- */
/*
 * The exploit, as a test. Re-raises are looked up as
 * `myPosition_vs_raiserPosition`, every one of those 15 charts is "defender
 * versus an EARLIER seat", and the brain skips the charts outright once the
 * bet passes 4.5bb — so facing a 3-bet there was no book and the fallback was
 * to fold. Across 769 logged hands the bots folded 94.5% of the time to a 7bb
 * 3-bet and never adjusted.
 *
 * What is asserted is deliberately NOT a fold rate, which would just be the
 * old chart written somewhere else. It is the three properties an evaluator
 * has and a missing chart does not: most hands continue when the price is
 * good, folds go UP when the price gets worse, and the archetype still means
 * something. `scripts/_threebet.ts` prints the same measurement by hand.
 */
{
  const DECK: Card[] = [
    "2c","3d","4h","5s","6c","7d","8h","9s","Tc","Jd",
    "9c","Th","2s","Js","3h","8d","Kc","Qc",
  ];
  const HOLES: Record<number, [Card, Card]> = {
    0: ["Ah","Qd"], 1: ["5c","6d"], 2: ["Ks","Kd"],
    3: ["4c","4d"], 4: ["Jc","Tc"], 5: ["6s","5h"],
  };
  // Hands with a claim to continue for a good price. Deliberately not the set
  // a chart would hold: a measure that encodes the exploit it is meant to
  // catch has stopped being a measure.
  const CONTINUES: [Card, Card][] = [
    ["Ac","Ad"], ["Kc","Kd"], ["Qc","Qd"], ["Jc","Jd"],
    ["Tc","Td"], ["9c","9d"], ["8c","8d"], ["7c","7d"],
    ["Ac","Kd"], ["Ac","Ks"], ["Ac","Qs"], ["Ac","Js"],
    ["Kc","Qs"], ["Ad","5d"], ["Jc","Ts"], ["Qc","Js"],
  ];
  const ROLLS = [0.05, 0.3, 0.5, 0.7, 0.95];

  const seat = (n: number, arch: Archetype, hole: [Card, Card]): GameState => {
    let s = createTable(config);
    s.button = 0;
    s.players[n].archetype = arch;
    s = startHand(s);
    s.deck = [...DECK];
    for (const p of s.players) p.hole = p.id === n ? hole : HOLES[p.id];
    return s;
  };
  // Seat 3 (UTG) opens 50, folds through to seat 0 (BTN) who makes it `to`,
  // the blinds fold, and UTG answers for `to - 50`. The logged spot: it is
  // getting a good price on the chips it still owes.
  const opened = (arch: Archetype, hole: [Card, Card], to: number): GameState => {
    let s = seat(3, arch, hole);
    s = applyAction(s, 3, { type: "raise", amount: 50 });
    s = applyAction(s, 4, { type: "fold" });
    s = applyAction(s, 5, { type: "fold" });
    s = applyAction(s, 0, { type: "raise", amount: to });
    s = applyAction(s, 1, { type: "fold" });
    return applyAction(s, 2, { type: "fold" });
  };
  // Seat 5 (CO) owes the whole raise, out of position, with seat 3 still
  // behind it. Folding most hands here is correct, so a LOW rate is the bug.
  const cold = (arch: Archetype, hole: [Card, Card], to: number): GameState => {
    let s = seat(5, arch, hole);
    s = applyAction(s, 3, { type: "raise", amount: 50 });
    return applyAction(s, 4, { type: "raise", amount: to });
  };

  const foldRate = (
    spot: (a: Archetype, h: [Card, Card]) => GameState,
    arch: Archetype,
    who: number,
  ): number => {
    let folds = 0;
    let seen = 0;
    const saved = Math.random;
    for (const hole of CONTINUES) {
      const s = spot(arch, hole);
      for (const r of ROLLS) {
        Math.random = () => r;
        seen++;
        if (decideBot(s, who).action.type === "fold") folds++;
      }
    }
    Math.random = saved;
    return folds / seen;
  };

  for (const arch of ARCH) {
    // 94.5% was the measured leak. AA/KK/QQ/AK — everything the old policy
    // kept — is 5 of these 16 hands, so the leak scores about 69% here. Half
    // is a wide margin that the old code still fails.
    const good = foldRate((a, h) => opened(a, h, 140), arch, 3);
    ok(good < 0.5, `${arch} folds ${(good * 100).toFixed(0)}% at a good price (want < 50%)`);
    // Price response, per archetype: a 20bb re-raise folds more than a 5.5bb one.
    const cheap = foldRate((a, h) => opened(a, h, 110), arch, 3);
    const dear = foldRate((a, h) => opened(a, h, 400), arch, 3);
    ok(cheap < dear, `${arch} folds more to a worse price (${cheap.toFixed(2)} vs ${dear.toFixed(2)})`);
  }
  // The dead zone must be materially smaller than the leak's. The old policy
  // continued with AA/KK/QQ/AK and nothing else — 5 of these 16 hands — and
  // folded the other 11 at every single roll. Requiring at least twice that
  // many to survive ties the bar to the leak rather than to whatever the
  // current numbers happen to be.
  //
  // It is deliberately NOT "all 16": JTo for 90 into 220, out of position
  // against a re-raising range, is a genuine fold, and a test that demanded
  // otherwise would be asking the bots to play worse.
  {
    const saved = Math.random;
    const premiums = CONTINUES.filter((h) =>
      ["AA", "KK", "QQ", "AKs", "AKo"].includes(cardsToLabel(h[0], h[1])),
    ).length;
    let alive = 0;
    const dead: string[] = [];
    for (const hole of CONTINUES) {
      let continued = false;
      for (const r of ROLLS) {
        Math.random = () => r;
        if (decideBot(opened("TAG", hole, 140), 3).action.type !== "fold") continued = true;
      }
      if (continued) alive++;
      else dead.push(cardsToLabel(hole[0], hole[1]));
    }
    Math.random = saved;
    ok(
      alive >= 2 * premiums,
      `${alive}/${CONTINUES.length} hands continue at a good price, want >= ${2 * premiums}` +
        (dead.length ? ` (folded always: ${dead.join(" ")})` : ""),
    );
  }
  // Owing the whole raise out of position, with a player still behind, is a
  // worse spot than owing the remainder of your own open.
  ok(
    foldRate((a, h) => opened(a, h, 140), "TAG", 3) <
      foldRate((a, h) => cold(a, h, 140), "TAG", 5),
    "cold-calling a 3-bet folds more than continuing your own open",
  );
  // One knob — stickiness — decides how much -EV a bot will wear to stay in.
  // Without it nothing archetype-dependent reached the priced branch and all
  // four archetypes answered a 3-bet identically.
  ok(
    foldRate((a, h) => opened(a, h, 140), "Nit", 3) >
      foldRate((a, h) => opened(a, h, 140), "Station", 3),
    "a Nit folds to a 3-bet more often than a Station",
  );
}

console.log(`\nBot tests: ${passed} passed, ${failed} failed.`);
process.exit(failed === 0 ? 0 : 1);
