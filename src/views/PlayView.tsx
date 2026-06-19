import { useEffect } from "react";
import { useGame } from "@/store/gameStore";
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

export function PlayView() {
  const sessionActive = useGame((s) => s.session.active);
  const newSession = useGame((s) => s.newSession);

  useEffect(() => {
    void useStats.getState().init();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
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
                <Button size="lg" className="mt-5 px-8" onClick={newSession}>
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
