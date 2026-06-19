# All-In · Poker Dojo

A clean, offline-first Texas Hold'em **trainer** for desktop and web. Learn from the rules up to
solid, EV-aware play by actually doing the math with you — a sandbox vs. bots, chess-style GTO drills,
an interactive course, an inline Expected-Value coach, and leak tracking.

**▶ Play online:** https://gapp.in/poker  ·  **⤓ Download desktop:**
https://github.com/ganeshapp/poker/releases/latest

Built by [Gapp](https://www.gapp.in).

---

## Features

- **Play (sandbox).** Sessions against four bot archetypes (TAG / LAG / Nit / Calling Station) with
  blinds, position, side pots and all-in run-outs. Step through the action manually or auto-play,
  read the VPIP/PFR HUD, and guess/peek any player's range on a 13×13 matrix.
- **Inline EV Coach.** On each decision the engine runs a Monte-Carlo equity sim vs. the villain's
  perceived range — or, multiway, vs. the whole field. Clear −EV calls pause the hand; every note
  shows the step-by-step math, lets you view the assumed range, and stays reopenable.
- **GTO Drills.** Chess-puzzle practice: a dealt spot with a move-navigator to replay the hand to the
  decision point, then fold/call/raise for instant feedback and a self-adjusting rating. Pre-flop is
  graded by position charts (GTO-derived); post-flop by pot-odds/equity heuristics.
- **Study.** A 5-level, 25-lesson course (rules → position → ranges → outs/equity → pot-odds/EV →
  hand-reading → bet-sizing → implied odds → SPR → multiway) with interactive range, pot-odds, bluff
  and multiway-equity calculators, a cheat sheet, a hover glossary, and optional quizzes.
- **Stats & export.** bb/100 trend, range-read accuracy, results vs. each archetype, a coaching review
  of your leaks, and one-click export of a session as a PokerStars-style hand history (.txt).

## Two ways to run it

| | Web (GitHub Pages) | Desktop (Tauri) |
|---|---|---|
| Poker math | TypeScript engine | Rust (`poker-core`) via Tauri commands |
| Storage | browser `localStorage` | local SQLite (Tauri SQL plugin) |
| Install | none — open the URL | native installer (.dmg / .msi / .AppImage / .deb) |

The same UI auto-detects its environment and picks the right backend; the TypeScript engine is verified
against the Rust one, so behaviour matches.

## Quick start (development)

Prerequisites: **Node 18+**, and for the desktop build the **Rust toolchain + Tauri v2 system
dependencies** (https://v2.tauri.app/start/prerequisites/).

```bash
npm install

npm run dev        # web app in the browser (Vite dev server)
npm run desktop    # native desktop app (tauri dev)
```

## Building

```bash
npm run build          # web → ./dist (static, host anywhere)
npm run desktop:build  # desktop installers for your current OS → src-tauri/target/release/bundle
```

## Deploying

**Web → GitHub Pages.** A workflow at `.github/workflows/pages.yml` builds the site and publishes it on
every push to `main`. Enable it once: repo **Settings → Pages → Build and deployment → Source: GitHub
Actions**. The site is served at `https://ganeshapp.github.io/poker/` (or `https://gapp.in/poker` if
`gapp.in` is configured as your GitHub user-site domain). The Vite `base` is relative (`./`), so it
works under any sub-path.

**Desktop installers → GitHub Releases.** A workflow at `.github/workflows/release.yml` builds signed-
ready installers for macOS, Windows and Linux on GitHub's runners and attaches them to a Release.
Trigger it by pushing a version tag:

```bash
git tag v1.0.0
git push origin v1.0.0
```

The installers then appear at `https://github.com/ganeshapp/poker/releases/latest`.

## Project structure

```
src/
  engine/        Poker math (TS): cards, evaluator, equity (+ multiway), notation, ranges, puzzles, engineClient
  game/          Hand state machine, bots, hand-history export
  store/         Zustand stores: game, drills, stats, study
  db/            Persistence (SQLite via Tauri, localStorage fallback)
  components/    table, range matrix, coach, drills, study widgets, stats charts, shared UI
  views/         PlayView, DrillsView, StudyView, StatsView, AboutView
poker-core/      Rust crate: hand evaluator + Monte-Carlo equity (the heavy math)
src-tauri/       Tauri v2 app: commands, SQL + opener plugins, window, icons
scripts/         Node test harnesses
.github/workflows/  Pages deploy + desktop release
```

## Testing

```bash
# Engine / game logic (no install needed — Node strips the TS types):
node --experimental-transform-types scripts/engine_test.ts     # evaluator, equity, notation
node --experimental-transform-types scripts/sim_test.ts        # 600 full hands, chip-conservation invariants
node --experimental-transform-types scripts/multiway_test.ts   # multiway equity decay
node --experimental-transform-types scripts/hh_test.ts         # hand-history formatter
node --experimental-transform-types scripts/leaks_test.ts      # leak detection
node --experimental-transform-types scripts/puzzles_test.ts    # drill generation + grading

# Rust engine:
cargo test --manifest-path poker-core/Cargo.toml
```

## Tech stack

Tauri v2 + Rust · React 18 + TypeScript + Vite · Zustand · Tailwind CSS · Radix UI · SQLite.

## Notes & honesty

- Pre-flop ranges and drills are chart/GTO-derived. Post-flop coaching uses pot-odds + Monte-Carlo
  equity heuristics — solid fundamentals, not a solver.
- It's a play-money trainer. Variance is real, so judge yourself on decision quality (the coach), not
  short-term results.

## Credits

Designed and built by **Gapp** — https://www.gapp.in. © Gapp.
