import { useDrills } from "@/store/drillStore";
import { fmtPct, fmtSigned } from "@/lib/format";
import { cx } from "@/lib/cx";
import { Button } from "@/components/ui/controls";
import { Icon } from "@/components/ui/Icon";

export function DrillControls() {
  const puzzle = useDrills((s) => s.puzzle);
  const answered = useDrills((s) => s.answered);
  const result = useDrills((s) => s.result);
  const ratingDelta = useDrills((s) => s.ratingDelta);
  const answer = useDrills((s) => s.answer);
  const next = useDrills((s) => s.next);

  const sourceLabel =
    puzzle.kind === "leak"
      ? "Your flagged spot"
      : puzzle.kind === "pushfold"
        ? "Push/Fold · Nash-style"
        : puzzle.source === "chart"
          ? "Pre-flop chart · GTO-derived"
          : "Post-flop heuristic · fundamentals";

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-ink-800/70 p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold text-[var(--text)]">
          Your hand: <span className="font-display text-gold-light">{puzzle.handLabel}</span>
        </div>
        <span className="rounded-full bg-white/5 px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-faint">
          {sourceLabel}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {puzzle.options.map((o) => {
          const accepted = result?.accept.includes(o.action);
          const chosenWrong = answered === o.action && !accepted;
          return (
            <button
              key={o.action + o.label}
              disabled={!!answered}
              onClick={() => answer(o.action)}
              className={cx(
                "rounded-xl border px-2 py-3 text-sm font-semibold transition disabled:cursor-default",
                !answered && "border-[var(--line)] bg-ink-700 text-[var(--text)] hover:bg-ink-600",
                answered && accepted && "border-good bg-good/15 text-[var(--text)]",
                answered && chosenWrong && "border-bad bg-bad/15 text-[var(--text)]",
                answered && !accepted && !chosenWrong && "border-[var(--line)] bg-ink-800 text-faint",
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>

      {result && (
        <div className="mt-4 animate-fade-up">
          <div className="flex items-center gap-2">
            <span
              className="grid h-7 w-7 place-items-center rounded-full"
              style={{ background: result.correct ? "var(--good)" : "var(--bad)", color: "#0b0f14" }}
            >
              <Icon name={result.correct ? "check" : "x"} size={16} strokeWidth={2.6} />
            </span>
            <span
              className="font-display text-lg font-bold"
              style={{ color: result.correct ? "var(--good)" : "var(--bad)" }}
            >
              {result.correct ? "Correct" : "Not optimal"}
            </span>
            {ratingDelta !== 0 && (
              <span className="mono ml-auto text-sm font-bold" style={{ color: ratingDelta >= 0 ? "var(--good)" : "var(--bad)" }}>
                {fmtSigned(ratingDelta, 0)}
              </span>
            )}
          </div>

          <p className="mt-2 text-[0.84rem] leading-relaxed text-muted">{result.rationale}</p>

          {(puzzle.equity !== undefined || puzzle.potOdds !== undefined) && (
            <div className="mt-2 flex gap-4 text-[0.74rem] text-faint">
              {puzzle.equity !== undefined && <span>Equity: {fmtPct(puzzle.equity)}</span>}
              {puzzle.potOdds !== undefined && <span>Pot odds: {fmtPct(puzzle.potOdds)}</span>}
            </div>
          )}

          <Button className="mt-3 w-full" onClick={next}>
            Next puzzle <Icon name="arrow-right" size={15} />
          </Button>
        </div>
      )}
    </div>
  );
}
