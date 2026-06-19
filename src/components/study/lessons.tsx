import type { ReactNode } from "react";
import type { HandLabel } from "@/types/poker";
import { Icon, type IconName } from "@/components/ui/Icon";
import { RangeMatrix, RangeLegend } from "@/components/range/RangeMatrix";
import { topPercentRange } from "@/engine/ranges";
import { ARCHETYPES } from "@/game/archetypes";
import { HandRankings } from "./HandRankings";
import { PotOddsCalculator } from "./PotOddsCalculator";
import { Quiz } from "./Quiz";
import { RangeExplorer } from "./RangeExplorer";
import { PotOddsDrill, OutsDrill, RangeBuildDrill } from "./Drills";
import { BluffCalculator } from "./BluffCalculator";
import { Term, GLOSSARY } from "./Term";
import { MultiwayEquityTrainer } from "./MultiwayEquityTrainer";
import { EquityCalculator } from "./EquityCalculator";

/* ---- prose helpers ---- */
const Lead = ({ children }: { children: ReactNode }) => (
  <p className="text-[1.02rem] leading-relaxed text-[var(--text)]">{children}</p>
);
const P = ({ children }: { children: ReactNode }) => (
  <p className="leading-relaxed text-muted">{children}</p>
);
const H = ({ children }: { children: ReactNode }) => (
  <h3 className="font-display text-lg font-bold text-[var(--text)]">{children}</h3>
);
const Callout = ({ children, title }: { children: ReactNode; title?: string }) => (
  <div className="rounded-xl border border-gold/25 bg-gold/[0.08] p-4">
    <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-gold-light">
      <Icon name="bolt" size={15} /> {title ?? "Key idea"}
    </div>
    <div className="text-[0.88rem] leading-relaxed text-muted">{children}</div>
  </div>
);
const Diagram = ({ range, title, note }: { range: Set<HandLabel>; title: string; note?: string }) => (
  <div className="flex flex-col items-center gap-2 rounded-xl border border-[var(--line)] bg-ink-850 p-4">
    <div className="text-sm font-semibold text-[var(--text)]">{title}</div>
    <RangeMatrix readOnly highlight={range} size={360} />
    <RangeLegend />
    {note && <p className="max-w-[440px] text-center text-[0.78rem] text-faint">{note}</p>}
  </div>
);

export interface Lesson {
  id: string;
  title: string;
  minutes: number;
  body: () => ReactNode;
}
export interface Level {
  id: string;
  title: string;
  icon: IconName;
  blurb: string;
  lessons: Lesson[];
}

