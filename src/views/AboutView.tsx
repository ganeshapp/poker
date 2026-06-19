import { Logo } from "@/components/Logo";
import { Card } from "@/components/ui/controls";
import { Icon, type IconName } from "@/components/ui/Icon";
import { openExternal } from "@/lib/openExternal";

const SITE_URL = "https://gapp.in/poker";
const RELEASES_URL = "https://github.com/ganeshapp/poker/releases/latest";

const MODES: { icon: IconName; title: string; body: string }[] = [
  {
    icon: "play",
    title: "Play",
    body: "Start a session and play hand-after-hand against four bot archetypes. Step through the action manually or auto-play, click the eye on a player to guess/peek their range, and let the EV Coach grade your decisions with the math behind them.",
  },
  {
    icon: "target",
    title: "Drills",
    body: "Chess-puzzle-style practice. Replay a spot to the decision point, then choose fold/call/raise for instant feedback and a self-adjusting rating. Three modes: Mixed cash spots (pre-flop charts + post-flop pot-odds/equity), short-stack Push/Fold, and My Leaks — your own coach-flagged mistakes, re-served until you fix them.",
  },
  {
    icon: "book",
    title: "Study",
    body: "A 5-level course from rules and position to hand-reading, bet-sizing, implied odds, SPR and multiway play — with interactive range, pot-odds, bluff and multiway-equity calculators, a quick-reference cheat sheet, and optional quizzes. Hover any dotted term for a definition.",
  },
  {
    icon: "stats",
    title: "Stats",
    body: "Track your win-rate (bb/100), range-read accuracy and results vs each archetype, see a coaching review of your leaks, replay any hand step-by-step from the session summary, and export a session's hands as a PokerStars-style history.",
  },
];

export function AboutView() {
  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-[760px] px-8 py-8">
        {/* Hero */}
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-[var(--line)] bg-ink-850 p-7 text-center">
          <Logo size={64} />
          <h1 className="font-display text-3xl font-extrabold text-[var(--text)]">All-In · Poker Dojo</h1>
          <p className="max-w-[520px] text-sm leading-relaxed text-muted">
            A clean, offline-first Texas Hold'em trainer that takes you from the rules to solid,
            EV-aware play — by actually doing the math with you, not just showing answers.
          </p>
          <span className="rounded-full bg-white/5 px-3 py-1 text-[0.66rem] font-semibold uppercase tracking-wide text-faint">
            Version 1.0
          </span>
        </div>

        {/* Play online / download */}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <button
            onClick={() => void openExternal(SITE_URL)}
            className="group flex items-center gap-3 rounded-2xl border border-gold/30 bg-gold/[0.06] p-4 text-left transition hover:bg-gold/[0.12]"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gold/15 text-gold">
              <Icon name="play" size={18} />
            </span>
            <span>
              <span className="block font-display text-sm font-bold text-[var(--text)]">Play online</span>
              <span className="block text-[0.76rem] text-muted">
                No install — runs in your browser at gapp.in/poker
              </span>
            </span>
          </button>
          <button
            onClick={() => void openExternal(RELEASES_URL)}
            className="group flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-ink-800/70 p-4 text-left transition hover:bg-ink-700"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/5 text-[var(--text)]">
              <Icon name="chip" size={18} />
            </span>
            <span>
              <span className="block font-display text-sm font-bold text-[var(--text)]">Download desktop</span>
              <span className="block text-[0.76rem] text-muted">
                Latest installer for macOS, Windows &amp; Linux
              </span>
            </span>
          </button>
        </div>

        {/* How to use */}
        <h2 className="mb-3 mt-8 font-display text-xl font-bold text-[var(--text)]">How to use it</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {MODES.map((m) => (
            <Card key={m.title}>
              <div className="mb-1.5 flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-gold/15 text-gold">
                  <Icon name={m.icon} size={15} />
                </span>
                <span className="font-display text-base font-bold text-[var(--text)]">{m.title}</span>
              </div>
              <p className="text-[0.84rem] leading-relaxed text-muted">{m.body}</p>
            </Card>
          ))}
        </div>

        {/* Good to know */}
        <h2 className="mb-3 mt-8 font-display text-xl font-bold text-[var(--text)]">Good to know</h2>
        <Card>
          <ul className="space-y-2 text-[0.86rem] leading-relaxed text-muted">
            <li className="flex gap-2">
              <Icon name="check" size={15} className="mt-0.5 shrink-0 text-good" />
              Fully offline — your hands and progress stay on your machine (SQLite on desktop, browser
              storage on the web).
            </li>
            <li className="flex gap-2">
              <Icon name="info" size={15} className="mt-0.5 shrink-0 text-info" />
              Pre-flop ranges and drills are chart/GTO-derived. Post-flop coaching uses pot-odds and
              Monte-Carlo equity heuristics — strong fundamentals, but not a solver.
            </li>
            <li className="flex gap-2">
              <Icon name="info" size={15} className="mt-0.5 shrink-0 text-info" />
              It's a play-money trainer for learning. Variance is real: even good play swings, so judge
              yourself on decisions (the coach) more than short-term results.
            </li>
          </ul>
        </Card>

        {/* Roadmap */}
        <h2 className="mb-3 mt-8 font-display text-xl font-bold text-[var(--text)]">On the roadmap</h2>
        <Card>
          <p className="mb-2 text-[0.84rem] text-muted">
            Coming next (see the project README for the full, prioritised list):
          </p>
          <ul className="space-y-1.5 text-[0.84rem] text-muted">
            {[
              "Desktop auto-update — one-click new versions",
              "Configurable table — 6/9-max, antes",
              "Daily goals, streaks & achievements",
              "Install as an app (PWA) on the web",
            ].map((x) => (
              <li key={x} className="flex gap-2">
                <Icon name="arrow-right" size={14} className="mt-0.5 shrink-0 text-gold" />
                {x}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[0.74rem] text-faint">It's evolving — feedback and ideas are welcome.</p>
        </Card>

        {/* Credit */}
        <h2 className="mb-3 mt-8 font-display text-xl font-bold text-[var(--text)]">Built by</h2>
        <Card className="flex flex-col items-center gap-2 text-center">
          <div className="font-display text-2xl font-extrabold text-gold-light">Gapp</div>
          <a
            href="https://www.gapp.in"
            target="_blank"
            rel="noreferrer noopener"
            onClick={(e) => {
              e.preventDefault();
              void openExternal("https://www.gapp.in");
            }}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-gold transition hover:text-gold-light"
          >
            www.gapp.in <Icon name="arrow-right" size={14} />
          </a>
          <p className="mt-1 max-w-[460px] text-[0.8rem] leading-relaxed text-faint">
            Designed and built by Gapp. Made with Tauri + Rust and React + TypeScript. Thanks for
            playing — feedback is always welcome.
          </p>
        </Card>

        <div className="py-8 text-center text-[0.66rem] text-faint">All-In · Poker Dojo — © Gapp</div>
      </div>
    </div>
  );
}
