import { useEffect, useState } from "react";
import { useDrills } from "@/store/drillStore";
import { useNav } from "@/store/navStore";
import { fmtPct, fmtSigned, fmtTimes, fmtNeed } from "@/lib/format";
import { cx } from "@/lib/cx";
import { Button } from "@/components/ui/controls";
import { Icon } from "@/components/ui/Icon";
import { RangeMatrix } from "@/components/range/RangeMatrix";
import { isTypingTarget, hasModifier } from "@/lib/hotkeys";

export function DrillControls() {
  const puzzle = useDrills((s) => s.puzzle);
  const answered = useDrills((s) => s.answered);
  const result = useDrills((s) => s.result);
  const ratingDelta = useDrills((s) => s.ratingDelta);
  const answer = useDrills((s) => s.answer);
  const next = useDrills((s) => s.next);
  const mode = useDrills((s) => s.mode);
  const drillSimilar = useDrills((s) => s.drillSimilar);
  const focusLeft = useDrills((s) => s.focusLeft);
  const goStudy = useNav((s) => s.go);
  const [showRange, setShowRange] = useState(false);
  useEffect(() => setShowRange(false), [puzzle.id]);

  // Keyboard: 1/2/3 answers, Enter advances to the next puzzle.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e) || hasModifier(e)) return;
      if (!answered) {
        const idx = ["1", "2", "3"].indexOf(e.key);
        if (idx >= 0 && idx < puzzle.options.length) {
          e.preventDefault();
          answer(puzzle.options[idx].action);
        }
      } else if (e.key === "Enter") {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [answered, puzzle, answer, next]);

  const sourceLabel =
    puzzle.kind === "leak"
      ? "Your flagged spot"
      : puzzle.kind === "pushfold"
        ? "Push/Fold · computed Nash"
        : puzzle.source === "chart"
          ? "Pre-flop chart · 100bb baseline"
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
        {puzzle.options.map((o, i) => {
          const accepted = result?.accept.includes(o.action);
          const chosenWrong = answered === o.action && !accepted;
          return (
            <button
              key={o.action + o.label}
              disabled={!!answered}
              onClick={() => answer(o.action)}
              className={cx(
                "relative rounded-xl border px-2 py-3 text-sm font-semibold transition disabled:cursor-default",
                !answered && "border-[var(--line)] bg-ink-700 text-[var(--text)] hover:bg-ink-600",
                answered && accepted && "border-good bg-good/15 text-[var(--text)]",
                answered && chosenWrong && "border-bad bg-bad/15 text-[var(--text)]",
                answered && !accepted && !chosenWrong && "border-[var(--line)] bg-ink-800 text-faint",
              )}
            >
              {i < 3 && (
                <kbd className="absolute left-1.5 top-1.5 rounded border border-[var(--line)] bg-black/20 px-1 text-[0.6rem] mono text-faint">
                  {i + 1}
                </kbd>
              )}
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

          {!result.correct && result.evLossBb !== undefined && result.evLossBb > 0.05 && (
            <p className="mt-2 text-[0.8rem] font-semibold" style={{ color: "var(--bad)" }}>
              That choice costs about {result.evLossBb.toFixed(1)} bb every time —{" "}
              {result.evLossBb < 0.5 ? "a small leak" : result.evLossBb < 1.5 ? "a real leak" : "a blunder-sized leak"}.
            </p>
          )}
          <p className="mt-2 text-[0.84rem] leading-relaxed text-muted">{result.rationale}</p>

          {/* Per-option outcomes in beginner terms (postflop math spots) */}
          {puzzle.equity !== undefined && puzzle.potOdds !== undefined && puzzle.toCall > 0 && (
            <div className="mt-2 space-y-1 rounded-lg bg-ink-850 px-3 py-2 text-[0.76rem] text-muted">
              <div>
                <span className="font-semibold text-[var(--text)]">Folding:</span> 0 bb — costs nothing
                more.
              </div>
              <div>
                <span className="font-semibold text-[var(--text)]">Calling:</span>{" "}
                <span className="mono">
                  {fmtSigned(puzzle.equity * (puzzle.pot + puzzle.toCall) - puzzle.toCall)} bb
                </span>{" "}
                per try — your hand wins {fmtTimes(puzzle.equity)} and you need {fmtNeed(puzzle.potOdds)}.
              </div>
            </div>
          )}
          {(puzzle.equity !== undefined || puzzle.potOdds !== undefined) && (
            <div className="mt-2 flex gap-4 text-[0.74rem] text-faint">
              {puzzle.equity !== undefined && <span>Equity: {fmtPct(puzzle.equity)}</span>}
              {puzzle.potOdds !== undefined && <span>Pot odds: {fmtPct(puzzle.potOdds)}</span>}
            </div>
          )}

          {/* The range this spot was graded against */}
          {puzzle.gradeRange && puzzle.gradeRange.length > 0 && (
            <div className="mt-3">
              <button
                onClick={() => setShowRange((v) => !v)}
                className="flex items-center gap-1 text-[0.72rem] font-semibold text-gold hover:text-gold-light"
              >
                <Icon name="chevron-right" size={13} className={showRange ? "rotate-90 transition" : "transition"} />
                {showRange ? "Hide the range" : `See the range it was graded against`}
              </button>
              {showRange && (
                <div className="mt-2 flex flex-col items-center gap-1">
                  <RangeMatrix highlight={new Set(puzzle.gradeRange)} readOnly size={260} />
                  <div className="text-[0.7rem] text-faint">{puzzle.gradeRangeTitle}</div>
                </div>
              )}
            </div>
          )}

          <div className="mt-3 flex gap-2">
            {puzzle.lessonId && (
              <Button
                variant="secondary"
                size="sm"
                className="flex-1"
                onClick={() => goStudy("study", puzzle.lessonId)}
              >
                <Icon name="book" size={14} /> {puzzle.lessonTitle ?? "Read the lesson"}
              </Button>
            )}
            {mode !== "leaks" && puzzle.kind !== "leak" && (
              <Button variant="secondary" size="sm" className="flex-1" onClick={drillSimilar}>
                <Icon name="target" size={14} /> Drill 5 similar
              </Button>
            )}
          </div>
          {focusLeft > 0 && (
            <div className="mt-1 text-center text-[0.68rem] text-faint">
              {focusLeft} more of this spot type coming up
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
