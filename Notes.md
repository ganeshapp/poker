# Product Requirements Document: "PokerDojo" (Desktop Poker Training App)

## 1. Product Overview

**Name:** All-In (Working Title)
**Platform:** Desktop Offline Application (macOS/Ubuntu)
**Core Value Proposition:** A gamified, offline-first Texas Hold'em training application that takes a user from beginner to advanced via a simulated "Sandbox" playing environment, interactive range guessing, and an Expected Value (EV) inline coach.

## 2. Tech Stack Architecture

The application will utilize a two-process architecture to separate heavy mathematical computation from UI rendering.

* **Desktop Framework:** Tauri (v2)
* **Backend / Main Process:** Rust (Handles file I/O, SQLite connections, and heavy EV/equity calculations).
* **Frontend / Renderer Process:** React 18+ with TypeScript.
* **State Management:** Zustand (for fast, un-opinionated state updates during the game loop).
* **Styling:** Tailwind CSS + Radix UI (for accessible, unstyled primitives like modals and sliders).
* **Database:** Local SQLite (using Tauri's `sql` plugin).
* **Poker Math Library:** Custom Rust implementation or established Rust poker crate (e.g., `rs-poker`) for evaluating hand strengths and running Monte Carlo equity simulations.

---

## 3. Core Modules & Features

### Module A: The Theoretical Curriculum (The "Study" Tab)

A structured, linear progression system. The UI should look like a modern LMS (Learning Management System) path.

* **Level 1 (Basics):** Text/interactive modules on Rules, Hand Rankings, Positional Awareness, and Bankroll Management.
* **Level 2 (Preflop):** Introduction to the 13x13 Range Matrix. Visual guides on opening ranges by position.
* **Level 3 (Postflop):** Board textures (Wet/Dry), C-betting logic, Pot Odds calculators.
* **Level 4 (Advanced):** Combinatorics, Blockers, and Exploitative adjustments vs. specific bot archetypes.

### Module B: The Sandbox Game Loop (The "Play" Tab)

The core feature of the app. A fully functional 6-max or 9-max poker table interface playing against AI bots.

* **Bot Spawner:** The engine dynamically assigns one of 4 archetypes to each seat based on VPIP (Voluntarily Put in Pot) and PFR (Preflop Raise) parameters:
* *TAG (Tight Aggressive):* Low VPIP, High PFR.
* *LAG (Loose Aggressive):* High VPIP, High PFR.
* *Nit:* Very Low VPIP, Low PFR.
* *Calling Station:* High VPIP, Very Low PFR.


* **Dynamic HUD (Heads Up Display):** Displays the bot's VPIP/PFR stats overlaying their avatar so the user learns to read HUD stats while playing.

### Module C: The "Peek & Guess" Mechanic

An interruptible event during the game loop to test hand reading.

1. **Trigger:** User clicks "Guess Range" during any street (Preflop, Flop, Turn, River) before making their action.
2. **Input:** A 13x13 matrix modal opens. The user paints the matrix with the hands they believe the specific bot holds based on the action so far.
3. **Validation:** User clicks "Peek". The app reveals the bot's actual programmed range matrix *and* their exact two hole cards.
4. **Scoring:** An algorithm calculates the overlap percentage between the user's painted range and the bot's actual range, awarding an "Accuracy Score."

### Module D: The Inline EV Coach

An active background process that critiques the user's decisions.

* **The Math:** When the user makes an action (e.g., Calls a bet), the Rust backend runs a quick Monte Carlo simulation comparing the user's exact hand equity against the bot's perceived range on the current board.
* **The Trigger:** If the user takes an action that has a negative Expected Value (-EV) compared to folding, the game pauses.
* **The UI:** A slide-out panel appears explaining the math: *"Mistake. Against a TAG profile raising from Early Position, your $A\heartsuit J\clubsuit$ only has 28% equity. Calling here costs you $1.50 in EV."*

---

## 4. Database Schema (SQLite)

The local database needs to track user progression, bot profiles, and session statistics.

**Table: `user_stats**`

* `id` (PK)
* `hands_played` (Int)
* `overall_ev_bb` (Float - tracking how many big blinds they are winning/losing in EV)
* `range_guess_accuracy` (Float - average percentage)

**Table: `bot_archetypes**`

* `id` (PK)
* `name` (String: "TAG", "Nit", etc.)
* `vpip_min` / `vpip_max` (Int)
* `pfr_min` / `pfr_max` (Int)
* `cbet_flop_pct` (Int)

**Table: `hand_history**`

* `id` (PK)
* `timestamp` (Date)
* `user_hole_cards` (String: "AhJc")
* `board_cards` (String)
* `user_action` (String)
* `ev_diff` (Float - difference between chosen action and optimal action)

---

## 5. Development Phases for AI Agent

**Agent Instructions: Execute this project in the following strict phases.**

* **Phase 1: Foundation.** Initialize Tauri with React/TypeScript. Set up the Rust `sql` plugin and create the SQLite database schema on launch.
* **Phase 2: UI Primitives.** Build the 13x13 Range Matrix component in React. It must support click-and-drag "painting" to select hands, and accept an array of hand combos to render state.
* **Phase 3: Poker Logic Engine (Rust).** Implement or import a hand evaluator in Rust. Create functions to deal cards, evaluate winning hands, and run basic equity calculations between two hands.
* **Phase 4: The Game State Machine.** Build the Zustand store to manage the table state (pot size, active player, street, board cards). Ensure the UI accurately reflects changes in this state.
* **Phase 5: Bot Logic.** Implement the bot decision trees based on the SQLite archetypes. Bots need to look at their hole cards, compare them to a basic preflop chart based on their archetype, and output an action to the Zustand store.
* **Phase 6: The Guess & Peek Flow.** Wire the Range Matrix component into the game loop. Pause the Zustand state when "Guess" is clicked.
* **Phase 7: The EV Coach.** Connect the Rust equity calculator to user actions. If a user action results in -EV, trigger the UI modal with the mathematical explanation.