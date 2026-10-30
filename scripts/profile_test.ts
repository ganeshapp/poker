/* node --experimental-transform-types scripts/profile_test.ts
 *
 * The opponent model: what a seat reads off another seat, and how each
 * archetype leans once it thinks it has somebody figured out.
 */
import {
  archetypeBelief,
  bluffPolicy,
  bluffsThisHand,
  bluffViability,
  readPlayer,
  inferredPreflopRange,
  adjustmentFor,
  exploreRate,
  NO_ADJUSTMENT,
} from "../src/game/profile.ts";
import type { Player } from "../src/types/poker.ts";
import { emptyRecentStats } from "../src/types/poker.ts";

let passed = 0;
let failed = 0;
function ok(cond: boolean, msg: string) {
  if (cond) passed++;
  else {
    failed++;
    console.error("  FAIL:", msg);
  }
}

/** A seat with every counter at zero, then whatever the test overrides. */
function seat(over: Partial<Player> = {}): Player {
  const p = {
    id: 1,
    name: "Villain",
    isHero: false,
    archetype: "TAG",
    stack: 2000,
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
    threeBetCount: 0,
    threeBetOpp: 0,
    foldToRaiseCount: 0,
    faceRaiseCount: 0,
    foldTo3BetCount: 0,
    face3BetCount: 0,
    cbetCount: 0,
    cbetOpp: 0,
    foldToCbetCount: 0,
    faceCbetCount: 0,
    postAggroCount: 0,
    postActionCount: 0,
    sawFlopCount: 0,
    showdownCount: 0,
    shownHands: [],
    recent: emptyRecentStats(),
    bluffAttempts: 0,
    bluffWins: 0,
    bluffNetBb: 0,
    sittingOut: false,
    ...over,
  } as Player;
  // The bots read the recency window, not the lifetime counters, so a seat
  // described by counters has to have the window to match: "everything you
  // passed happened recently". Tests that care about the two diverging set
  // `recent` explicitly.
  if (over.recent === undefined) {
    p.recent = {
      hands: p.handsSeen,
      vpip: p.vpipCount,
      pfr: p.pfrCount,
      threeBet: p.threeBetCount,
      threeBetOpp: p.threeBetOpp,
      foldToRaise: p.foldToRaiseCount,
      faceRaise: p.faceRaiseCount,
      foldTo3Bet: p.foldTo3BetCount,
      face3Bet: p.face3BetCount,
      foldToCbet: p.foldToCbetCount,
      faceCbet: p.faceCbetCount,
      cbet: p.cbetCount,
      cbetOpp: p.cbetOpp,
      postAggro: p.postAggroCount,
      postAction: p.postActionCount,
      showdown: p.showdownCount,
      sawFlop: p.sawFlopCount,
    };
  }
  return p;
}

/* ------------------------------------------------------------ readPlayer */

// No sample at all: the read must not pretend to know anything.
{
  const r = readPlayer(seat());
  ok(r.hands === 0, "no hands seen → hands 0");
  ok(r.confidence === 0, "no hands seen → zero confidence");
  ok(r.style === "unknown", "no hands seen → style unknown");
}

// Under the 12-hand bar there is still no label, however extreme the numbers.
{
  const r = readPlayer(seat({ handsSeen: 11, vpipCount: 11, pfrCount: 11 }));
  ok(r.style === "unknown", "11 hands → still unknown, whatever the rates");
}

// The hero from the real session logs: plays everything, raises most of it.
{
  const r = readPlayer(
    seat({ handsSeen: 100, vpipCount: 98, pfrCount: 58, threeBetCount: 44, threeBetOpp: 100 }),
  );
  ok(r.style === "maniac", `VPIP 98 / PFR 58 → maniac (got ${r.style})`);
  ok(Math.abs(r.vpip - 0.98) < 1e-9, "vpip computed");
  ok(Math.abs(r.threeBet - 0.44) < 1e-9, "3-bet computed over its own chances");
}

// A station is loose AND passive. Raising half your hands disqualifies you,
// which is the bug that used to label the hero a calling station.
{
  const loosePassive = readPlayer(
    seat({ handsSeen: 50, vpipCount: 25, pfrCount: 2, postAggroCount: 2, postActionCount: 40 }),
  );
  ok(loosePassive.style === "station", `loose + passive → station (got ${loosePassive.style})`);
  const looseAggro = readPlayer(
    seat({ handsSeen: 50, vpipCount: 25, pfrCount: 26, postAggroCount: 20, postActionCount: 40 }),
  );
  ok(looseAggro.style !== "station", "loose but raising → not a station");
}