export const LEVELS: Level[] = [
  {
    id: "basics",
    title: "Basics",
    icon: "book",
    blurb: "Rules, rankings, position and bankroll.",
    lessons: [
      {
        id: "hand-rankings",
        title: "Hand Rankings",
        minutes: 4,
        body: () => (
          <>
            <Lead>
              Every hand of Texas Hold'em is a race to make the best five-card hand from your two hole
              cards and the five community cards. Memorising the ranking order is non-negotiable.
            </Lead>
            <HandRankings />
            <Callout>
              When two players share the same category, the higher cards (kickers) decide it. Aces are
              high, except in the "wheel" straight 5-4-3-2-A where the ace plays low.
            </Callout>
            <Quiz
              questions={[
                {
                  q: "Which hand wins: a flush or a straight?",
                  options: ["Straight", "Flush", "They tie"],
                  answer: 1,
                  explain: "A flush (five of one suit) beats a straight (five in a row, mixed suits).",
                },
                {
                  q: "You hold A♦Q♣ on a board of A♠ K♦ 4♥ 9♣ 2♠. What's your hand?",
                  options: ["Two pair", "A pair of Aces, Queen kicker", "Ace high"],
                  answer: 1,
                  explain: "You pair your Ace; your second card (Q) is the kicker. No second pair is on board for you.",
                },
              ]}
            />
          </>
        ),
      },
      {
        id: "position",
        title: "Position & the Button",
        minutes: 5,
        body: () => (
          <>
            <Lead>
              Position is the single most undervalued edge for new players. Acting last means you make
              every decision with more information than your opponents.
            </Lead>
            <H>The six seats</H>
            <P>
              Each seat has a name and acts in a fixed order. The dealer <b>button</b> is the best seat
              because it acts last on every post-flop street. Moving clockwise from it, the{" "}
              <b>small blind</b> and <b>big blind</b> post forced bets, then play runs through the early
              and middle seats to the cutoff and back to the button. (Hover the dotted terms for a
              definition; the full glossary lives in Practice → Quick Reference.)
            </P>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {[
                { a: "UTG", n: "Under the Gun", k: "Earliest — acts first, play tightest" },
                { a: "MP", n: "Middle Position", k: "Early / middle" },
                { a: "CO", n: "Cutoff", k: "Late — open wider" },
                { a: "BTN", n: "Button (dealer)", k: "Latest — best seat, widest range" },
                { a: "SB", n: "Small Blind", k: "Forced bet, acts first post-flop" },
                { a: "BB", n: "Big Blind", k: "Forced bet, last to act pre-flop" },
              ].map((s) => (
                <div key={s.a} className="rounded-lg border border-[var(--line)] bg-ink-850 px-3 py-2">
                  <div className="flex items-baseline gap-2">
                    <span className="font-display text-sm font-bold text-[var(--text)]">
                      <Term id={s.a}>{s.a}</Term>
                    </span>
                    <span className="text-[0.78rem] text-gold-light">{s.n}</span>
                  </div>
                  <div className="text-[0.68rem] text-faint">{s.k}</div>
                </div>
              ))}
            </div>
            <Callout title="Rule of thumb">Play fewer hands up front, more hands on the button.</Callout>
          </>
        ),
      },
      {
        id: "bankroll",
        title: "Bankroll & Mindset",
        minutes: 4,
        body: () => (
          <>
            <Lead>
              Poker is a game of edges realised over thousands of hands. Variance means even perfect play
              loses regularly in the short run.
            </Lead>
            <P>
              Think in big blinds (bb), not chips — it makes decisions stake-independent. A solid winner
              earns only a few bb per 100 hands, so protect against tilt and never risk money you can't
              afford to lose. In this trainer your stack auto-resets, so focus on decision quality, not
              the scoreboard.
            </P>
            <H>Win-rate: bb/100</H>
            <P>
              Win-rate is measured in big blinds won per 100 hands ("bb/100"). It's stake-independent, so
              you can compare any games. A strong winner makes only a few bb/100; anything from −5 to +10
              is normal, and over small samples it swings wildly. The Stats page and the session rail both
              show your bb/100.
            </P>
            <Callout>Results are noise; decisions are signal. The EV Coach grades the decision.</Callout>
          </>
        ),
      },
    ],
  },
  {
    id: "preflop",
    title: "Pre-flop",
    icon: "cards",
    blurb: "The 13×13 matrix and opening ranges.",
    lessons: [
      {
        id: "matrix",
        title: "The 13×13 Matrix",
        minutes: 5,
        body: () => (
          <>
            <Lead>
              The 169 distinct starting hands fit neatly into a 13×13 grid — the language pros use to
              talk about ranges.
            </Lead>
            <P>
              Pairs run down the diagonal. Suited hands sit in the upper-right triangle (e.g. AKs), and
              offsuit hands in the lower-left (AKo). There are 1,326 actual two-card combos: 6 per pair,
              4 per suited hand, 12 per offsuit hand.
            </P>
            <Diagram
              range={topPercentRange(15)}
              title="A tight ~15% range"
              note="Highlighted = hands you'd play. Notice how strong pairs and big suited broadways dominate."
            />
          </>
        ),
      },
      {
        id: "opening-ranges",
        title: "Opening Ranges by Position",
        minutes: 6,
        body: () => (
          <>
            <Lead>How wide you open should grow as you get closer to the button.</Lead>
            <div className="grid gap-4 lg:grid-cols-2">
              <Diagram range={topPercentRange(14)} title="UTG open · ~14%" />
              <Diagram range={topPercentRange(45)} title="Button open · ~45%" />
            </div>
            <Callout>
              From UTG you're under the gun with five players still to act — only premium hands profit.
              On the button just two blinds remain, so you can attack with a huge range.
            </Callout>
          </>
        ),
      },
      {
        id: "three-betting",
        title: "3-Betting",
        minutes: 5,
        body: () => (
          <>
            <Lead>
              A 3-bet is a re-raise of an opener. Used well it builds pots with your best hands and steals
              dead money with the right bluffs.
            </Lead>
            <Diagram
              range={topPercentRange(8)}
              title="A linear value 3-bet range · ~8%"
              note="Against a wider opener, add suited bluffs (e.g. A5s, KTs) for balance."
            />
            <P>
              Against a tight opener (a Nit), 3-bet only your premiums — they fold everything else and
              call only when they crush you. Against a loose-aggressive opener, widen for value.
            </P>
          </>
        ),
      },
      {
        id: "hud-reading",
        title: "Reading the HUD: VPIP & PFR",
        minutes: 5,
        body: () => (
          <>
            <Lead>
              A <b>HUD</b> (Heads-Up Display) is the small stats overlay shown on each opponent. In
              All-In it displays two numbers like <span className="mono text-gold-light">22/18</span> —
              the two most important stats for reading a player.
            </Lead>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-[var(--line)] bg-ink-850 p-4">
                <H>VPIP</H>
                <P>
                  <span className="text-[var(--text)]">Voluntarily Put $ In Pot</span> — the % of hands a
                  player chooses to play (call or raise) pre-flop. Posting a blind doesn't count. High VPIP
                  = loose; low = tight.
                </P>
              </div>
              <div className="rounded-xl border border-[var(--line)] bg-ink-850 p-4">
                <H>PFR</H>
                <P>
                  <span className="text-[var(--text)]">Pre-Flop Raise</span> — the % of hands they raise
                  pre-flop. PFR is always ≤ VPIP. A big gap between them means a passive caller.
                </P>
              </div>
            </div>
            <P>
              The gap tells the story. VPIP ≈ PFR is an aggressive, raise-or-fold player. A wide gap (e.g.
              45/7) is a passive Calling Station who limps and calls. Here's how the four bots look:
            </P>
            <div className="space-y-2">
              {(["TAG", "LAG", "Nit", "Station"] as const).map((a) => {
                const c = ARCHETYPES[a];
                return (
                  <div key={a} className="flex items-center gap-3 rounded-lg border border-[var(--line)] bg-ink-850 px-3 py-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
                    <span className="mono w-14 font-bold text-gold-light">
                      {c.vpip}/{c.pfr}
                    </span>
                    <span className="text-sm font-semibold text-[var(--text)]">{c.name}</span>
                    <span className="text-[0.78rem] text-muted">{c.blurb}</span>
                  </div>
                );
              })}
            </div>
            <Callout>Hover a bot's HUD in the game to see these numbers and a reminder of what they mean.</Callout>
            <Quiz
              questions={[
                {
                  q: "A player is 45/7. What kind of opponent is this?",
                  options: ["A tight, aggressive regular", "A loose, passive calling station", "A maniac who raises everything"],
                  answer: 1,
                  explain: "High VPIP (45) but very low PFR (7) = plays many hands but rarely raises — a calling station. Value bet, never bluff.",
                },
                {
                  q: "Can a player have a PFR higher than their VPIP?",
                  options: ["Yes", "No"],
                  answer: 1,
                  explain: "Raising pre-flop is a way of voluntarily putting money in, so every raise is also counted in VPIP. PFR ≤ VPIP always.",
                },
              ]}
            />
          </>
        ),
      },
    ],
  },
  {
    id: "postflop",
    title: "Post-flop",
    icon: "target",
    blurb: "Board texture, pot odds and c-betting.",
    lessons: [
      {
        id: "board-texture",
        title: "Reading Board Texture",
        minutes: 5,
        body: () => (
          <>
            <Lead>Flops are either dry or wet, and that changes everything about how you bet.</Lead>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-[var(--line)] bg-ink-850 p-4">
                <H>Dry boards</H>
                <P>K♠ 7♦ 2♣ — disconnected, rainbow. Few draws exist, so the pre-flop raiser can c-bet small and often.</P>
              </div>
              <div className="rounded-xl border border-[var(--line)] bg-ink-850 p-4">
                <H>Wet boards</H>
                <P>J♥ T♥ 9♠ — connected and suited. Many draws hit it; bet bigger with strong hands and check more marginal ones.</P>
              </div>
            </div>
            <Callout>The wetter the board, the larger and more polarised your bets should be.</Callout>
          </>
        ),
      },
      {
        id: "counting-outs",
        title: "Counting Outs & the 2/4 Rule",
        minutes: 5,
        body: () => (
          <>
            <Lead>
              An "out" is a card that improves you to a likely winner. Counting outs lets you estimate
              your equity in seconds — no computer required.
            </Lead>
            <H>The 2 & 4 rule</H>
            <P>
              On the flop (two cards to come) multiply your outs by 4. On the turn (one card to come)
              multiply by 2. It closely approximates the real percentage.
            </P>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {[
                { d: "Flush draw", o: 9, f: 36, t: 18 },
                { d: "Open-ended straight", o: 8, f: 32, t: 16 },
                { d: "Gutshot", o: 4, f: 16, t: 8 },
                { d: "Two overcards", o: 6, f: 24, t: 12 },
                { d: "Flush + gutshot", o: 12, f: 48, t: 24 },
                { d: "Pair → set", o: 2, f: 8, t: 4 },
              ].map((x) => (
                <div key={x.d} className="rounded-xl border border-[var(--line)] bg-ink-850 px-3 py-2">
                  <div className="text-sm font-semibold text-[var(--text)]">{x.d}</div>
                  <div className="mono text-[0.72rem] text-faint">
                    {x.o} outs · <span className="text-gold-light">{x.f}%</span> flop / {x.t}% turn
                  </div>
                </div>
              ))}
            </div>
            <Callout>Very big draws (12+ outs) slightly beat the ×4 cap — shade huge numbers down a little.</Callout>
            <Quiz
              questions={[
                {
                  q: "You flop a flush draw (9 outs). Roughly what's your equity by the river?",
                  options: ["~18%", "~36%", "~50%"],
                  answer: 1,
                  explain: "Two cards to come → outs × 4 = 9 × 4 ≈ 36%.",
                },
                {
                  q: "On the turn you have a gutshot (4 outs). Your equity?",
                  options: ["~8%", "~16%", "~24%"],
                  answer: 0,
                  explain: "One card to come → outs × 2 = 4 × 2 = 8%.",
                },
              ]}
            />
          </>
        ),
      },
      {
        id: "estimating-equity",
        title: "Estimating Equity",
        minutes: 5,
        body: () => (
          <>
            <Lead>
              For made hands, memorise a handful of classic match-ups and you'll estimate equity at the
              table instantly — no simulation needed.
            </Lead>
            <H>First, what's an "overcard"?</H>
            <P>
              An <Term id="overcard">overcard</Term> is a card higher in rank than your opponent's pair.{" "}
              <b>AK vs 88</b> has two overcards — both beat the 8 — so it's nearly a coin flip (a "race").{" "}
              <b>A8 vs 99</b> has just one overcard (only the ace beats the 9), so the pair is a much
              bigger favourite. The more, and higher, the overcards, the closer to 50/50.
            </P>
            <div className="space-y-2">
              {[
                { m: "Overpair vs underpair (KK vs 99)", e: "~82% / 18%" },
                { m: "Pair vs two overcards / a race (88 vs AKo)", e: "~55% / 45%" },
                { m: "Dominated (AK vs AQ)", e: "~73% / 27%" },
                { m: "Big suited vs pair (AKs vs QQ)", e: "~46% / 54%" },
                { m: "Pair vs one overcard (99 vs A8)", e: "~70% / 30%" },
                { m: "Set over set, flopped (post-flop cooler)", e: "~90% / 10%" },
              ].map((x) => (
                <div key={x.m} className="flex items-center justify-between rounded-lg border border-[var(--line)] bg-ink-850 px-3 py-2">
                  <span className="text-[0.86rem] text-[var(--text)]">{x.m}</span>
                  <span className="mono text-[0.78rem] text-gold-light">{x.e}</span>
                </div>
              ))}
            </div>
            <P>
              The first five are pre-flop all-in match-ups. The last is a post-flop cooler: a{" "}
              <Term id="set">set</Term> is a pocket pair that pairs the board, and when two players both
              flop sets the loser is nearly drawing dead (just the one case card for quads), hence ~90/10.
            </P>
            <Callout>Shortcuts: races ≈ 50/50, domination ≈ 70/30, a pair over a pair ≈ 80/20.</Callout>
            <Quiz
              questions={[
                {
                  q: "KK vs 99 all-in pre-flop — about how often does KK win?",
                  options: ["~60%", "~82%", "~95%"],
                  answer: 1,
                  explain: "A bigger pair over a smaller pair is roughly an 80/20 favourite.",
                },
                {
                  q: "AK vs QQ pre-flop — who's ahead?",
                  options: ["AK, clearly", "QQ, slightly (~54%)", "Exactly 50/50"],
                  answer: 1,
                  explain: "The pair is a small favourite over two overcards — about 54/46.",
                },
              ]}
            />
          </>
        ),
      },
      {
        id: "pot-odds",
        title: "Pot Odds, Break-even & EV",
        minutes: 6,
        body: () => (
          <>
            <Lead>
              Calling is profitable when your equity beats the price you're being laid. Two formulas run
              the whole decision.
            </Lead>
            <H>From odds to a decision</H>
            <P>
              <b>Break-even equity</b> — the minimum chance of winning that makes a call profitable — is
              your call divided by the final pot:{" "}
              <span className="mono text-gold-light">call ÷ (pot + 2 × bet)</span>. The{" "}
              <b>value of calling</b> is{" "}
              <span className="mono text-gold-light">EV = equity × (final pot) − your call</span>. If EV
              is positive, call. Drag the sliders — including your own equity estimate — and watch the
              verdict flip.
            </P>
            <PotOddsCalculator />
            <Callout>
              The EV Coach during play computes your exact equity against each bot's range with a Monte
              Carlo simulation — this is the same maths, automated.
            </Callout>
            <Quiz
              questions={[
                {
                  q: "The pot is 10 bb and your opponent bets 5 bb. What equity do you need to call?",
                  options: ["About 25%", "About 33%", "About 50%"],
                  answer: 0,
                  explain: "You call 5 to win 15 (10 + their 5). Break-even = 5 / (10 + 5 + 5) = 5/20 = 25%.",
                },
                {
                  q: "A pot-sized bet always lays you what pot odds to call?",
                  options: ["2-to-1 (need 33%)", "1-to-1 (need 50%)", "3-to-1 (need 25%)"],
                  answer: 0,
                  explain: "Against a pot-sized bet you're getting 2-to-1, so you need ~33% equity to break even.",
                },
              ]}
            />
          </>
        ),
      },
      {
        id: "implied-odds",
        title: "Implied & Reverse-Implied Odds",
        minutes: 5,
        body: () => (
          <>
            <Lead>
              Pot odds only count the chips in the middle right now. Implied odds count the extra you
              expect to win on later streets when you complete your hand.
            </Lead>
            <P>
              A draw that's slightly too expensive on direct odds can still be a profitable call if
              you'll get paid off when you hit. The deeper the stacks and the more disguised your draw,
              the larger your implied odds — which is why suited connectors and small pairs (set-mining)
              love deep stacks.
            </P>
            <H>Reverse-implied odds</H>
            <P>
              The flip side: hands that win a small pot but lose a big one — a weak top pair, or a
              dominated draw (a low flush draw against a higher one). When you'll often be second-best as
              the money goes in, shade toward folding even when the immediate price looks okay.
            </P>
            <Callout>
              Implied odds reward hands that make the nuts (sets, straights, flushes). Reverse-implied
              odds punish hands that make a second-best hand (weak aces, dominated draws).
            </Callout>
            <Quiz
              questions={[
                {
                  q: "Implied odds are largest when…",
                  options: ["Stacks are deep and your draw is hidden", "Stacks are shallow", "You're drawing to a small flush"],
                  answer: 0,
                  explain: "Deep stacks mean more to win on later streets; a hidden draw means you get paid when you hit.",
                },
                {
                  q: "Which hand suffers most from reverse-implied odds?",
                  options: ["The nut flush draw", "A king-high flush draw against aggression", "A set"],
                  answer: 1,
                  explain: "A non-nut flush draw can complete and still lose a big pot to a higher flush — classic reverse-implied odds.",
                },
              ]}
            />
          </>
        ),
      },
      {
        id: "bet-sizing",
        title: "Bet Sizing",
        minutes: 6,
        body: () => (
          <>
            <Lead>Your bet size should follow your goal: get value, deny equity, or fold out better hands.</Lead>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-[var(--line)] bg-ink-850 p-4">
                <H>Polarized → big</H>
                <P>When your range is the nuts or a bluff (and little in between), bet large — you want max value and max fold pressure.</P>
              </div>
              <div className="rounded-xl border border-[var(--line)] bg-ink-850 p-4">
                <H>Merged → small</H>
                <P>When you hold many decent-but-not-great hands, bet small to get called by worse and keep the pot manageable.</P>
              </div>
            </div>
            <P>
              Size also <b>denies equity</b>: a bigger bet charges draws more to continue, so size up on
              wet boards. And your bluff size sets the price — a bet only profits as a bluff if your
              opponent folds often enough. Drag the sliders:
            </P>
            <BluffCalculator />
            <Callout>
              Pure-bluff rule of thumb: a pot-sized bet needs villain to fold about 50% of the time; a
              half-pot bet about 33%; a third-pot about 25%.
            </Callout>
            <Quiz
              questions={[
                {
                  q: "A pot-sized bluff needs your opponent to fold roughly how often to break even?",
                  options: ["~33%", "~50%", "~67%"],
                  answer: 1,
                  explain: "Risk = pot, reward = pot, so break-even fold frequency = bet/(bet+pot) = 50%.",
                },
                {
                  q: "With a polarized range (nuts or bluffs), you should bet…",
                  options: ["Small", "Big"],
                  answer: 1,
                  explain: "Polarized ranges want big sizes for maximum value and fold equity.",
                },
              ]}
            />
          </>
        ),
      },
      {
        id: "cbetting",
        title: "Continuation Betting",
        minutes: 4,
        body: () => (
          <>
            <Lead>
              A continuation bet (c-bet) is a follow-up bet on the flop by the pre-flop aggressor. It wins
              pots whether or not you connected.
            </Lead>
            <P>
              C-bet more on dry boards that favour your range, and on boards where you can credibly
              represent the strongest hands. Slow down on wet boards that smash the caller's range, and
              against calling stations who never fold — value bet them instead.
            </P>
          </>
        ),
      },
    ],
  },
  {
    id: "advanced",
    title: "Advanced",
    icon: "bolt",
    blurb: "Combinatorics, blockers and exploits.",
    lessons: [
      {
        id: "combinatorics",
        title: "Combinatorics & Blockers",
        minutes: 6,
        body: () => (
          <>
            <Lead>
              Counting combos turns "I feel like he has it" into a number. There are 6 ways to make any
              pocket pair, 4 ways for a suited hand, 12 for an offsuit hand.
            </Lead>
            <P>
              A blocker is a card in your hand that removes combos from your opponent's range. Holding the
              A♠ on a flush-draw board means they can't have the nut-flush draw with the A♠ — fewer of
              their bluffs and value hands exist, which makes your bluffs and calls work more often.
            </P>
            <H>Worked example</H>
            <P>
              The board is K♠ 9♦ 4♣. How many combos of top pair (a King) can your opponent have? Normally
              KK = 6 and each non-paired King hand like KQ = 16 combos — but the K♠ on the board is a
              blocker. With one King gone, KK drops to 3 combos and KQ to 12. Counting this way tells you
              there are far fewer value hands than it feels like.
            </P>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                { h: "Any pocket pair", n: "6 combos" },
                { h: "Suited (e.g. AKs)", n: "4 combos" },
                { h: "Offsuit (e.g. AKo)", n: "12 combos" },
              ].map((x) => (
                <div key={x.h} className="rounded-xl border border-[var(--line)] bg-ink-850 px-2 py-3">
                  <div className="mono text-lg font-bold text-gold-light">{x.n}</div>
                  <div className="text-[0.68rem] text-faint">{x.h}</div>
                </div>
              ))}
            </div>
            <Callout>Holding one card of a pair cuts their pair combos from 6 down to 3.</Callout>
            <Quiz
              questions={[
                {
                  q: "How many combos of pocket Aces (AA) are there before any cards are dealt?",
                  options: ["4", "6", "12"],
                  answer: 1,
                  explain: "Choose 2 of the 4 aces: C(4,2) = 6 combos. Every pocket pair has 6.",
                },
                {
                  q: "You hold A♠. How many combos of AA can your opponent now have?",
                  options: ["6", "3", "1"],
                  answer: 1,
                  explain: "Your A♠ removes one ace, leaving 3 aces → C(3,2) = 3 combos. That's the power of a blocker.",
                },
                {
                  q: "How many combos does an offsuit hand like KQo have?",
                  options: ["4", "12", "16"],
                  answer: 1,
                  explain: "4 kings × 3 non-matching-suit queens = 12 offsuit combos.",
                },
              ]}
            />
          </>
        ),
      },
      {
        id: "hand-reading",
        title: "Hand Reading: Narrowing a Range",
        minutes: 7,
        body: () => (
          <>
            <Lead>
              Good players don't guess one hand — they track a whole range and shrink it street by
              street as the story unfolds. Here's the repeatable method.
            </Lead>
            <H>The four steps</H>
            <P>
              1. <b>Start wide</b> from their position and type — a Nit's UTG range is tiny; a LAG's
              button range is huge. 2. <b>Subtract on every action</b>: a raise keeps value plus chosen
              bluffs; a call removes both the very top (they'd raise) and the bottom (they'd fold). 3.{" "}
              <b>Apply the board</b>: ask "which of their hands improved, and would they keep betting or
              calling it?" Remove the air they'd give up. 4. <b>Compare</b> your hand to the handful of
              combos left — not to one imagined holding.
            </P>
            <div className="grid gap-4 lg:grid-cols-3">
              <Diagram range={topPercentRange(40)} title="Pre-flop: opens ~40%" />
              <Diagram range={topPercentRange(20)} title="Continues flop ~20%" />
              <Diagram range={topPercentRange(10)} title="Barrels turn ~10%" />
            </div>
            <Callout>
              By the river, big aggressive lines are often <b>polarized</b> — the nuts or a bluff. Don't
              pay off the value half with a bluff-catcher unless the price is right.
            </Callout>
            <Quiz
              questions={[
                {
                  q: "A flat call (rather than a raise) usually removes which hands from a range?",
                  options: ["Only the weakest hands", "Both the strongest (would raise) and the weakest (would fold)", "Nothing — calls are random"],
                  answer: 1,
                  explain: "Calling caps a range: the nuts tend to raise, trash tends to fold, leaving the middle.",
                },
                {
                  q: "A tight player check-raises the river. Their range is best described as…",
                  options: ["Wide and weak", "Polarized — very strong hands and a few bluffs", "Exactly one hand"],
                  answer: 1,
                  explain: "Big river aggression from a tight player is polarized: value or bluff, little in between.",
                },
              ]}
            />
          </>
        ),
      },
      {
        id: "exploits",
        title: "Exploiting the Archetypes",
        minutes: 6,
        body: () => (
          <>
            <Lead>The bots in the Sandbox play four classic styles. Each leaks differently.</Lead>
            <div className="space-y-2">
              {(["TAG", "LAG", "Nit", "Station"] as const).map((a) => {
                const c = ARCHETYPES[a];
                const advice: Record<string, string> = {
                  TAG: "Solid and balanced. Respect their raises; pick spots, don't bluff into strength.",
                  LAG: "Hyper-aggressive. Trap with strong hands and let them barrel into you.",
                  Nit: "Folds too much. Steal relentlessly, but believe them when they finally raise.",
                  Station: "Calls everything. Never bluff — value bet thin and bet big with strong hands.",
                };
                return (
                  <div key={a} className="rounded-xl border border-[var(--line)] bg-ink-850 p-4">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full" style={{ background: c.color }} />
                      <span className="font-semibold text-[var(--text)]">
                        {c.name} ({a})
                      </span>
                      <span className="mono text-[0.7rem] text-faint">
                        VPIP {c.vpip} / PFR {c.pfr}
                      </span>
                    </div>
                    <p className="mt-1 text-[0.86rem] text-muted">{advice[a]}</p>
                  </div>
                );
              })}
            </div>
          </>
        ),
      },
      {
        id: "multiway",
        title: "Playing Multiway",
        minutes: 6,
        body: () => (
          <>
            <Lead>
              Almost everything else assumes one opponent. Add players and the maths shifts — this is the
              piece most training tools skip.
            </Lead>
            <H>Your equity to win drops</H>
            <P>
              A hand that wins ~55% heads-up might win only ~30% against three opponents — more players
              means more ways to be beaten. Drawing hands also get paid less reliably because someone may
              already have the made hand you're drawing to.
            </P>
            <H>Pot odds still hold, but realised equity is lower</H>
            <P>
              Break-even equity (call ÷ final pot) is unchanged, but your real chance of winning is lower
              multiway and players still to act can wake up with a hand. So continue with a stronger
              range, bluff less (someone usually calls), and value-bet your big hands bigger. Speculative
              hands — suited connectors, small pairs — go up in value because implied odds are huge when
              you hit.
            </P>
            <H>See it for yourself</H>
            <P>Pick a hand and slide the opponent count — watch equity fall as the field grows.</P>
            <MultiwayEquityTrainer />
            <Callout>
              The in-game EV Coach now computes your equity against the whole field in multiway pots (not
              just heads-up), so its numbers already reflect this. Stronger hands still matter more the
              more players are in.
            </Callout>
            <Quiz
              questions={[
                {
                  q: "As more players enter the pot, your continuing range should get…",
                  options: ["Wider", "Tighter", "Unchanged"],
                  answer: 1,
                  explain: "More opponents = more ways to lose, so tighten up and continue with stronger hands.",
                },
                {
                  q: "Multiway, should you bluff more or less than heads-up?",
                  options: ["More", "Less"],
                  answer: 1,
                  explain: "With more players, it's far likelier someone calls — bluffs get through much less often.",
                },
              ]}
            />
          </>
        ),
      },
      {
        id: "spr",
        title: "SPR & Commitment",
        minutes: 5,
        body: () => (
          <>
            <Lead>
              Stack-to-Pot Ratio (SPR) = the effective stack divided by the pot on the flop. One number
              tells you how committed you are and which hands are worth stacking off.
            </Lead>
            <div className="space-y-2">
              {[
                { r: "SPR ≤ 3 (low)", g: "Committed — get it in with top pair / overpair or better." },
                { r: "SPR 4–6 (medium)", g: "Top pair good kicker is playable, but big draws and two pair want the money in." },
                { r: "SPR 7+ (high)", g: "Stack off only with two pair, sets and better — one pair rarely justifies 100bb." },
              ].map((x) => (
                <div key={x.r} className="flex items-center gap-3 rounded-lg border border-[var(--line)] bg-ink-850 px-3 py-2">
                  <span className="mono w-28 shrink-0 font-bold text-gold-light">{x.r}</span>
                  <span className="text-[0.84rem] text-muted">{x.g}</span>
                </div>
              ))}
            </div>
            <P>
              SPR is set <b>before</b> the flop: more raises and callers build a bigger pot and shrink the
              SPR, widening what you'll commit. 3-bet pots are low-SPR (commit lighter); limped,
              single-raised pots are high-SPR (need a stronger hand to stack off).
            </P>
            <Callout>Decide your stack-off threshold on the flop from the SPR — then stop agonising street by street.</Callout>
            <Quiz
              questions={[
                {
                  q: "A high SPR means you should commit your stack with…",
                  options: ["Any top pair", "Stronger hands (two pair, sets+)", "Any pair"],
                  answer: 1,
                  explain: "Deep relative to the pot, one pair is rarely worth stacking off — you want two pair or better.",
                },
                {
                  q: "A 3-bet pot tends to create a…",
                  options: ["Low SPR", "High SPR"],
                  answer: 0,
                  explain: "The bigger pre-flop pot relative to remaining stacks means a low SPR, so you commit lighter.",
                },
              ]}
            />
          </>
        ),
      },
      {
        id: "synthesis",
        title: "Putting It Together",
        minutes: 3,
        body: () => (
          <>
            <Lead>You now have the full toolkit: rankings, position, ranges, odds and exploits.</Lead>
            <P>
              Head to the Sandbox. Before each decision, use Guess Range to test your read, then act and
              let the EV Coach grade you. Watch your bb/100 and read accuracy climb on the Stats page over
              time. That feedback loop — decide, measure, adjust — is how real players improve.
            </P>
            <Callout title="Your move">Open the Play tab and run 50 hands focusing only on position.</Callout>
          </>
        ),
      },
    ],
  },
  {
    id: "practice",
    title: "Practice",
    icon: "target",
    blurb: "Hands-on drills and a range explorer.",
    lessons: [
      {
        id: "cheat-sheet",
        title: "Quick Reference",
        minutes: 4,
        body: () => {
          const Row = ({ k, v }: { k: string; v: string }) => (
            <div className="flex items-center justify-between rounded-lg border border-[var(--line)] bg-ink-850 px-3 py-1.5">
              <span className="text-[0.82rem] text-[var(--text)]">{k}</span>
              <span className="mono text-[0.78rem] text-gold-light">{v}</span>
            </div>
          );
          return (
            <>
              <Lead>Everything worth memorising, on one page. Come back to it any time.</Lead>

              <H>Equity from outs (2 / 4 rule)</H>
              <div className="grid gap-2 sm:grid-cols-2">
                <Row k="Per out — flop (×4) / turn (×2)" v="≈ 4% / 2%" />
                <Row k="Flush draw (9 outs)" v="≈ 36% / 18%" />
                <Row k="Open-ender (8)" v="≈ 32% / 16%" />
                <Row k="Gutshot (4)" v="≈ 16% / 8%" />
              </div>

              <H>Common all-in matchups</H>
              <div className="grid gap-2 sm:grid-cols-2">
                <Row k="Pair vs lower pair" v="≈ 80 / 20" />
                <Row k="Pair vs two overcards (race)" v="≈ 55 / 45" />
                <Row k="Dominated (AK vs AQ)" v="≈ 70 / 30" />
                <Row k="Set over set (flopped)" v="≈ 90 / 10" />
              </div>

              <H>Prices</H>
              <div className="grid gap-2 sm:grid-cols-2">
                <Row k="Break-even equity to call" v="call ÷ (pot + 2×bet)" />
                <Row k="Pot bet → need" v="33%" />
                <Row k="Half-pot → need" v="25%" />
                <Row k="Bluff: pot bet → fold %" v="50% (½-pot: 33%)" />
              </div>

              <H>SPR & position</H>
              <div className="grid gap-2 sm:grid-cols-2">
                <Row k="SPR ≤ 3 → commit with" v="top pair+" />
                <Row k="SPR 7+ → commit with" v="two pair / sets+" />
                <Row k="UTG / CO / BTN opens" v="~14% / 27% / 45%" />
                <Row k="BB defend vs a raise" v="~55%" />
              </div>

              <H>Glossary</H>
              <p className="text-[0.74rem] text-faint">Every term below is also hoverable wherever it appears in a lesson.</p>
              <div className="space-y-1.5">
                {Object.values(GLOSSARY).map((g) => (
                  <p key={g.term} className="text-[0.82rem] text-muted">
                    <b className="text-[var(--text)]">{g.term}</b> — {g.def}
                  </p>
                ))}
              </div>
            </>
          );
        },
      },
      {
        id: "range-explorer",
        title: "Range Explorer",
        minutes: 5,
        body: () => (
          <>
            <Lead>
              Build ranges by hand. Load a position preset to see how a target percentage becomes real
              cells, or paint your own and watch the combo count — the same count the EV Coach quotes.
            </Lead>
            <RangeExplorer />
          </>
        ),
      },
      {
        id: "equity-calculator",
        title: "Equity Calculator",
        minutes: 5,
        body: () => (
          <>
            <Lead>
              A free-form equity tool. Paint any two ranges, set a board, and the same Monte-Carlo engine
              the coach uses tells you how often you win.
            </Lead>
            <EquityCalculator />
          </>
        ),
      },
      {
        id: "drill-potodds",
        title: "Pot-Odds Drill",
        minutes: 5,
        body: () => (
          <>
            <Lead>Random spots — compute the break-even equity in your head, then check yourself.</Lead>
            <PotOddsDrill />
          </>
        ),
      },
      {
        id: "drill-outs",
        title: "Outs → Equity Drill",
        minutes: 5,
        body: () => (
          <>
            <Lead>Practise the 2/4 rule on random draws until it's automatic.</Lead>
            <OutsDrill />
          </>
        ),
      },
      {
        id: "drill-range",
        title: "Range-Building Drill",
        minutes: 6,
        body: () => (
          <>
            <Lead>Paint a position's opening range from memory, then score it against the standard.</Lead>
            <RangeBuildDrill />
          </>
        ),
      },
    ],
  },
];

export const ALL_LESSON_IDS = LEVELS.flatMap((l) => l.lessons.map((x) => x.id));
