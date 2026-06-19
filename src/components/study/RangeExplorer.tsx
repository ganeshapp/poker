import { useState } from "react";
import type { HandLabel } from "@/types/poker";
import { topPercentRange } from "@/engine/ranges";
import { combosInSet, TOTAL_COMBOS } from "@/engine/notation";
import { RangeMatrix, RangeLegend } from "@/components/range/RangeMatrix";
import { Button } from "@/components/ui/controls";
import { fmtPct } from "@/lib/format";

const PRESETS = [
  { label: "UTG ~14%", pct: 14 },
  { label: "MP ~19%", pct: 19 },
  { label: "CO ~27%", pct: 27 },
  { label: "BTN ~45%", pct: 45 },
  { label: "BB defend ~55%", pct: 55 },
];

export function RangeExplorer() {
  const [painted, setPainted] = useState<Set<HandLabel>>(() => topPercentRange(14));
  const combos = combosInSet(painted);

  return (
    <div className="space-y-4 rounded-2xl border border-[var(--line)] bg-ink-850 p-5">
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <Button key={p.label} variant="secondary" size="sm" onClick={() => setPainted(topPercentRange(p.pct))}>
            {p.label}
          </Button>
        ))}
        <Button variant="ghost" size="sm" onClick={() => setPainted(new Set())}>
          Clear
        </Button>
      </div>

      <div className="flex flex-col items-center gap-3">
        <RangeMatrix value={painted} onChange={setPainted} size={440} />
        <div className="flex w-full items-center justify-between">
          <RangeLegend />
          <span className="mono text-sm font-semibold text-gold-light">
            {combos} combos · {fmtPct(combos / TOTAL_COMBOS)} of all hands
          </span>
        </div>
      </div>

      <p className="text-[0.82rem] leading-relaxed text-muted">
        Load a preset to see how a target percentage maps to actual cells, or paint your own and watch
        the combo count. There are 1,326 total combos; that running count is exactly what the EV Coach
        means when it says a villain's range is "≈ 450 combos."
      </p>
    </div>
  );
}
