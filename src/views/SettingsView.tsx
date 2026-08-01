import { useSettings, type CoachStrictness, type SimQuality } from "@/store/settingsStore";
import { useTheme } from "@/store/themeStore";
import { Card } from "@/components/ui/controls";
import { Icon } from "@/components/ui/Icon";
import { PlayingCard } from "@/components/table/PlayingCard";
import { cx } from "@/lib/cx";

function Row({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-[var(--line)] py-3 last:border-b-0">
      <div>
        <div className="text-sm font-semibold text-[var(--text)]">{title}</div>
        <div className="mt-0.5 max-w-[420px] text-[0.78rem] leading-relaxed text-muted">{desc}</div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cx(
        "relative h-6 w-11 rounded-full transition",
        on ? "bg-gold" : "bg-ink-600",
      )}
    >
      <span
        className={cx(
          "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all",
          on ? "left-[22px]" : "left-0.5",
        )}
      />
    </button>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { v: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-lg bg-ink-700 p-0.5">
      {options.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={cx(
            "rounded-md px-2.5 py-1 text-[0.74rem] font-semibold transition",
            value === o.v ? "bg-gold text-ink-900" : "text-muted hover:text-[var(--text)]",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SettingsView() {
  const s = useSettings();
  const theme = useTheme((t) => t.theme);
  const toggleTheme = useTheme((t) => t.toggle);

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-[720px] px-8 py-7">
        <h1 className="font-display text-3xl font-extrabold text-[var(--text)]">Settings</h1>
        <p className="mb-6 mt-1 text-sm text-muted">Everything is saved on this device.</p>

        <Card>
          <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-gold">
            <Icon name="eye" size={15} /> Table & cards
          </div>
          <Row
            title="Four-color deck"
            desc="♠ black · ♥ red · ♦ blue · ♣ green. Makes suits unmistakable at a glance — recommended, and essential if you have trouble telling red suits apart."
          >
            <div className="flex items-center gap-3">
              <div className="flex gap-1">
                {["As", "Ah", "Ad", "Ac"].map((c) => (
                  <PlayingCard key={c} card={c} w={26} />
                ))}
              </div>
              <Toggle on={s.fourColorDeck} onChange={(v) => s.update({ fourColorDeck: v })} label="Four-color deck" />
            </div>
          </Row>
          <Row
            title="Realistic reveals"
            desc="By default the app shows everyone's cards when a hand ends — folded hands included — because seeing what people folded builds intuition. Turn this on to hide folded hands, like a real table."
          >
            <Toggle on={s.realisticReveal} onChange={(v) => s.update({ realisticReveal: v })} label="Realistic reveals" />
          </Row>
          <Row title="Theme" desc="Light or dark — also switchable from the sidebar.">
            <Segmented
              value={theme}
              options={[
                { v: "dark", label: "Dark" },
                { v: "light", label: "Light" },
              ]}
              onChange={() => toggleTheme()}
            />
          </Row>
          <Row title="Reduce motion" desc="Disables animations and transitions. Also honors your system's reduced-motion preference automatically.">
            <Toggle on={s.reducedMotion} onChange={(v) => s.update({ reducedMotion: v })} label="Reduce motion" />
          </Row>
        </Card>

        <Card className="mt-4">
          <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-gold">
            <Icon name="coach" size={15} /> Coach
          </div>
          <Row
            title="Strictness"
            desc="How eagerly the coach interrupts. Relaxed only flags clear blunders; strict calls out smaller EV losses too."
          >
            <Segmented<CoachStrictness>
              value={s.coachStrictness}
              options={[
                { v: "relaxed", label: "Relaxed" },
                { v: "standard", label: "Standard" },
                { v: "strict", label: "Strict" },
              ]}
              onChange={(v) => s.update({ coachStrictness: v })}
            />
          </Row>
          <Row
            title="Simulation quality"
            desc="High runs 2.5× more Monte-Carlo trials per verdict — slightly slower, tighter error bars. Late streets are always computed exactly either way."
          >
            <Segmented<SimQuality>
              value={s.simQuality}
              options={[
                { v: "standard", label: "Standard" },
                { v: "high", label: "High" },
              ]}
              onChange={(v) => s.update({ simQuality: v })}
            />
          </Row>
        </Card>

        <Card className="mt-4">
          <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-gold">
            <Icon name="bolt" size={15} /> Keyboard
          </div>
          <Row title="Shortcuts" desc="Play and drill without touching the mouse. F fold · C check/call · R raise · 1/2/3 drill answers · Enter next.">
            <button
              onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "?", bubbles: true }))}
              className="rounded-lg border border-[var(--line)] bg-ink-700 px-3 py-1.5 text-[0.78rem] font-semibold text-[var(--text)] transition hover:bg-ink-600"
            >
              View all shortcuts
            </button>
          </Row>
        </Card>
      </div>
    </div>
  );
}
