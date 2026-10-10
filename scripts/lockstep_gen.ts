/* Regenerates the Dart port's lockstep parity fixture.
 *
 *   node --experimental-transform-types scripts/lockstep_gen.ts > \
 *     ../poker-zapp/test/fixtures/lockstep_bots.txt
 *
 * The transcript is the desktop engine's own output, line for line, in the
 * format `poker-zapp/test/engine/lockstep_test.dart` rebuilds from the Dart
 * port: decisions, log lines, stacks, pot results, the PokerStars export and
 * the replay frames of every hand. Keep the two in step — if this file's
 * output format changes, `transcript()` in that test has to change with it.
 *
 * Every `Math.random()` the engine takes (first button, shuffle, bot
 * decisions, unseeded equity samples) comes from one mulberry32 stream, which
 * is what makes the two languages comparable at all.
 */
import { createTable, startHand, applyAction, legalActions } from "../src/game/engine.ts";
import { decideBot } from "../src/game/botBrain.ts";
import { formatHand, buildReplayFrames, type HHHand } from "../src/game/handHistory.ts";
import { mulberry32 } from "../src/engine/equity.ts";
import type { Archetype, Card, GameConfig } from "../src/types/poker.ts";

const ARCH: Archetype[] = ["TAG", "LAG", "Nit", "Station"];

interface Section {
  seed: number;
  hands: number;
  seats: number;
  ante: number;
  stack: number;
}

const SECTIONS: Section[] = [
  { seed: 1, hands: 25, seats: 6, ante: 0, stack: 2000 },
  { seed: 11, hands: 25, seats: 6, ante: 0, stack: 150 },
  { seed: 9, hands: 20, seats: 2, ante: 0, stack: 400 },
  { seed: 10, hands: 15, seats: 9, ante: 5, stack: 2000 },
];

function transcript({ seed, hands, seats, ante, stack }: Section): string[] {
  Math.random = mulberry32(seed);

  const config: GameConfig = {
    seats,
    startingStack: stack,
    smallBlind: 10,
    bigBlind: 20,
    ante,
  };
  let state = createTable(config);
  state.players[0].archetype = ARCH[seed % 4];

  const out: string[] = [];
  let lastId = 0;

  for (let h = 0; h < hands; h++) {
    state = startHand(state);
    const nt = state;
    const n = nt.config.seats;
    const hh: HHHand = {
      id: nt.handNumber,
      startedAt: 1750000000000 + nt.handNumber * 1000,
      button: nt.button,
      sb: nt.smallBlind,
      bb: nt.bigBlind,
      sbSeat: n === 2 ? nt.button : (nt.button + 1) % n,
      bbSeat: n === 2 ? (nt.button + 1) % n : (nt.button + 2) % n,
      seats: nt.players.map((p) => ({
        seat: p.id,
        name: p.name,
        stack: nt.stacksAtStart[p.id],
        isHero: p.isHero,
        position: p.position,
      })),
      holes: { 0: nt.players[0].hole },
      tableSize: nt.config.seats,
      actions: [],
      board: [],
      potResults: [],
      heroNet: 0,
    };

    out.push(`H${state.handNumber} btn=${state.button} pos=${state.players.map((p) => p.position).join(",")}`);

    let guard = 0;
    while (state.phase === "betting" && state.toAct !== null && guard++ < 5000) {
      const seat = state.toAct;
      const dec = decideBot(state, seat);
      const amt = dec.action.amount;
      out.push(`  d${seat} ${dec.action.type}${amt !== undefined ? ` ${amt}` : ""}`);
      const p = state.players[seat];
      const la = legalActions(state);
      let amount = 0;
      let allIn = false;
      if (dec.action.type === "call") {
        amount = la.callAmount;
        allIn = amount >= p.stack;
      } else if (dec.action.type === "bet" || dec.action.type === "raise") {
        amount = amt ?? 0;
        allIn = amount >= p.committed + p.stack;
      }
      hh.actions.push({
        street: state.street,
        seat,
        name: p.name,
        type: dec.action.type,
        amount,
        allIn,
      });
      state = applyAction(state, seat, dec.action);
      if (dec.range) state.botRanges[seat] = dec.range;
    }

    hh.board = [...state.board];
    hh.potResults = state.summary?.potResults ?? [];
    hh.uncalled = state.summary?.uncalled;
    hh.heroNet = state.summary?.heroNetChips ?? 0;
    for (const p of state.players) hh.holes[p.id] = p.hole;

    for (const e of state.log) {
      if (e.id > lastId) {
        out.push(`  [${e.street}] ${e.text}`);
        lastId = e.id;
      }
    }

    out.push(
      `  stacks=${state.players.map((p) => p.stack).join(",")} ` +
        `pot=${state.pot} hero=${state.summary?.heroNetChips}`,
    );

    const sm = state.summary!;
    const pots = sm.potResults.map((p) => `${p.winners.join("+")}|${p.amount}|${p.potLabel}`).join(";");
    const sd = sm.showdown
      .map((e) => `${e.playerId}:${(e.hole as Card[]).join("")}:${e.hand?.score}:${e.hand?.name}`)
      .join(";");
    out.push(`  pots=${pots} sd=${sd} board=${sm.board.join("")} net=${sm.heroNetChips}`);

    for (const line of formatHand(hh).split("\n")) out.push(`  |${line}`);
    for (const f of buildReplayFrames(hh)) {
      out.push(
        `  f ${f.street}|${f.text}|${f.board.join("")}|${f.pot}|` +
          `${f.folded.join(",")}|${f.revealAll ? 1 : 0}`,
      );
    }
  }
  return out;
}

const lines: string[] = [];
for (const s of SECTIONS) {
  lines.push(`### seed=${s.seed} hands=${s.hands} seats=${s.seats} ante=${s.ante} stack=${s.stack}`);
  lines.push(...transcript(s));
}
process.stdout.write(lines.join("\n") + "\n");
