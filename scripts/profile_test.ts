/* node --experimental-transform-types scripts/profile_test.ts
 *
 * The opponent model: what a seat reads off another seat, and how each
 * archetype leans once it thinks it has somebody figured out.
 */
import {
  readPlayer,
  inferredPreflopRange,
  adjustmentFor,
  exploreRate,
  NO_ADJUSTMENT,
} from "../src/game/profile.ts";
import type { Player } from "../src/types/poker.ts";

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
  return {
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
    sittingOut: false,
    ...over,
  } as Player;
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

console.log(`\nProfile tests: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
