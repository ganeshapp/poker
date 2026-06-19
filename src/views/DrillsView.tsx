import { useDrills } from "@/store/drillStore";
import { DrillTable } from "@/components/drills/DrillTable";
import { MoveNavigator } from "@/components/drills/MoveNavigator";
import { DrillControls } from "@/components/drills/DrillControls";
import { Tooltip } from "@/components/ui/Tooltip";
import { Icon } from "@/components/ui/Icon";

export function DrillsView() {
  const rating = useDrills((s) => s.rating);
  const solved = useDrills((s) => s.solved);
  const correct = useDrills((s) => s.correct);
  const streak = useDrills((s) => s.streak);
  const best = useDrills((s) => s.best);
  const acc = solved > 0 ? Math.round((correct / solved) * 100) : 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-[var(--line)] px-6 py-3">
        <div>
          <h1 className="font-display text-xl font-extrabold">GTO Drills</h1>
          <p className="text-[0.74rem] text-faint">
            Chess-style puzzles. Pre-flop answers use position charts; post-flop uses pot-odds/equity
            heuristics. Opponent type is irrelevant — play the equilibrium.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Stat label="Rating" value={String(rating)} tone="gold" hint="A self-adjusting puzzle rating (like a chess puzzle ELO). Right answers raise it, wrong ones lower it, weighted by difficulty." />
          <Stat label="Accuracy" value={`${acc}%`} />
          <Stat label="Streak" value={String(streak)} />
          <Stat label="Best" value={String(best)} />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="relative min-h-0 flex-1 p-4">
          <DrillTable />
        </div>
        <aside className="flex w-[360px] shrink-0 flex-col gap-3 overflow-auto border-l border-[var(--line)] bg-ink-850/60 p-4">
          <DrillControls />
          <MoveNavigator />
        </aside>
      </div>
    </div>
  );
}

function Stat({ label, value, tone, hint }: { label: string; value: string; tone?: "gold"; hint?: string }) {
  const inner = (
    <div className="rounded-xl border border-[var(--line)] bg-ink-800/70 px-3 py-1.5 text-center">
      <div className="flex items-center gap-1 text-[0.58rem] uppercase tracking-wide text-faint">
        {label}
        {hint && <Icon name="info" size={10} />}
      </div>
      <div className={tone === "gold" ? "mono text-lg font-bold text-gold-light" : "mono text-lg font-bold text-[var(--text)]"}>
        {value}
      </div>
    </div>
  );
  return hint ? <Tooltip content={hint}>{inner}</Tooltip> : inner;
}
