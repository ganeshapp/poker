import { useState } from "react";
import { Logo } from "@/components/Logo";
import { Icon, type IconName } from "@/components/ui/Icon";
import { PlayView } from "@/views/PlayView";
import { DrillsView } from "@/views/DrillsView";
import { StudyView } from "@/views/StudyView";
import { StatsView } from "@/views/StatsView";
import { AboutView } from "@/views/AboutView";
import { useTheme } from "@/store/themeStore";
import { cx } from "@/lib/cx";

type Tab = "play" | "drills" | "study" | "stats" | "about";

const NAV: { id: Tab; label: string; icon: IconName }[] = [
  { id: "play", label: "Play", icon: "play" },
  { id: "drills", label: "Drills", icon: "target" },
  { id: "study", label: "Study", icon: "book" },
  { id: "stats", label: "Stats", icon: "stats" },
  { id: "about", label: "About", icon: "info" },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("play");
  const theme = useTheme((s) => s.theme);
  const toggleTheme = useTheme((s) => s.toggle);

  return (
    <div className="app-backdrop flex h-screen w-screen overflow-hidden">
      <nav className="flex w-[212px] shrink-0 flex-col border-r border-[var(--line)] bg-ink-900/70 p-4">
        <div className="px-1 pb-6">
          <Logo size={40} withWordmark />
        </div>

        <div className="space-y-1">
          {NAV.map((n) => (
            <button
              key={n.id}
              onClick={() => setTab(n.id)}
              className={cx(
                "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition",
                tab === n.id ? "bg-gold/15 text-[var(--text)]" : "text-muted hover:bg-white/5 hover:text-[var(--text)]",
              )}
            >
              <Icon name={n.icon} size={18} className={tab === n.id ? "text-gold" : undefined} />
              {n.label}
            </button>
          ))}
        </div>

        <div className="mt-auto space-y-3">
          <button
            onClick={toggleTheme}
            className="flex w-full items-center justify-between rounded-xl border border-[var(--line)] bg-ink-800/70 px-3 py-2 text-sm font-semibold text-muted transition hover:text-[var(--text)]"
          >
            <span className="flex items-center gap-2">
              <Icon name={theme === "dark" ? "moon" : "sun"} size={16} />
              {theme === "dark" ? "Dark" : "Light"} mode
            </span>
            <span className="text-[0.66rem] text-faint">switch</span>
          </button>
          <div className="rounded-xl border border-gold/20 bg-gold/[0.06] p-3 text-[0.72rem] leading-relaxed text-muted">
            <div className="mb-0.5 flex items-center gap-1.5 font-semibold text-gold-light">
              <Icon name="bolt" size={13} /> Tip
            </div>
            Use <span className="text-[var(--text)]">Guess Range</span> before you act, then let the EV
            Coach grade the decision.
          </div>
          <div className="px-1 text-[0.62rem] text-faint">All-In · offline poker dojo</div>
        </div>
      </nav>

      <main className="min-w-0 flex-1 overflow-hidden">
        {tab === "play" && <PlayView />}
        {tab === "drills" && <DrillsView />}
        {tab === "study" && <StudyView />}
        {tab === "stats" && <StatsView />}
        {tab === "about" && <AboutView />}
      </main>
    </div>
  );
}
