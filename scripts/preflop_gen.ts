/* Preflop chart source + generator.
 *
 * The range strings below are the SOURCE OF TRUTH for the app's
 * preflop answer key: self-authored consensus baselines for 100bb
 * 6-max cash (2.5bb opens), written from general poker knowledge —
 * not copied from any commercial product. Mixed-frequency hands carry
 * an explicit ":freq" suffix, like a real equilibrium.
 *
 * Notation: "22+" pairs up; "77-99" pair run; "A5s" single; "A2s+"
 * suited kicker run up to one below the high card; "Q9s-Q6s" kicker
 * run; same with "o" for offsuit; ":0.5" frequency suffix.
 *
 * Emits src/data/preflop.ts (keyed by stack depth from day one).
 *   node --experimental-transform-types scripts/preflop_gen.ts
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const RANKS = "AKQJT98765432"; // high → low

type Chart = Record<string, number>;

function expandToken(tok: string, into: Chart) {
  const [core, freqStr] = tok.split(":");
  const freq = freqStr ? Number.parseFloat(freqStr) : 1;
  if (!(freq > 0 && freq <= 1)) throw new Error(`bad freq in "${tok}"`);
  const put = (label: string) => {
    into[label] = Math.max(into[label] ?? 0, freq);
  };
  const ri = (c: string) => {
    const i = RANKS.indexOf(c);
    if (i < 0) throw new Error(`bad rank "${c}" in "${tok}"`);
    return i;
  };

  // Pairs: "22", "TT+", "77-99"
  if (/^([AKQJT98765432])\1/.test(core)) {
    const r = ri(core[0]);
    if (core.endsWith("+")) {
      for (let i = r; i >= 0; i--) put(RANKS[i] + RANKS[i]);
    } else if (core.includes("-")) {
      const r2 = ri(core.split("-")[1][0]);
      const [lo, hi] = [Math.max(r, r2), Math.min(r, r2)];
      for (let i = hi; i <= lo; i++) put(RANKS[i] + RANKS[i]);
    } else {
      put(core.slice(0, 2));
    }
    return;
  }

  // Two-rank: "A5s", "A2s+", "Q9s-Q6s", offsuit variants
  const m = core.match(/^([AKQJT98765432])([AKQJT98765432])([so])(\+?)$/);
  const mr = core.match(/^([AKQJT98765432])([AKQJT98765432])([so])-([AKQJT98765432])([AKQJT98765432])([so])$/);
  if (m) {
    const [, hi, lo, suit, plus] = m;
    const h = ri(hi);
    const l = ri(lo);
    if (l <= h) throw new Error(`kicker not below high card in "${tok}"`);
    if (plus) {
      for (let i = l; i > h; i--) put(hi + RANKS[i] + suit);
    } else {
      put(hi + lo + suit);
    }
  } else if (mr) {
    const [, hi, lo1, suit, hi2, lo2] = mr;
    if (hi !== hi2) throw new Error(`range across different high cards in "${tok}"`);
    const a = ri(lo1);
    const b = ri(lo2);
    for (let i = Math.min(a, b); i <= Math.max(a, b); i++) put(hi + RANKS[i] + suit);
  } else {
    throw new Error(`unparseable token "${tok}"`);
  }
}

function range(s: string): Chart {
  const out: Chart = {};
  for (const tok of s.trim().split(/[\s,]+/)) if (tok) expandToken(tok, out);
  return out;
}

const comboCount = (l: string) => (l.length === 2 ? 6 : l.endsWith("s") ? 4 : 12);
const width = (c: Chart) =>
  Object.entries(c).reduce((a, [l, f]) => a + f * comboCount(l), 0) / 1326;

/* ================= RFI (raise first in), 2.5bb opens ================= */
const RFI: Record<string, string> = {
  UTG: "22+ A9s+ A5s-A2s:0.5 KTs+ QTs+ JTs T9s 98s:0.5 ATo+ KQo",
  MP: "22+ A2s+ KTs+ K9s:0.5 QTs+ Q9s:0.5 J9s+ T9s 98s 87s:0.5 ATo+ KJo+ QJo:0.5",
  CO: "22+ A2s+ K8s+ K7s-K5s:0.5 Q9s+ Q8s:0.5 J9s+ T8s+ 97s+ 87s 76s 65s:0.5 A8o+ A5o:0.5 KTo+ QTo+ JTo",
  BTN: "22+ A2s+ K2s+ Q4s+ Q3s-Q2s:0.5 J7s+ J6s-J5s:0.5 T7s+ 96s+ 86s+ 75s+ 64s+:0.5 54s 53s:0.5 43s:0.5 A2o+ K8o+ K7o-K5o:0.5 Q9o+ Q8o:0.5 J9o+ J8o:0.5 T9o T8o:0.5 98o:0.5",
  SB: "22+ A2s+ K2s+ Q4s+ J7s+ T7s+ 97s+ 86s+ 75s+ 65s 54s A2o+ K8o+ Q9o+ J9o+ T9o 98o:0.5",
};

