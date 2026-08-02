import { useState } from "react";
import { Modal } from "./Dialog";
import { Button } from "./controls";
import { Icon, type IconName } from "./Icon";
import { useDrills } from "@/store/drillStore";
import { useNav } from "@/store/navStore";
import { cx } from "@/lib/cx";

const SEEN_KEY = "allin.onboarded.v1";

export function hasOnboarded(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return true;
  }
}

function markOnboarded() {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* ignore */
  }
}

const TOUR: { icon: IconName; title: string; body: string }[] = [
  {
    icon: "play",
    title: "Play against real-ish opponents",
    body: "Four bot styles with genuinely different tendencies. The EV Coach watches every decision and explains — in plain English first — whether it made money. At the end of each hand, everyone's cards are revealed, folds included: that's how you build intuition.",
  },
  {
    icon: "target",
    title: "Drill like chess puzzles",
    body: "Short spots with instant feedback: the answer, why, how much a mistake costs in big blinds, and the exact set of hands (the range) you were graded against. Anything you miss — and anything the coach flags in play — comes back on a spaced schedule until you've beaten it three times.",
  },
  {
    icon: "book",
    title: "Study when you want the why",
    body: "A 31-lesson course from the rules up to 3-bet pots and river play, with interactive calculators. Drill feedback links straight to the lesson that teaches each concept.",
  },
  {
    icon: "coach",
    title: "Judge decisions, not results",
    body: "Poker pays good decisions slowly and randomly. You'll lose hands you played perfectly and win hands you butchered. This app grades the decision — the only thing you control. That mindset is the whole game.",
  },
];

const PLACEMENT: { q: string; options: string[]; answer: number }[] = [
  { q: "Which beats which?", options: ["A flush beats a straight", "A straight beats a flush", "They tie"], answer: 0 },
  { q: "The best seat at the table is…", options: ["The button — you act last after the flop", "Under the gun — you act first", "The big blind — you've already paid"], answer: 0 },
  { q: "The pot is 10 bb and your opponent bets 5 bb. To call profitably you need to win about…", options: ["1 time in 4", "1 time in 2", "2 times in 3"], answer: 0 },
  { q: "A flush draw on the flop (9 outs, two cards to come) has roughly what chance of hitting?", options: ["About 36%", "About 18%", "About 9%"], answer: 0 },
  { q: "Why 3-bet (re-raise) before the flop?", options: ["Value with big hands, plus pressure with the right bluffs", "Only ever with aces", "To see a cheap flop"], answer: 0 },
  { q: "In a 3-bet pot with a low stack-to-pot ratio, top pair top kicker is usually…", options: ["A hand worth your whole stack", "A fold to any bet", "A hand to keep the pot tiny with"], answer: 0 },
  { q: "Against a player who never bluffs, their big river bet means you should…", options: ["Fold hands that only beat bluffs — even if folding is 'exploitable'", "Call just often enough that bluffing can't profit", "Always raise"], answer: 0 },
  { q: "With 10 big blinds in the small blind, folded to you, a solid strategy is…", options: ["Go all-in with over half your hands", "Only go all-in with premium pairs", "Just call the minimum and decide later"], answer: 0 },
];

function shuffledPerms(): number[][] {
  return PLACEMENT.map((q) => {
    const idx = q.options.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    return idx;
  });
}

