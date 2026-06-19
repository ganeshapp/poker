import { useState } from "react";
import { useGame, type Verdict } from "@/store/gameStore";
import { fmtSigned } from "@/lib/format";
import { Button } from "@/components/ui/controls";
import { Icon, type IconName } from "@/components/ui/Icon";

const META: Record<Verdict, { label: string; color: string; icon: IconName }> = {
  mistake: { label: "Mistake", color: "var(--bad)", icon: "x" },
  thin: { label: "Thin spot", color: "var(--warn)", icon: "info" },
  ok: { label: "Reasonable", color: "var(--info)", icon: "check" },
  great: { label: "Nice play", color: "var(--good)", icon: "check" },
  info: { label: "Read", color: "var(--info)", icon: "eye" },
};

export function EVCoachPanel() {
  const reviewLog = useGame((s) => s.reviewLog);
  const activeReviewId = useGame((s) => s.activeReviewId);
  const dismiss = useGame((s) => s.dismissReview);
  const reopen = useGame((s) => s.reopenReview);
  const openRangeView = useGame((s) => s.openRangeView);
  const bb = useGame((s) => s.table.bigBlind);
  const [showMath, setShowMath] = useState(false);

  const review = reviewLog.find((r) => r.id === activeReviewId) ?? null;

  // Collapsed: a small pill to reopen the latest note.
  if (!review) {
    if (reviewLog.length === 0) return null;
    return (
      <button
        onClick={() => reopen()}
        className="absolute right-5 top-5 z-30 flex items-center gap-2 rounded-full border border-[var(--line-strong)] bg-ink-800/90 px-3 py-1.5 text-[0.74rem] font-semibold text-muted shadow-card backdrop-blur transition hover:text-[var(--text)]"
      >
        <Icon name="coach" size={14} className="text-gold" /> Coach notes ({reviewLog.length})
      </button>
    );
  }

  const meta = META[review.verdict];
  const equityPct = review.equity != null ? Math.round(review.equity * 100) : null;
  const oddsPct = review.potOdds != null ? Math.round(review.potOdds * 100) : null;
  const evBb = review.evChips != null ? review.evChips / bb : null;

  return (
    <div className="pointer-events-auto absolute right-5 top-5 z-30 w-[340px] animate-slide-in-right">
      <div className="overflow-hidden rounded-2xl border border-[var(--line-strong)] bg-ink-800/95 shadow-[var(--sh-pop)] backdrop-blur">
        <div className="flex items-center gap-2 px-4 py-3" style={{ background: `${meta.color}1f` }}>
          <span className="grid h-7 w-7 place-items-center rounded-full" style={{ background: meta.color, color: "#0b0f14" }}>
            <Icon name={meta.icon} size={16} strokeWidth={2.6} />
          </span>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Icon name="coach" size={15} className="text-gold" />
              <span className="font-display text-sm font-bold" style={{ color: meta.color }}>
                {meta.label}
              </span>
            </div>
            <div className="text-[0.68rem] text-muted">
              {review.kind === "bot" ? "Bot read" : "EV Coach"} · {review.title}
            </div>
          </div>
          {!review.blocking && (
            <button onClick={dismiss} className="text-muted hover:text-[var(--text)]" aria-label="Dismiss">
              <Icon name="x" size={16} />
            </button>
          )}
        </div>

        <div className="space-y-3 p-4">
          {equityPct != null && (
            <div>
              <div className="mb-1 flex justify-between text-[0.7rem]">
                <span className="text-muted">
                  Equity vs <span className="text-[var(--text)]">{review.villainName}</span>
                </span>
                <span className="mono font-semibold" style={{ color: meta.color }}>
                  {equityPct}%
                </span>
              </div>
              <div className="relative h-2.5 overflow-hidden rounded-full bg-ink-600">
                <div className="h-full rounded-full" style={{ width: `${equityPct}%`, background: meta.color }} />
                {oddsPct != null && oddsPct > 0 && (
                  <div className="absolute top-0 h-full w-[2px] bg-white" style={{ left: `${oddsPct}%` }} title={`Need ${oddsPct}%`} />
                )}
              </div>
              {oddsPct != null && oddsPct > 0 && (
                <div className="mt-1 text-[0.66rem] text-faint">White line = {oddsPct}% needed (pot odds)</div>
              )}
            </div>
          )}

          <p className="text-[0.82rem] leading-relaxed text-[var(--text)]">{review.text}</p>

          {review.multiway && (
            <div className="flex items-start gap-2 rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-[0.74rem] leading-relaxed text-warn">
              <Icon name="info" size={14} className="mt-0.5 shrink-0" />
              <span>
                Multiway pot ({review.opponents} opponents). Equity is computed against the whole field as
                random hands — more realistic than heads-up, and a reason to keep continuing ranges tight.
              </span>
            </div>
          )}

          {review.steps && review.steps.length > 0 && (
            <div>
              <button
                onClick={() => setShowMath((v) => !v)}
                className="flex items-center gap-1 text-[0.72rem] font-semibold text-gold hover:text-gold-light"
              >
                <Icon name="chevron-right" size={13} className={showMath ? "rotate-90 transition" : "transition"} />
                {showMath ? "Hide the math" : "Show the math"}
              </button>
              {showMath && (
                <ol className="mt-2 space-y-1.5 border-l border-[var(--line)] pl-3">
                  {review.steps.map((s, i) => (
                    <li key={i} className="text-[0.74rem] leading-relaxed text-muted">
                      <span className="mr-1 text-gold/70">{i + 1}.</span>
                      {s}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}

          {evBb != null && (
            <div className="flex items-center justify-between rounded-lg bg-ink-850 px-3 py-2">
              <span className="text-[0.72rem] text-muted">Expected value</span>
              <span
                className="mono text-sm font-bold"
                style={{ color: evBb < -0.05 ? "var(--bad)" : evBb > 0.05 ? "var(--good)" : "var(--text-muted)" }}
              >
                {fmtSigned(evBb)} bb
              </span>
            </div>
          )}

          <div className="flex gap-2">
            {review.villainRange && review.villainRange.length > 0 && (
              <Button
                variant="secondary"
                size="sm"
                className="flex-1"
                onClick={() => openRangeView(review.villainName ?? "Villain", review.villainRange ?? [])}
              >
                <Icon name="eye" size={14} /> View range
              </Button>
            )}
            {review.blocking ? (
              <Button size="sm" className="flex-1" onClick={dismiss}>
                Got it
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={dismiss}>
                Close
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
