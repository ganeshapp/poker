import { useEffect, useState } from "react";
import { useGame, loadTableOptions, type TableOptions } from "@/store/gameStore";
import { cx } from "@/lib/cx";
import { useStats } from "@/store/statsStore";
import { PokerTable } from "@/components/table/PokerTable";
import { ActionBar } from "@/components/table/ActionBar";
import { EVCoachPanel } from "@/components/coach/EVCoachPanel";
import { RangeViewModal } from "@/components/coach/RangeViewModal";
import { ResultOverlay } from "@/components/play/ResultOverlay";
import { SideRail } from "@/components/play/SideRail";
import { SessionSummaryModal } from "@/components/play/SessionSummaryModal";
import { GuessModal } from "@/components/range/GuessModal";
import { Button } from "@/components/ui/controls";
import { Icon } from "@/components/ui/Icon";
import { isTypingTarget, hasModifier } from "@/lib/hotkeys";

export function PlayView() {
  const sessionActive = useGame((s) => s.session.active);
  const newSession = useGame((s) => s.newSession);
  const [tableOpts, setTableOpts] = useState<TableOptions>(() => loadTableOptions());

  useEffect(() => {
    void useStats.getState().init();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" && e.key !== " ") return;
      if (isTypingTarget(e) || hasModifier(e)) return;
      const g = useGame.getState();
      if (!g.session.active) {
        e.preventDefault();
        g.newSession();
      } else if (g.table.phase === "hand-over") {
        e.preventDefault();
        g.deal();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="relative flex-1 overflow-hidden p-4">
          <PokerTable />
          <ResultOverlay />
          <EVCoachPanel />

          {!sessionActive && (
            <div className="absolute inset-0 z-40 grid place-items-center bg-ink-900/70 backdrop-blur-sm">
              <div className="glass w-[420px] rounded-2xl p-7 text-center">
                <h2 className="font-display text-2xl font-extrabold text-[var(--text)]">Ready to play?</h2>
                <p className="mx-auto mt-2 max-w-[320px] text-sm leading-relaxed text-muted">
                  A session deals hand after hand against a fixed table of bots. Your stack carries over,
                  so wins and losses stick until you end the session.
                </p>
                <div className="mt-4 flex items-center justify-center gap-4">
                  <div className="flex items-center gap-2 text-[0.76rem] text-muted">
                    <span>Table</span>
                    <div className="flex rounded-lg bg-ink-700 p-0.5">
                      {([2, 6, 9] as const).map((n) => (
                        <button
                          key={n}
                          onClick={() => setTableOpts((o) => ({ ...o, seats: n }))}
                          className={cx(
                            "rounded-md px-2.5 py-1 text-[0.74rem] font-semibold transition",
                            tableOpts.seats === n ? "bg-gold text-ink-900" : "text-muted hover:text-[var(--text)]",
                          )}
                        >
                          {n === 2 ? "Heads-up" : `${n}-max`}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[0.76rem] text-muted">
                    <span>Antes</span>
                    <div className="flex rounded-lg bg-ink-700 p-0.5">
                      {([0, 5] as const).map((a) => (
                        <button
                          key={a}
                          onClick={() => setTableOpts((o) => ({ ...o, ante: a }))}
                          className={cx(
                            "rounded-md px-2.5 py-1 text-[0.74rem] font-semibold transition",
                            tableOpts.ante === a ? "bg-gold text-ink-900" : "text-muted hover:text-[var(--text)]",
                          )}
                        >
                          {a === 0 ? "None" : "0.25 bb"}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                {tableOpts.seats !== 6 && (
                  <p className="mx-auto mt-2 max-w-[340px] text-[0.7rem] leading-relaxed text-faint">
                    Coach charts assume 6-max — verdicts at other table sizes use the nearest position
                    as an approximation.
                  </p>
                )}
                <Button size="lg" className="mt-4 px-8" onClick={() => newSession(tableOpts)}>
                  <Icon name="play" size={16} /> Start session
                </Button>
              </div>
            </div>
          )}
        </div>
        <SideRail />
      </div>
      <ActionBar />

      <GuessModal />
      <RangeViewModal />
      <SessionSummaryModal />
    </div>
  );
}