/* ============ Facing an open: 3-bet + call, hero vs raiser ============ */
const VS_RFI: Record<string, { threebet: string; call: string }> = {
  MP_vs_UTG: {
    threebet: "QQ+ AKs AKo:0.5 A5s:0.5",
    call: "88-JJ 77:0.5 AQs AJs ATs:0.5 KQs QJs:0.5 JTs T9s:0.5 AQo:0.5",
  },
  CO_vs_UTG: {
    threebet: "QQ+ AKs AKo A5s:0.5",
    call: "77-JJ 22-66:0.5 AQs AJs ATs KQs KJs:0.5 QJs JTs T9s 98s:0.5 AQo",
  },
  CO_vs_MP: {
    threebet: "JJ+ AQs+ AKo A5s-A4s:0.5",
    call: "66-TT 22-55:0.5 AJs ATs KJs+ QJs JTs T9s AQo AJo:0.5",
  },
  BTN_vs_UTG: {
    threebet: "QQ+ AKs AKo A5s:0.5",
    call: "55-JJ 22-44:0.5 AQs AJs ATs:0.5 KQs KJs:0.5 QJs JTs T9s 98s:0.5 AQo",
  },
  BTN_vs_MP: {
    threebet: "JJ+ AQs+ AKo A5s-A4s:0.5",
    call: "44-TT 22-33:0.5 ATs+ KTs+ QTs+ JTs T9s 98s 87s:0.5 76s:0.5 AJo+ KQo:0.5",
  },
  BTN_vs_CO: {
    threebet: "TT+ AJs+ AKo AQo:0.5 A5s-A3s:0.5 KQs:0.5 76s:0.25 65s:0.25",
    call: "22-99 A2s+ KTs+ QTs+ J9s+ T8s+ 97s+ 87s 76s 65s ATo+ KJo+ QJo:0.5",
  },
  SB_vs_UTG: {
    threebet: "QQ+ AKs AKo:0.5 A5s:0.5",
    call: "88-JJ 77:0.5 AQs AJs:0.5 KQs QJs:0.5 JTs:0.5 AQo:0.5",
  },
  SB_vs_MP: {
    threebet: "JJ+ AQs+ AKo A5s:0.5",
    call: "66-TT AJs ATs:0.5 KJs+ QJs JTs T9s:0.5 AQo",
  },
  SB_vs_CO: {
    threebet: "TT+ AJs+ AQo+ A5s-A4s:0.5 KQs 99:0.5",
    call: "55-99 22-44:0.5 ATs KTs+ QTs+ JTs T9s 98s:0.5 AJo KQo",
  },
  SB_vs_BTN: {
    threebet: "99+ ATs+ AJo+ A5s-A2s:0.5 KJs+ QJs:0.5 JTs:0.5 88:0.5 T9s:0.25",
    call: "22-88 A9s-A6s:0.5 KTs QTs J9s+ T8s+ 98s 87s 76s ATo KJo QJo:0.5",
  },
  BB_vs_UTG: {
    threebet: "QQ+ AKs AKo:0.5 A5s-A4s:0.5",
    call: "22-JJ A2s+ K9s+ K8s:0.5 Q9s+ J9s+ T8s+ 97s+ 87s 76s 65s 54s ATo+ KJo+ QJo:0.5 JTo:0.5",
  },
  BB_vs_MP: {
    threebet: "JJ+ AQs+ AKo A5s-A4s:0.5 76s:0.25 65s:0.25",
    call: "22-TT A2s+ K8s+ Q9s+ J8s+ T8s+ 97s+ 86s+ 76s 65s 54s A9o+ KTo+ QTo+ JTo",
  },
  BB_vs_CO: {
    threebet: "TT+ AJs+ AQo+ A5s-A2s:0.5 KQs T9s:0.25 98s:0.25",
    call: "22-99 A2s+ K5s+ Q8s+ J8s+ T7s+ 97s+ 86s+ 75s+ 65s 54s A8o+ A5o:0.5 KTo+ QTo+ JTo T9o:0.5",
  },
  BB_vs_BTN: {
    threebet: "99+ ATs+ AJo+ KQo:0.5 A5s-A2s:0.75 K9s:0.5 QTs:0.25 JTs:0.25 87s:0.25 76s:0.25",
    call: "22-88 A2s+ K2s+ Q4s+ J7s+ T7s+ 96s+ 86s+ 75s+ 64s+ 54s 43s A2o+ K9o+ Q9o+ J9o+ T8o+ 98o 87o:0.5",
  },
  BB_vs_SB: {
    threebet: "88+ A9s+ ATo+ KQo A5s-A2s:0.75 KTs+ QJs:0.5 JTs:0.5 T9s:0.5 77:0.5",
    call: "22-77 A2s+ K2s+ Q2s+ J4s+ T6s+ 95s+ 85s+ 74s+ 64s+ 53s+ 43s A2o+ K7o+ Q8o+ J8o+ T8o+ 97o+ 87o 76o:0.5",
  },
};