export function OnboardingModal() {
  const [open, setOpen] = useState(() => !hasOnboarded());
  const [perms] = useState(shuffledPerms);
  const [step, setStep] = useState(0); // 0..3 tour, 4 = placement intro, 5 = quiz, 6 = result
  const [qi, setQi] = useState(0);
  const [score, setScore] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const seedRating = useDrills((s) => s.seedRating);
  const go = useNav((s) => s.go);

  const close = () => {
    markOnboarded();
    setOpen(false);
  };

  const finishPlacement = () => {
    const rating = score <= 2 ? 900 : score <= 5 ? 1050 : 1250;
    seedRating(rating);
    setStep(6);
  };

  const resultText =
    score <= 2
      ? { level: "Starting fresh — perfect.", advice: "Begin with Level 1: Hand Rankings. The course assumes nothing.", lesson: "hand-rankings" }
      : score <= 5
        ? { level: "You know the basics.", advice: "Start at Pot Odds & EV — the math that powers every decision here.", lesson: "pot-odds" }
        : { level: "Solid foundations.", advice: "Jump into the advanced track — 3-bet pots and river play — and let the drills find your edges.", lesson: "threebet-pots" };

  return (
    <Modal open={open} onOpenChange={(o) => !o && close()} maxWidth={470} title="Welcome to All-In" hideClose={false}
      description={step <= 3 ? `A 60-second tour · ${step + 1} of 4` : step === 6 ? "You're set" : "Optional placement"}>
      {step <= 3 && (
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gold/15 text-gold">
              <Icon name={TOUR[step].icon} size={19} />
            </span>
            <div>
              <div className="font-display text-base font-bold text-[var(--text)]">{TOUR[step].title}</div>
              <p className="mt-1 text-[0.84rem] leading-relaxed text-muted">{TOUR[step].body}</p>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex gap-1.5">
              {TOUR.map((_, i) => (
                <span key={i} className={cx("h-1.5 w-5 rounded-full", i <= step ? "bg-gold" : "bg-ink-600")} />
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={close}>
                Skip
              </Button>
              <Button size="sm" onClick={() => setStep(step + 1)}>
                {step === 3 ? "Continue" : "Next"} <Icon name="arrow-right" size={14} />
              </Button>
            </div>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-4">
          <p className="text-[0.86rem] leading-relaxed text-muted">
            Eight quick questions calibrate the drills to your level — harder spots if you're
            experienced, clearer ones if you're new. No grade, no judgment, and you can skip it.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={close}>
              Skip — start playing
            </Button>
            <Button size="sm" onClick={() => setStep(5)}>
              Calibrate me <Icon name="target" size={14} />
            </Button>
          </div>
        </div>
      )}

      {step === 5 && (
        <div className="space-y-3">
          <div className="text-[0.72rem] font-semibold uppercase tracking-wide text-faint">
            Question {qi + 1} of {PLACEMENT.length}
          </div>
          <div className="text-[0.9rem] font-medium text-[var(--text)]">{PLACEMENT[qi].q}</div>
          <div className="grid gap-1.5">
            {perms[qi].map((optIdx, oi) => (
              <button
                key={oi}
                disabled={picked !== null}
                onClick={() => {
                  setPicked(oi);
                  if (optIdx === PLACEMENT[qi].answer) setScore((x) => x + 1);
                  setTimeout(() => {
                    setPicked(null);
                    if (qi + 1 >= PLACEMENT.length) finishPlacement();
                    else setQi(qi + 1);
                  }, 350);
                }}
                className={cx(
                  "rounded-lg border px-3 py-2 text-left text-[0.84rem] transition",
                  picked === oi
                    ? optIdx === PLACEMENT[qi].answer
                      ? "border-good bg-good/15 text-[var(--text)]"
                      : "border-bad bg-bad/15 text-[var(--text)]"
                    : "border-[var(--line)] bg-ink-800 text-muted hover:bg-ink-700",
                )}
              >
                {PLACEMENT[qi].options[optIdx]}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 6 && (
        <div className="space-y-4">
          <div className="rounded-xl border border-gold/25 bg-gold/[0.06] p-3">
            <div className="font-display text-base font-bold text-[var(--text)]">{resultText.level}</div>
            <p className="mt-1 text-[0.84rem] leading-relaxed text-muted">
              {score}/{PLACEMENT.length} — drills are calibrated to match. {resultText.advice}
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                close();
                go("study", resultText.lesson);
              }}
            >
              <Icon name="book" size={14} /> Take me there
            </Button>
            <Button size="sm" onClick={close}>
              <Icon name="play" size={14} /> Start playing
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