{
  const rock = readPlayer(seat({ handsSeen: 50, vpipCount: 4 }));
  ok(rock.style === "rock", `VPIP 8% → rock (got ${rock.style})`);
  const nit = readPlayer(seat({ handsSeen: 50, vpipCount: 7 }));
  ok(nit.style === "nit", `VPIP 14% → nit (got ${nit.style})`);
}

// Rates divide by the chances they had, not by hands played.
{
  const r = readPlayer(seat({ handsSeen: 40, foldToCbetCount: 7, faceCbetCount: 10 }));
  ok(Math.abs(r.foldToCbet - 0.7) < 1e-9, "fold-to-c-bet is over c-bets faced");
}

/* -------------------------------------------------- inferredPreflopRange */

{
  const maniac = seat({ handsSeen: 60, vpipCount: 57, pfrCount: 35, threeBetCount: 24, threeBetOpp: 60 });
  const rock = seat({ handsSeen: 60, vpipCount: 6, pfrCount: 4, threeBetCount: 1, threeBetOpp: 60 });
  const mOpen = inferredPreflopRange(maniac, "BTN", "open");
  const rOpen = inferredPreflopRange(rock, "BTN", "open");
  ok(mOpen.length > rOpen.length, "a maniac's opening range is wider than a rock's");
  ok(rOpen.length > 0, "even a rock has an opening range");

  const m3 = inferredPreflopRange(maniac, "BTN", "threebet");
  const r3 = inferredPreflopRange(rock, "BTN", "threebet");
  ok(m3.length > r3.length, "a maniac's 3-bet range is wider than a rock's");
  ok(r3.includes("AA"), "the tightest 3-bet range still has aces in it");

  // A call is the middle of the range, so it should not be the same set as
  // the raise — that was the point of splitting them.
  const mCall = inferredPreflopRange(maniac, "BTN", "call");
  ok(mCall.length > 0 && mCall.join() !== mOpen.join(), "calling range differs from opening range");
}

// With no sample, fall back to a typical opening range rather than any-two.
{
  const blank = inferredPreflopRange(seat(), "CO", "open");
  ok(blank.length > 0 && blank.length < 169, `no read → a sane range, not all 169 (got ${blank.length})`);
}

/* ------------------------------------------------------- adjustmentFor */

// Nobody adapts to a player they have barely seen.
{
  const a = adjustmentFor("TAG", seat({ handsSeen: 1, vpipCount: 1, pfrCount: 1 }));
  ok(a === NO_ADJUSTMENT, "one hand of evidence → no adjustment at all");
}

// Against the logged hero, every archetype should react — in character.
{
  const hero = seat({
    name: "You",
    handsSeen: 80,
    vpipCount: 78,
    pfrCount: 46,
    threeBetCount: 35,
    threeBetOpp: 80,
    postAggroCount: 30,
    postActionCount: 60,
    foldToCbetCount: 30,
    faceCbetCount: 40,
  });
  const nit = adjustmentFor("Nit", hero);
  const lag = adjustmentFor("LAG", hero);
  const tag = adjustmentFor("TAG", hero);
  const station = adjustmentFor("Station", hero);

  ok(nit.defend > 1 && nit.threebet > 1, "a Nit being run over defends and plays back more");
  ok(lag.aggression > 1, "a LAG finds a folder and bets at them harder");
  ok(tag.defend > 1, "a TAG widens against somebody raising everything");
  ok(
    nit.note !== null && lag.note !== null,
    "with 80 hands of evidence the read is worth saying out loud",
  );
  // They must not converge on one personality.
  const sig = (x: typeof nit) => `${x.aggression.toFixed(2)}/${x.stickiness.toFixed(2)}`;
  ok(
    new Set([sig(nit), sig(lag), sig(tag), sig(station)]).size > 2,
    "the four archetypes do not collapse into the same adjustment",
  );
}