/* ============================ Emit ============================ */
const rfi: Record<string, Chart> = {};
for (const [pos, s] of Object.entries(RFI)) {
  rfi[pos] = range(s);
  console.log(`RFI ${pos}: ${(width(rfi[pos]) * 100).toFixed(1)}%`);
}

const vsRfi: Record<string, { threebet: Chart; call: Chart }> = {};
for (const [key, { threebet, call }] of Object.entries(VS_RFI)) {
  const tb = range(threebet);
  const cl = range(call);
  // A hand can't act more than 100% of the time: clip call by 3-bet.
  for (const [l, f] of Object.entries(cl)) {
    const room = Math.round((1 - (tb[l] ?? 0)) * 100) / 100;
    if (f > room) {
      if (room <= 0) delete cl[l];
      else cl[l] = room;
    }
  }
  vsRfi[key] = { threebet: tb, call: cl };
  console.log(
    `${key}: 3bet ${(width(tb) * 100).toFixed(1)}% · call ${(width(cl) * 100).toFixed(1)}% · continue ${((width(tb) + width(cl)) * 100).toFixed(1)}%`,
  );
}

const dir = fileURLToPath(new URL("../src/data/", import.meta.url));
mkdirSync(dir, { recursive: true });
const banner = `/* AUTO-GENERATED by scripts/preflop_gen.ts — edit the range strings
 * there, not this file. Self-authored consensus baseline charts for
 * 100bb 6-max cash (2.5bb opens); per-label frequencies 0..1.
 */
`;
writeFileSync(
  dir + "preflop.ts",
  banner +
    `export type ChartFreqs = Record<string, number>;\n` +
    `export interface VsRfiChart { threebet: ChartFreqs; call: ChartFreqs }\n` +
    `export interface PreflopCharts { rfi: Record<string, ChartFreqs>; vsRfi: Record<string, VsRfiChart> }\n` +
    `/** Charts keyed by effective stack depth in bb (100bb only today —\n` +
    ` * new depths must ship with their own charts, never rescaled). */\n` +
    `export const PREFLOP_BY_DEPTH: Record<number, PreflopCharts> = { 100: ${JSON.stringify({ rfi, vsRfi })} };\n` +
    `export const PREFLOP_100 = PREFLOP_BY_DEPTH[100];\n`,
);
console.log("wrote src/data/preflop.ts");
