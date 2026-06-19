import { useState } from "react";
import { useGame } from "@/store/gameStore";
import { formatSession, type HHHand } from "@/game/handHistory";
import { HandReplayModal } from "./HandReplayModal";
import { saveText, copyText } from "@/lib/exportFile";
import { fmtSigned } from "@/lib/format";
import { Modal } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/controls";
import { Icon } from "@/components/ui/Icon";

export function SessionSummaryModal() {
  const sessionEnded = useGame((s) => s.sessionEnded);
  const session = useGame((s) => s.session);
  const bb = useGame((s) => s.table.bigBlind);
  const heroBusted = useGame((s) => s.table.players[0].stack <= 0);
  const newSession = useGame((s) => s.newSession);
  const closeSummary = useGame((s) => s.closeSummary);
  const [msg, setMsg] = useState<string | null>(null);
  const [replay, setReplay] = useState<HHHand | null>(null);

  if (!sessionEnded) return null;

  const hands = session.history.length;
  const netBb = session.netChips / bb;
  const bb100 = hands > 0 ? (netBb / hands) * 100 : 0;
  const nets = session.history.map((h) => h.heroNet / bb);
  const best = nets.length ? Math.max(...nets) : 0;
  const worst = nets.length ? Math.min(...nets) : 0;
  const showdowns = session.history.filter((h) => h.board.length === 5).length;

  const onExport = async () => {
    const text = formatSession(session.history);
    const name = `all-in-session-${new Date(session.startedAt || Date.now()).toISOString().slice(0, 19).replace(/[:T]/g, "-")}.txt`;
    const res = await saveText(name, text);
    setMsg(res.message);
  };

  const onCopy = async () => {
    const ok = await copyText(formatSession(session.history));
    setMsg(ok ? "Hand history copied to clipboard." : "Copy failed.");
  };

  return (
    <>
      <Modal
      open={sessionEnded}
      onOpenChange={(o) => !o && closeSummary()}
      maxWidth={520}
      hideClose={heroBusted}
      title={heroBusted ? "Session over — you busted" : "Session summary"}
      description={`${hands} hand${hands === 1 ? "" : "s"} played this session.`}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Net" value={`${fmtSigned(netBb)} bb`} tone={netBb >= 0 ? "good" : "bad"} />
          <Stat label="bb / 100" value={fmtSigned(bb100)} tone={bb100 >= 0 ? "good" : "bad"} />
          <Stat label="Biggest win" value={`${fmtSigned(best)} bb`} tone="good" />
          <Stat label="Biggest loss" value={`${fmtSigned(worst)} bb`} tone="bad" />
        </div>
        <div className="text-[0.78rem] text-muted">
          {showdowns} hand{showdowns === 1 ? "" : "s"} reached showdown. Replay any hand below, or export
          the full history for a poker tracker.
        </div>

        {session.history.length > 0 && (
          <div className="rounded-xl border border-[var(--line)] bg-ink-850 p-2">
            <div className="mb-1 px-1 text-[0.66rem] font-semibold uppercase tracking-wide text-faint">
              Review hands
            </div>
            <div className="max-h-[170px] space-y-1 overflow-auto pr-1">
              {[...session.history].reverse().map((h) => (
                <div
                  key={h.id}
                  className="flex items-center justify-between rounded-lg px-2 py-1.5 text-[0.8rem] hover:bg-white/5"
                >
                  <span className="text-[var(--text)]">Hand #{h.id}</span>
                  <span
                    className="mono"
                    style={{ color: h.heroNet >= 0 ? "var(--good)" : "var(--bad)" }}
                  >
                    {fmtSigned(h.heroNet / bb)} bb
                  </span>
                  <button
                    onClick={() => setReplay(h)}
                    className="flex items-center gap-1 text-[0.74rem] font-semibold text-gold hover:text-gold-light"
                  >
                    <Icon name="play" size={12} /> Replay
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {msg && (
          <div className="rounded-lg border border-good/30 bg-good/10 px-3 py-2 text-[0.78rem] text-good">{msg}</div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="ghost" onClick={onCopy} disabled={hands === 0}>
            <Icon name="cards" size={15} /> Copy
          </Button>
          <Button variant="secondary" onClick={onExport} disabled={hands === 0}>
            <Icon name="arrow-right" size={15} /> Export hands (.txt)
          </Button>
          <Button onClick={newSession}>
            <Icon name="refresh" size={15} /> New session
          </Button>
        </div>
      </div>
      </Modal>
      <HandReplayModal hand={replay} onClose={() => setReplay(null)} />
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-ink-850 px-3 py-2">
      <div className="text-[0.62rem] uppercase tracking-wide text-faint">{label}</div>
      <div
        className="mono text-lg font-bold"
        style={{ color: tone === "good" ? "var(--good)" : tone === "bad" ? "var(--bad)" : "var(--text)" }}
      >
        {value}
      </div>
    </div>
  );
}