// Somebody who folds to most bets gets believed when they do bet.
{
  const folder = seat({
    handsSeen: 60,
    vpipCount: 15,
    pfrCount: 10,
    foldToCbetCount: 24,
    faceCbetCount: 30,
    postAggroCount: 5,
    postActionCount: 40,
  });
  const a = adjustmentFor("TAG", folder);
  ok(a.stickiness < 1, `a player who folds to 80% of c-bets is believed when they bet (got ${a.stickiness})`);
}

// Every dial stays inside its clamp, even on absurd input.
{
  const absurd = seat({
    handsSeen: 10000,
    vpipCount: 10000,
    pfrCount: 10000,
    threeBetCount: 10000,
    threeBetOpp: 10000,
    faceCbetCount: 10,
    foldToCbetCount: 10,
    postAggroCount: 100,
    postActionCount: 100,
  });
  for (const arch of ["TAG", "LAG", "Nit", "Station"] as const) {
    const a = adjustmentFor(arch, absurd, "tough");
    ok(a.aggression >= 0.4 && a.aggression <= 2.2, `${arch} aggression clamped (${a.aggression})`);
    ok(a.stickiness >= 0.45 && a.stickiness <= 1.8, `${arch} stickiness clamped (${a.stickiness})`);
    ok(a.defend >= 0.6 && a.defend <= 1.9, `${arch} defend clamped (${a.defend})`);
    ok(a.threebet >= 0.5 && a.threebet <= 2.6, `${arch} threebet clamped (${a.threebet})`);
  }
}

// Difficulty changes how far and how fast they move, not who they are.
//
// Note the ordering is non-STRICT on purpose: against a genuine maniac the
// `defend` dial saturates at its 1.9 clamp, so "regular" and "tough" end up
// identical on that axis. That is a real property of the design and part of
// why the two settings play alike against an extreme opponent — a moderate
// villain is what separates them.
{
  const moderate = seat({ handsSeen: 40, vpipCount: 12, pfrCount: 11, threeBetCount: 4, threeBetOpp: 40 });
  const casual = adjustmentFor("Nit", moderate, "casual");
  const regular = adjustmentFor("Nit", moderate, "regular");
  const tough = adjustmentFor("Nit", moderate, "tough");
  ok(
    casual.defend < regular.defend && regular.defend < tough.defend,
    `a tougher table adapts further (${casual.defend.toFixed(2)} < ${regular.defend.toFixed(2)} < ${tough.defend.toFixed(2)})`,
  );

  const maniac = seat({ handsSeen: 40, vpipCount: 38, pfrCount: 24, threeBetCount: 16, threeBetOpp: 40 });
  const mc = adjustmentFor("Nit", maniac, "casual");
  const mr = adjustmentFor("Nit", maniac, "regular");
  const mt = adjustmentFor("Nit", maniac, "tough");
  ok(
    mc.defend <= mr.defend && mr.defend <= mt.defend,
    "against a maniac the ordering still holds, even where the clamp binds",
  );
  ok(mr.defend === 1.9 && mt.defend === 1.9, "and `defend` is pinned at its clamp for both");
}

/* ---------------------------------------------------------- exploreRate */

{
  const blank = readPlayer(seat());
  const known = readPlayer(seat({ handsSeen: 200, vpipCount: 50, pfrCount: 40 }));
  ok(exploreRate(blank) > exploreRate(known), "probing decays as the read firms up");
  ok(exploreRate(known) > 0, "probing never stops entirely — that is what stops being read back");
  ok(
    exploreRate(known, "tough") < exploreRate(known, "casual"),
    "a tough table wastes fewer chips finding out",
  );
  for (const d of ["casual", "regular", "tough"] as const) {
    const r = exploreRate(blank, d);
    ok(r > 0 && r < 1, `${d} explore rate is a probability (${r})`);
  }
}

/* ------------------------------------------------------ recency weighting */

// The whole point: a player who was tight and has loosened up reads as loose
// NOW, not as the average of the two. A cumulative average cannot do this.
{
  const changedGear = seat({
    handsSeen: 60,
    vpipCount: 12, // tight over the session as a whole
    pfrCount: 6,
    recent: {
      ...emptyRecentStats(),
      hands: 20, vpip: 17, pfr: 12, // but wide over the last stretch
      postAction: 10, postAggro: 7,
    },
  });
  const read = readPlayer(changedGear);
  ok(read.vpip > 0.7, `recent gear change shows up (vpip ${read.vpip.toFixed(2)})`);
  ok(read.style === "maniac", `and re-labels them (got ${read.style})`);
  // The lifetime counters are untouched, because Stats asks a different
  // question than the bots do.
  ok(changedGear.vpipCount === 12, "lifetime counters are not rewritten by the window");
}

