import { useDrills, type DrillMode } from "@/store/drillStore";
import { useLeaks } from "@/store/leakStore";
import { DrillTable } from "@/components/drills/DrillTable";
import { MoveNavigator } from "@/components/drills/MoveNavigator";
import { DrillControls } from "@/components/drills/DrillControls";
import { Tooltip } from "@/components/ui/Tooltip";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/lib/cx";

const MODE_INFO: Record<DrillMode, { label: string; blurb: string }> = {
  mixed: { label: "Mixed", blurb: "Pre-flop charts + post-flop pot-odds/equity. Opponent type is irrelevant — play the equilibrium." },
  pushfold: { label: "Push / Fold", blurb: "Short-stack shove/fold and call-a-shove spots, graded by Nash-style charts." },
  leaks: { label: "My Leaks", blurb: "Your coach-flagged −EV decisions, re-served until you get them right." },
};

export function DrillsView() {
  const rating = useDrills((s) => s.rating);
  const solved = useDrills((s) => s.solved);
  const correct = useDrills((s) => s.correct);
  const streak = useDrills((s) => s.streak);
  const best = useDrills((s) => s.best);
  const mode = useDrills((s) => s.mode);
  const setMode = useDrills((s) => s.setMode);
  const leakCount = useLeaks((s) => s.spots.length);
  const acc = solved > 0 ? Math.round((correct / solved) * 100) : 0;
  const emptyLeaks = mode === "leaks" && leakCount === 0;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--line)] px-6 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-xl font-extrabold">GTO Drills</h1>
            <p className="text-[0.74rem] text-faint">{MODE_INFO[mode].blurb}</p>
          </div>
          {mode !== "leaks" && (
            <div className="flex items-center gap-3">
              <Tooltip content="A self-adjusting puzzle rating (like a chess puzzle ELO). Right answers raise it, wrong ones lower it, weighted by difficulty.">
                <div>
                  <Stat label="Rating" value={String(rating)} tone="gold" hint />
                </div>
              </Tooltip>
              <Stat label="Accuracy" value={`${acc}%`} />
              <Stat label="Streak" value={String(streak)} />
              <Stat label="Best" value={String(best)} />
            </div>
          )}
        </div>

        <div className="mt-3 flex gap-1.5">
          {(Object.keys(MODE_INFO) as DrillMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cx(
                "rounded-lg px-3 py-1.5 text-[0.8rem] font-semibold transition",
                mode === m ? "bg-gold text-ink-900" : "bg-ink-700 text-muted hover:text-[var(--text)]",
              )}
            >
              {MODE_INFO[m].label}
              {m === "leaks" && leakCount > 0 ? ` (${leakCount})` : ""}
            </button>
          ))}
        </div>
      </div>

      {emptyLeaks ? (
        <div className="grid flex-1 place-items-center p-8">
          <div className="max-w-[440px] text-center">
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-good/15 text-good">
              <Icon name="check" size={24} />
            </div>
            <h2 className="font-display text-xl font-bold text-[var(--text)]">No leaks to drill</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Play a session with the EV Coach on. Any clear −EV decision it flags is saved here, so you
              can re-drill your own mistakes until they're automatic.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="relative min-h-0 flex-1 p-4">
            <DrillTable />
          </div>
          <aside className="flex w-[360px] shrink-0 flex-col gap-3 overflow-auto border-l border-[var(--line)] bg-ink-850/60 p-4">
            <DrillControls />
            <MoveNavigator />
          </aside>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone, hint }: { label: string; value: string; tone?: "gold"; hint?: boolean }) {
  return (
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
}
