import { useState, type ReactNode } from "react";
import type { HandLabel } from "@/types/poker";
import { topPercentRange } from "@/engine/ranges";
import { combosInSet, comboCount } from "@/engine/notation";
import { RangeMatrix, RangeLegend } from "@/components/range/RangeMatrix";
import { Button } from "@/components/ui/controls";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/lib/cx";
import { fmtPct } from "@/lib/format";

const randInt = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function Shell({
  title,
  score,
  children,
  footer,
}: {
  title: string;
  score: { right: number; total: number };
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-info/25 bg-info/[0.06] p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-info">
          <Icon name="target" size={16} /> {title}
        </div>
        <div className="mono text-[0.78rem] text-muted">
          Score {score.right}/{score.total}
        </div>
      </div>
      {children}
      <div className="mt-4 flex justify-end">{footer}</div>
    </div>
  );
}

function Options({
  options,
  picked,
  correct,
  suffix,
  onPick,
}: {
  options: number[];
  picked: number | null;
  correct: number;
  suffix: string;
  onPick: (v: number) => void;
}) {
  const answered = picked !== null;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {options.map((o) => {
        let cls = "border-[var(--line)] bg-ink-800 text-muted hover:bg-ink-700";
        if (answered && o === correct) cls = "border-good bg-good/15 text-[var(--text)]";
        else if (answered && o === picked) cls = "border-bad bg-bad/15 text-[var(--text)]";
        return (
          <button
            key={o}
            disabled={answered}
            onClick={() => onPick(o)}
            className={cx("rounded-lg border px-3 py-2 mono text-sm font-bold transition disabled:cursor-default", cls)}
          >
            {o}
            {suffix}
          </button>
        );
      })}
    </div>
  );
}

function Explain({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <div className="mt-3 text-[0.82rem] leading-relaxed text-muted">
      <span className={cx("font-semibold", ok ? "text-good" : "text-warn")}>{ok ? "Correct. " : "Not quite. "}</span>
      {children}
    </div>
  );
}

/* ---------- Pot-odds drill ---------- */
function makePotSpot() {
  const pot = randInt(4, 40);
  const fracs = [0.33, 0.5, 0.66, 1];
  const bet = Math.max(1, Math.round(pot * fracs[randInt(0, 3)] * 2) / 2);
  const correct = Math.round((bet / (pot + 2 * bet)) * 100);
  const set = new Set<number>([correct]);
  const deltas = [-15, -10, -7, 7, 10, 15];
  while (set.size < 4) {
    const d = correct + deltas[randInt(0, deltas.length - 1)];
    if (d > 2 && d < 60) set.add(d);
  }
  return { pot, bet, correct, options: shuffle([...set]) };
}

export function PotOddsDrill() {
  const [spot, setSpot] = useState(makePotSpot);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState({ right: 0, total: 0 });
  const answered = picked !== null;

  return (
    <Shell
      title="Pot-odds drill"
      score={score}
      footer={
        <Button
          variant={answered ? "primary" : "ghost"}
          onClick={() => {
            setSpot(makePotSpot());
            setPicked(null);
          }}
        >
          New spot <Icon name="refresh" size={14} />
        </Button>
      }
    >
      <p className="text-[0.92rem] text-[var(--text)]">
        The pot is <b>{spot.pot} bb</b> and your opponent bets <b>{spot.bet} bb</b>. What equity do you
        need to call?
      </p>
      <div className="mt-3">
        <Options
          options={spot.options}
          picked={picked}
          correct={spot.correct}
          suffix="%"
          onPick={(v) => {
            if (answered) return;
            setPicked(v);
            setScore((s) => ({ right: s.right + (v === spot.correct ? 1 : 0), total: s.total + 1 }));
          }}
        />
      </div>
      {answered && (
        <Explain ok={picked === spot.correct}>
          Break-even = call ÷ final pot = {spot.bet} ÷ ({spot.pot} + 2×{spot.bet}) ={" "}
          {fmtPct(spot.bet / (spot.pot + 2 * spot.bet))}.
        </Explain>
      )}
    </Shell>
  );
}

/* ---------- Outs → equity drill ---------- */
const DRAWS = [
  { name: "a flush draw", outs: 9 },
  { name: "an open-ended straight draw", outs: 8 },
  { name: "a gutshot", outs: 4 },
  { name: "two overcards", outs: 6 },
  { name: "a flush draw + gutshot", outs: 12 },
  { name: "a pocket pair hoping to flop/turn a set", outs: 2 },
  { name: "a flush draw + open-ender", outs: 15 },
];

