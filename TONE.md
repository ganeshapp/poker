# TONE.md — how the coach talks

The user of this app is **not a poker expert**. Every piece of coaching,
feedback, and explanation follows three layers. Keep the expert
substance; always lead with language a first-week player understands.

## The three layers

1. **Plain English first** (always visible). One or two sentences, no
   jargon, chances as counts, money as big blinds:
   > "You paid 8 bb to win a pot of 24 bb — you need to win about 1
   > time in 4. Your hand wins about 1 time in 3, so this call makes
   > you money."
2. **"Show me the math"** (expandable). The same conclusion derived
   step by step. Numbers may be percentages here; every term used is
   either self-explaining or hover-defined.
3. **"Expert detail"** (expandable). Ranges, combo counts, EV formulas,
   simulation precision, methodology caveats.

## Rules

- **No unexplained jargon at layer 1.** "Equity", "pot odds", "SPR",
  "range" belong to layers 2–3, or get a hover definition.
- **Say the idea in ordinary words first — everywhere, all layers.**
  User test result: nobody understood "You're laying a caller 20%".
  Insider vocabulary reads as showing off and erodes trust. If a term
  is worth teaching, define it in the same breath it first appears
  ("just calling the minimum instead of raising — players call this
  *limping*"), then it may be used with hover definitions. If it isn't
  worth teaching, don't use it. Translating must preserve the full
  poker substance — re-word the idea, never water it down.

  Banned outright (never taught, pure insider-speak):
  | Never write | Write instead |
  |---|---|
  | "laying odds / laying a caller X%" | "their call only needs to win X% to make money" |
  | "villain" | "your opponent" / the bot's name |
  | "hero" (user-facing) | "you" |
  | "stab / barrel / fire" | "bet" / "bet again" |
  | "air / nutted / the nuts" (unglossed) | "nothing" / "a monster hand" / "the best possible hand" |
  | "OOP / IP" (unglossed) | "acting first / acting last" |
  | "denies equity" (unglossed) | "makes drawing hands pay too much to keep chasing" |
  | "stack off" (unglossed) | "put your whole stack in" |
- **Frequencies over percentages at layer 1**: "wins about 3 times in
  10", not "31% equity". Use `fmtTimes()` from `src/lib/format.ts`.
- **Judge the decision, never the person.** "This call loses money over
  time", never "bad play". The user's choice was reasonable until shown
  otherwise.
- **Honesty about confidence.** When a verdict is inside the margin of
  error, say so plainly: "genuinely too close to call — either choice
  is fine." Never manufacture certainty.
- **Teach one thing per note.** A verdict names the single concept that
  decides the spot (the price, the hand strength, the fold equity) and
  links deeper reading, rather than touring every consideration.
- **Approximations are labeled.** Post-flop verdicts say they're
  heuristic; exact enumerations say they're exact.

## Where it applies

EV coach panel, blocking-mistake dialog, drill feedback and rationales,
leak review, session debrief, peek/range-reveal notes, stat
explanations. New surfaces adopt this from day one.