{
  // And the reverse: a maniac who has tightened up.
  const settled = seat({
    handsSeen: 60,
    vpipCount: 55,
    pfrCount: 40,
    recent: { ...emptyRecentStats(), hands: 20, vpip: 3, pfr: 2 },
  });
  ok(readPlayer(settled).vpip < 0.2, "a player who has tightened up reads tight");
}

/* --------------------------------------------------------- archetypeBelief */

{
  const blank = archetypeBelief(seat());
  const vals = Object.values(blank);
  ok(vals.every((v) => Math.abs(v - 0.25) < 1e-9), "no hands watched → no opinion, 25% each");
  ok(Math.abs(vals.reduce((a, b) => a + b, 0) - 1) < 1e-9, "belief sums to 1");
}

{
  // Loose and passive, and it never raises: that is a station and nothing else.
  const station = seat({
    handsSeen: 60, vpipCount: 28, pfrCount: 4,
    postAggroCount: 4, postActionCount: 40,
  });
  const b = archetypeBelief(station);
  ok(b.Station > 0.5, `loose-passive reads mostly Station (${b.Station.toFixed(2)})`);
  ok(b.Station > b.LAG && b.Station > b.Nit, "and beats the alternatives");
  ok(Math.abs(Object.values(b).reduce((x, y) => x + y, 0) - 1) < 1e-9, "sums to 1");
}

{
  const nit = seat({
    handsSeen: 60, vpipCount: 7, pfrCount: 5,
    postAggroCount: 12, postActionCount: 30,
  });
  const b = archetypeBelief(nit);
  ok(b.Nit > b.Station && b.Nit > b.LAG, `very tight reads as a Nit (${b.Nit.toFixed(2)})`);
}

{
  const lag = seat({
    handsSeen: 60, vpipCount: 21, pfrCount: 17,
    postAggroCount: 27, postActionCount: 40,
  });
  const b = archetypeBelief(lag);
  ok(b.LAG + b.TAG > 0.6, `loose-aggressive reads as LAG or TAG (${b.LAG.toFixed(2)}/${b.TAG.toFixed(2)})`);
  ok(b.Station < 0.2, "and not as a station");
}

{
  // Opinions firm up with the sample rather than snapping on hand three.
  const thin = archetypeBelief(seat({ handsSeen: 6, vpipCount: 3, pfrCount: 0, postActionCount: 4 }));
  const thick = archetypeBelief(seat({ handsSeen: 120, vpipCount: 60, pfrCount: 2, postActionCount: 80 }));
  const spread = (b: Record<string, number>) => Math.max(...Object.values(b));
  ok(spread(thin) < spread(thick), `a bigger sample gives a sharper opinion (${spread(thin).toFixed(2)} < ${spread(thick).toFixed(2)})`);
}

/* ---------------------------------------------------------- bluffViability */

{
  const folder = seat({ handsSeen: 40, faceCbetCount: 20, foldToCbetCount: 17, vpipCount: 10, pfrCount: 7 });
  const station = seat({ handsSeen: 40, faceCbetCount: 20, foldToCbetCount: 2, vpipCount: 20, pfrCount: 2, postActionCount: 30, postAggroCount: 3 });
  const vFolder = bluffViability([folder]);
  const vStation = bluffViability([station]);
  ok(vFolder > vStation * 2, `bluffing a folder beats bluffing a station (${vFolder.toFixed(2)} vs ${vStation.toFixed(2)})`);
  ok(bluffViability([]) === 0, "nobody left to bluff → no bluff");

  // The stickiest player sets the price: one station ruins it for the field.
  const twoFolders = bluffViability([folder, { ...folder, id: 2 }]);
  const folderPlusStation = bluffViability([folder, { ...station, id: 2 }]);
  ok(
    folderPlusStation < twoFolders,
    `one station in the field kills it (${folderPlusStation.toFixed(2)} < ${twoFolders.toFixed(2)})`,
  );
  // And a crowd is harder than a heads-up pot, all else equal.
  ok(twoFolders < vFolder, "every extra body is another hand that has to miss");
}