function makeOutsSpot() {
  const d = DRAWS[randInt(0, DRAWS.length - 1)];
  const onFlop = Math.random() < 0.5;
  const mult = onFlop ? 4 : 2;
  const correct = Math.min(95, d.outs * mult);
  const set = new Set<number>([correct]);
  const deltas = [-16, -12, -8, 8, 12, 16];
  while (set.size < 4) {
    const v = correct + deltas[randInt(0, deltas.length - 1)];
    if (v > 2 && v < 99) set.add(v);
  }
  return { d, mult, street: onFlop ? "flop (two cards to come)" : "turn (one card to come)", correct, options: shuffle([...set]) };
}

export function OutsDrill() {
  const [spot, setSpot] = useState(makeOutsSpot);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState({ right: 0, total: 0 });
  const answered = picked !== null;

  return (
    <Shell
      title="Outs → equity drill"
      score={score}
      footer={
        <Button
          variant={answered ? "primary" : "ghost"}
          onClick={() => {
            setSpot(makeOutsSpot());
            setPicked(null);
          }}
        >
          New spot <Icon name="refresh" size={14} />
        </Button>
      }
    >
      <p className="text-[0.92rem] text-[var(--text)]">
        On the <b>{spot.street}</b> you have <b>{spot.d.name}</b> ({spot.d.outs} outs). Using the rule of
        thumb, roughly what's your equity?
      </p>
      <div className="mt-3">
        <Options
          options={spot.options}
          picked={picked}
          correct={spot.correct}
          suffix="%"
          onPick={(v) => {
            if (answered) return;
            setPicked(v);
            setScore((s) => ({ right: s.right + (v === spot.correct ? 1 : 0), total: s.total + 1 }));
          }}
        />
      </div>
      {answered && (
        <Explain ok={picked === spot.correct}>
          Multiply outs by {spot.mult} ({spot.mult === 4 ? "two cards to come" : "one card to come"}):{" "}
          {spot.d.outs} × {spot.mult} ≈ {spot.correct}%. The ×4 rule slightly over-counts big draws, so
          shade large numbers down a touch.
        </Explain>
      )}
    </Shell>
  );
}

/* ---------- Range-building drill ---------- */
const TARGETS = [
  { pos: "UTG", pct: 14 },
  { pos: "CO", pct: 27 },
  { pos: "BTN", pct: 45 },
  { pos: "BB", pct: 55 },
];

function scoreRange(painted: Set<HandLabel>, actual: Set<HandLabel>) {
  let inter = 0;
  for (const l of painted) if (actual.has(l)) inter += comboCount(l);
  const pc = combosInSet(painted);
  const ac = combosInSet(actual);
  const precision = pc > 0 ? inter / pc : 0;
  const recall = ac > 0 ? inter / ac : 0;
  return precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
}

export function RangeBuildDrill() {
  const [target, setTarget] = useState(() => TARGETS[randInt(0, TARGETS.length - 1)]);
  const [painted, setPainted] = useState<Set<HandLabel>>(new Set());
  const [checked, setChecked] = useState(false);
  const [score, setScore] = useState({ right: 0, total: 0 });

  const actual = topPercentRange(target.pct);
  const acc = checked ? scoreRange(painted, actual) : 0;

  return (
    <Shell
      title="Range-building drill"
      score={score}
      footer={
        checked ? (
          <Button
            onClick={() => {
              setTarget(TARGETS[randInt(0, TARGETS.length - 1)]);
              setPainted(new Set());
              setChecked(false);
            }}
          >
            New drill <Icon name="refresh" size={14} />
          </Button>
        ) : (
          <Button
            onClick={() => {
              setChecked(true);
              const a = scoreRange(painted, actual);
              setScore((s) => ({ right: s.right + (a >= 0.7 ? 1 : 0), total: s.total + 1 }));
            }}
            disabled={painted.size === 0}
          >
            Check
          </Button>
        )
      }
    >
      <p className="text-[0.92rem] text-[var(--text)]">
        Paint a standard <b>{target.pos}</b> opening range (about <b>{target.pct}%</b> of hands).
      </p>
      <div className="mt-3 flex flex-col items-center gap-2">
        {!checked ? (
          <RangeMatrix value={painted} onChange={setPainted} size={400} />
        ) : (
          <RangeMatrix compare={{ painted, actual }} size={400} />
        )}
        <div className="flex w-full items-center justify-between">
          <RangeLegend mode={checked ? "compare" : "kind"} />
          {checked && (
            <span className="mono text-sm font-bold" style={{ color: acc >= 0.7 ? "var(--good)" : "var(--warn)" }}>
              {fmtPct(acc)} match
            </span>
          )}
        </div>
      </div>
    </Shell>
  );
}
