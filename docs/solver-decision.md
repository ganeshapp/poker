# Postflop solver spike — findings & decision

*Spike for issue #30, run 2026-08-02 on an Apple-silicon dev machine
against [`b-inary/postflop-solver`](https://github.com/b-inary/postflop-solver)
(Discounted CFR, no card abstraction, rayon multithreaded).*

## Setup

Scratch crate with a git dependency. One compatibility fix required —
the crate is **unmaintained since Oct 2023** and its default `bincode`
feature no longer compiles against bincode 2.0 final:

```toml
postflop-solver = { git = "https://github.com/b-inary/postflop-solver", default-features = false, features = ["rayon"] }
```

Ranges used were approximations of this app's own 100bb charts
(BTN open ~45% in position vs BB defend ~43% out of position) on the
wet board **T♦9♦6♥** — a worst-case realistic input, since wide ranges
maximize tree size.

## Measurements

| Configuration | Tree build | Memory (f32 / i16) | Solve to ~0.5% pot |
|---|---|---|---|
| **Flop → river**, 3 bet sizes (33/75/all-in, 2.7x raises), ~97bb | 188 ms | **22.4 GB / 11.4 GB** | not attempted (allocation alone disqualifies) |
| **Turn → river** (Q♣ turn), 2 sizes (66/all-in), pot 12bb | 6 ms | **27 MB / 14 MB** | **2.14 s** (0.47% of pot, ~160% CPU) |

River-only subtrees are smaller and faster still (sub-second).

## Decision

1. **No bundled full-flop solve library.** Wide-range flop trees cost
   gigabytes *each*; a meaningful flop subset would be a multi-GB
   download or require heavy abstraction that forfeits the "real
   solver" claim. This kills the "ship precomputed flop solves" branch
   of #30.
2. **Productize on-demand turn/river subtree solving instead.** At
   14 MB / ~2 s per spot on desktop, a native "check this with a
   solver" action is genuinely viable for exactly the surfaces that
   matter most:
   - a **"Solver check"** button on turn/river coach verdicts and
     drill feedback (runs locally, labeled with exploitability), and
   - solver-graded **river/turn drill packs** generated at runtime.
   Inputs come free: the app already models both players' ranges
   (charts + street-by-street narrowing).
3. **Desktop-first.** The web build would need the WASM single-thread
   build (upstream `wasm-postflop` proves it works, slower); ship the
   Tauri command first and treat WASM as a follow-up.
4. **Fork and pin the crate.** Unmaintained upstream + a known
   build break means we should vendor a fork (with the bincode fix)
   under `ganeshapp/` before depending on it from `poker-core`.

## Productization outline (next issue)

- Fork + pin `postflop-solver`; add as an optional `poker-core`
  dependency behind a `solver` feature.
- Tauri command `solve_subtree(ranges, board, pot, stacks, sizes)` →
  strategy + EVs for the hero hand class, with a hard memory guard
  (reject flop-state inputs; turn/river only).
- UI: "Solver check (~2s)" on turn/river coach notes and drill
  feedback; result shown in the expert layer with exploitability and
  an honest "single subtree, fixed sizes" caveat.
