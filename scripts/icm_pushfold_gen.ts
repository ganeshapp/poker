/* ICM push/fold solver for bubble scenarios (SB jam vs BB call,
 * 4 players, 3 paid).
 *
 * Malmuth-Harville ICM turns stacks into prize-pool equity; fictitious
 * play over the pinned 169×169 preflop equity matrix then finds the
 * SB jamming range and BB calling range that maximize $EV (not chips).
 * The output tables power the "Push/Fold · ICM bubble" drills.
 *
 * Writes src/data/icmPushfold.ts. Run:
 *   node --experimental-transform-types scripts/icm_pushfold_gen.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { icmShares } from "../src/lib/icm.ts";

const { labels, equity } = JSON.parse(
  readFileSync(new URL("./golden/equity_matrix.json", import.meta.url), "utf8"),
) as { labels: string[]; equity: number[][] };

const N = 169;
const E = new Float64Array(N * N);
for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) E[i * N + j] = equity[i][j];
const W = new Float64Array(N);
labels.forEach((l, i) => {
  W[i] = (l.length === 2 ? 6 : l.endsWith("s") ? 4 : 12) / 1326;
});

/* ---- Bubble scenarios: 4 players, payouts 50/30/20, hero decisions
   are SB jam and BB call. Stacks in bb, listed [SB, BB, other, other]. ---- */
export interface IcmScenario {
  id: string;
  name: string;
  blurb: string;
  stacks: [number, number, number, number];
}

const SCENARIOS: IcmScenario[] = [
  { id: "even", name: "Even bubble", blurb: "Four even stacks, three get paid — the purest bubble.", stacks: [25, 25, 25, 25] },
  { id: "big-sb", name: "Big stack in the SB", blurb: "You cover everyone; the BB can't afford to bust.", stacks: [45, 15, 20, 20] },
  { id: "short-sb", name: "Short stack in the SB", blurb: "You're the one who can't afford mistakes — but folding blinds away is dying slowly.", stacks: [10, 30, 30, 30] },
  { id: "big-bb", name: "Chip leader in the BB", blurb: "The BB covers you: every all-in threatens YOUR tournament life, not theirs.", stacks: [20, 45, 17, 18] },
  { id: "mid-vs-short", name: "Medium vs short", blurb: "You have chips to pressure with; the BB is nearly dead anyway.", stacks: [28, 8, 32, 32] },
];

const PAYOUTS = [0.5, 0.3, 0.2];
const SBLIND = 0.5;
const BBLIND = 1;

function solveScenario(sc: IcmScenario) {
  const [sb0, bb0, o1, o2] = sc.stacks;
  const baseline = icmShares([sb0, bb0, o1, o2], PAYOUTS);

  // $EV deltas for the SB, per outcome (relative to pre-hand ICM).
  const icmOf = (sb: number, bb: number) => icmShares([sb, bb, o1, o2], PAYOUTS);
  const eff = Math.min(sb0, bb0);
  const sbFold = icmOf(sb0 - SBLIND, bb0 + SBLIND);
  const jamFold = icmOf(sb0 + BBLIND, bb0 - BBLIND);
  const sbWins = icmOf(sb0 + eff, bb0 - eff);
  const sbLoses = icmOf(sb0 - eff, bb0 + eff);

  // Fictitious play in $EV.
  const jam = new Float64Array(N);
  const call = new Float64Array(N);
  // Init: jam top ~40%, call top ~10% (by vs-random strength).
  const strength = new Float64Array(N);
  for (let h = 0; h < N; h++) {
    let s = 0;
    for (let l = 0; l < N; l++) s += W[l] * E[h * N + l];
    strength[h] = s;
  }
  const order = [...Array(N).keys()].sort((a, b) => strength[b] - strength[a]);
  order.slice(0, 68).forEach((h) => (jam[h] = 1));
  order.slice(0, 17).forEach((h) => (call[h] = 1));

  const ROUNDS = 200;
  for (let t = 1; t <= ROUNDS; t++) {
    // SB best response vs avg calling range.
    {
      let callMass = 0;
      const eVec = new Float64Array(N);
      for (let l = 0; l < N; l++) {
        const m = call[l] * W[l];
        if (m === 0) continue;
        callMass += m;
        for (let h = 0; h < N; h++) eVec[h] += m * E[h * N + l];
      }
      for (let h = 0; h < N; h++) {
        const eq = callMass > 0 ? eVec[h] / callMass : 0.5;
        const evJam =
          (1 - callMass) * jamFold[0] + callMass * (eq * sbWins[0] + (1 - eq) * sbLoses[0]);
        const br = evJam > sbFold[0] ? 1 : 0;
        jam[h] += (br - jam[h]) / t;
      }
    }
    // BB best response vs avg jam range.
    {
      let jamMass = 0;
      const eVec = new Float64Array(N);
      for (let l = 0; l < N; l++) {
        const m = jam[l] * W[l];
        if (m === 0) continue;
        jamMass += m;
        for (let h = 0; h < N; h++) eVec[h] += m * E[h * N + l];
      }
      for (let h = 0; h < N; h++) {
        const eqBb = jamMass > 0 ? eVec[h] / jamMass : 0.5; // BB equity vs jam range
        const evCall = eqBb * sbLoses[1] + (1 - eqBb) * sbWins[1];
        const br = evCall > jamFold[1] ? 1 : 0;
        call[h] += (br - call[h]) / t;
      }
    }
  }

  const sparse = (v: Float64Array) => {
    const out: Record<string, number> = {};
    for (let h = 0; h < N; h++) {
      let w = v[h];
      if (w < 0.05) continue;
      out[labels[h]] = w > 0.95 ? 1 : Math.round(w * 100) / 100;
    }
    return out;
  };
  const width = (r: Record<string, number>) =>
    Object.entries(r).reduce((a, [l, w]) => a + w * (l.length === 2 ? 6 : l.endsWith("s") ? 4 : 12), 0) / 1326;

  const jamR = sparse(jam);
  const callR = sparse(call);
  console.log(
    `${sc.id.padEnd(12)} SB jam ${(width(jamR) * 100).toFixed(1)}%  BB call ${(width(callR) * 100).toFixed(1)}%  (baseline $EV SB ${(baseline[0] * 100).toFixed(1)}%)`,
  );
  return { ...sc, jam: jamR, call: callR };
}

const solved = SCENARIOS.map(solveScenario);

const dir = fileURLToPath(new URL("../src/data/", import.meta.url));
writeFileSync(
  dir + "icmPushfold.ts",
  `/* AUTO-GENERATED by scripts/icm_pushfold_gen.ts — do not edit.
 * ICM (Malmuth-Harville) push/fold equilibria for 4-handed bubbles,
 * payouts 50/30/20, solved by fictitious play in $EV over the pinned
 * preflop equity matrix. Frequencies 0..1.
 */
export interface IcmScenario {
  id: string;
  name: string;
  blurb: string;
  /** [SB, BB, other, other] stacks in bb. */
  stacks: [number, number, number, number];
  jam: Record<string, number>;
  call: Record<string, number>;
}
export const ICM_SCENARIOS: IcmScenario[] = ${JSON.stringify(solved)};
`,
);
console.log("wrote src/data/icmPushfold.ts");