/* ------------------------------------------------------------ bluffPolicy */

{
  const fresh = bluffPolicy(seat());
  ok(fresh.attempts === 0, "a fresh seat has no bluff history");
  ok(fresh.minEquity >= 0 && fresh.minEquity <= 0.32, "and demands little or nothing of a bluff hand");

  // Caught over and over, and it cost real money: do it less, and stop
  // doing it with pure air.
  const caught = bluffPolicy(seat({ bluffAttempts: 30, bluffWins: 2, bluffNetBb: -90 }));
  ok(caught.frequency < fresh.frequency, `getting caught lowers the rate (${caught.frequency.toFixed(2)} < ${fresh.frequency.toFixed(2)})`);
  ok(caught.minEquity > fresh.minEquity, `and tightens the range (${caught.minEquity.toFixed(2)} > ${fresh.minEquity.toFixed(2)})`);

  // Getting away with it: do it more, with anything.
  const winning = bluffPolicy(seat({ bluffAttempts: 30, bluffWins: 26, bluffNetBb: 90 }));
  ok(winning.frequency > fresh.frequency, `getting through raises the rate (${winning.frequency.toFixed(2)})`);
  ok(winning.minEquity === 0, "and will bluff with any two cards");
  ok(winning.frequency > caught.frequency * 2, "the two ends are a long way apart");

  // One unlucky hand does not rewrite the policy.
  const unlucky = bluffPolicy(seat({ bluffAttempts: 1, bluffWins: 0, bluffNetBb: -4 }));
  ok(
    Math.abs(unlucky.frequency - fresh.frequency) < 0.25,
    `a single caught bluff barely moves it (${unlucky.frequency.toFixed(2)} vs ${fresh.frequency.toFixed(2)})`,
  );
  for (const a of [0, 1, 5, 50, 500]) {
    for (const w of [0, 1, a]) {
      for (const net of [-500, -5, 0, 5, 500]) {
      const pol = bluffPolicy(seat({ bluffAttempts: a, bluffWins: Math.min(w, a), bluffNetBb: net }));
      ok(
        pol.frequency >= 0.3 && pol.frequency <= 1.9 && pol.minEquity >= 0 && pol.minEquity <= 0.32,
        `policy stays in range at ${w}/${a}`,
      );
      }
    }
  }
}

// The asymmetry that the success rate alone cannot see: getting through more
// than half the time, and still losing money doing it.
{
  const gettingThroughButLosing = bluffPolicy(
    seat({ bluffAttempts: 40, bluffWins: 22, bluffNetBb: -70 }),
  );
  ok(
    gettingThroughButLosing.frequency < 1,
    `a profitable-looking success rate that loses chips still tightens ` +
      `(${gettingThroughButLosing.frequency.toFixed(2)})`,
  );
  const rarelyThroughButPaying = bluffPolicy(
    seat({ bluffAttempts: 40, bluffWins: 9, bluffNetBb: 60 }),
  );
  ok(
    rarelyThroughButPaying.frequency > 1,
    `and a low success rate that makes money does not ` +
      `(${rarelyThroughButPaying.frequency.toFixed(2)})`,
  );
}

/* --------------------------------------------------------- bluffsThisHand */

{
  // Stable within a hand — this is what makes a barrel rather than a stab.
  const a = bluffsThisHand(42, 3, 0.5);
  for (let i = 0; i < 20; i++) {
    ok(bluffsThisHand(42, 3, 0.5) === a, "the same hand gives the same answer every street");
  }
  ok(bluffsThisHand(42, 3, 0) === false, "rate 0 never bluffs");
  ok(bluffsThisHand(42, 3, 1) === true, "rate 1 always bluffs");

  // Varies across hands and seats, and lands near the requested rate.
  let hits = 0;
  const N = 4000;
  for (let h = 0; h < N; h++) if (bluffsThisHand(h, 2, 0.3)) hits++;
  const got = hits / N;
  ok(Math.abs(got - 0.3) < 0.04, `the rate is honoured over many hands (${got.toFixed(3)})`);

  let differ = 0;
  for (let h = 0; h < 200; h++) if (bluffsThisHand(h, 1, 0.5) !== bluffsThisHand(h, 2, 0.5)) differ++;
  ok(differ > 40, `two seats in the same hand decide independently (${differ}/200)`);
}

console.log(`\nProfile tests: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
