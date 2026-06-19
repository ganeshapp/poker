import * as RSwitch from "@radix-ui/react-switch";
import { useGame } from "@/store/gameStore";
import { useStats } from "@/store/statsStore";
import { cx } from "@/lib/cx";
import { fmtSigned } from "@/lib/format";
import { Icon } from "@/components/ui/Icon";
import { Tooltip } from "@/components/ui/Tooltip";

const SPEEDS = [
  { label: "Slow", ms: 1100 },
  { label: "Normal", ms: 700 },
  { label: "Fast", ms: 360 },
];

export function SideRail() {
  const log = useGame((s) => s.table.log);
  const settings = useGame((s) => s.settings);
  const setSettings = useGame((s) => s.setSettings);
  const session = useGame((s) => s.session);
  const endSession = useGame((s) => s.endSession);
  const bb = useGame((s) => s.table.bigBlind);
  const guesses = useStats((s) => s.guesses);

  const sessionBb = session.netChips / bb;
  const bb100 = session.hands > 0 ? (sessionBb / session.hands) * 100 : 0;
  const avgAcc = guesses.length > 0 ? guesses.reduce((a, b) => a + b.accuracy, 0) / guesses.length : null;
  const reversed = [...log].reverse();

  return (
    <aside className="flex w-[300px] shrink-0 flex-col gap-4 border-l border-[var(--line)] bg-ink-850/60 p-4">
      {/* Session */}
      <div className="rounded-xl border border-[var(--line)] bg-ink-800/70 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-semibold text-[var(--text)]">This session</span>
          {session.active && (
            <button
              onClick={endSession}
              className="rounded-md px-2 py-0.5 text-[0.7rem] font-semibold text-muted transition hover:bg-white/5 hover:text-bad"
            >
              End
            </button>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Hands" value={String(session.hands)} />
          <Stat label="Net" value={`${fmtSigned(sessionBb)}`} sub="bb" tone={sessionBb >= 0 ? "good" : "bad"} />
          <Tooltip
            content={
              <div className="space-y-1">
                <div className="font-semibold text-gold-light">bb / 100</div>
                Big blinds won per 100 hands — the standard poker win-rate, independent of stake. +5 is
                strong; pros live roughly between −5 and +10. Small samples swing wildly.
              </div>
            }
          >
            <div>
              <Stat label="bb/100" value={fmtSigned(bb100)} tone={bb100 >= 0 ? "good" : "bad"} hint />
            </div>
          </Tooltip>
        </div>
        <div className="mt-2">
          <Stat label="Read accuracy" value={avgAcc === null ? "—" : `${Math.round(avgAcc * 100)}%`} wide />
        </div>
      </div>

      {/* Settings */}
      <div className="rounded-xl border border-[var(--line)] bg-ink-800/70 p-3">
        <div className="text-[0.7rem] font-semibold uppercase tracking-wide text-muted">Pace</div>
        <div className="mt-1 flex gap-1">
          {(["manual", "auto"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setSettings({ mode: m })}
              className={cx(
                "flex-1 rounded-md px-2 py-1 text-[0.74rem] font-semibold capitalize transition",
                settings.mode === m ? "bg-gold text-ink-900" : "bg-ink-600 text-muted hover:text-[var(--text)]",
              )}
            >
              {m}
            </button>
          ))}
        </div>
        <p className="mt-1 text-[0.68rem] text-faint">
          {settings.mode === "manual"
            ? "Step through each player's action yourself (→ key, or Next action)."
            : "Bots act automatically at the chosen speed."}
        </p>

        {settings.mode === "auto" && (
          <div className="mt-2 flex gap-1">
            {SPEEDS.map((sp) => (
              <button
                key={sp.label}
                onClick={() => setSettings({ speedMs: sp.ms })}
                className={cx(
                  "flex-1 rounded-md px-2 py-1 text-[0.72rem] font-semibold transition",
                  settings.speedMs === sp.ms ? "bg-ink-500 text-[var(--text)]" : "bg-ink-600 text-muted hover:text-[var(--text)]",
                )}
              >
                {sp.label}
              </button>
            ))}
          </div>
        )}

        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
            <Icon name="coach" size={16} className="text-gold" /> EV Coach
          </div>
          <RSwitch.Root
            checked={settings.coachEnabled}
            onCheckedChange={(v) => setSettings({ coachEnabled: v })}
            className={cx("relative h-5 w-9 rounded-full transition", settings.coachEnabled ? "bg-gold" : "bg-ink-500")}
          >
            <RSwitch.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-white transition data-[state=checked]:translate-x-[18px]" />
          </RSwitch.Root>
        </div>
      </div>

      {/* Hand log */}
      <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-[var(--line)] bg-ink-800/70 p-3">
        <div className="mb-2 text-[0.7rem] font-semibold uppercase tracking-wide text-muted">Hand log</div>
        <div className="flex-1 space-y-1 overflow-auto pr-1 text-[0.76rem] leading-snug">
          {reversed.length === 0 && <div className="text-faint">Actions will appear here.</div>}
          {reversed.map((e) => (
            <div
              key={e.id}
              className={cx(
                e.kind === "result" && "font-semibold text-gold-light",
                e.kind === "deal" && "text-info/80",
                e.kind === "action" && "text-muted",
                e.kind === "info" && "text-faint",
              )}
            >
              {e.text}
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
  wide,
  hint,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "bad";
  wide?: boolean;
  hint?: boolean;
}) {
  return (
    <div className={cx("rounded-lg border border-[var(--line)] bg-ink-850 px-2 py-1.5", wide && "w-full")}>
      <div className="flex items-center gap-1 text-[0.58rem] uppercase tracking-wide text-faint">
        {label}
        {hint && <Icon name="info" size={10} className="text-faint" />}
      </div>
      <div
        className="mono text-sm font-bold"
        style={{ color: tone === "good" ? "var(--good)" : tone === "bad" ? "var(--bad)" : "var(--text)" }}
      >
        {value}
        {sub && <span className="ml-0.5 text-[0.6rem] font-normal text-faint">{sub}</span>}
      </div>
    </div>
  );
}
