import { useState } from "react";
import type { Card, HandLabel } from "@/types/poker";
import { RANKS_DESC, SUITS } from "@/types/poker";
import { labelToCombos } from "@/engine/notation";
import { cardToInt, SUIT_SYMBOL, isRedSuit } from "@/engine/cards";
import { equityRangeVsRange, comboToInts, type EquityResult } from "@/engine/equity";
import { allLabels } from "@/engine/notation";
import { RangeMatrix, RangeLegend } from "@/components/range/RangeMatrix";
import { Button } from "@/components/ui/controls";
import { Icon } from "@/components/ui/Icon";
import { fmtPct } from "@/lib/format";
import { cx } from "@/lib/cx";

const ALL = allLabels();

function expand(range: Set<HandLabel>, board: Card[]): [number, number][] {
  const blocked = new Set<Card>(board);
  const out: [number, number][] = [];
  for (const lab of range) {
    for (const [a, b] of labelToCombos(lab)) {
      if (blocked.has(a) || blocked.has(b)) continue;
      out.push(comboToInts([a, b]));
    }
  }
  return out;
}

export function EquityCalculator() {
  const [hero, setHero] = useState<Set<HandLabel>>(new Set());
  const [vill, setVill] = useState<Set<HandLabel>>(new Set());
  const [board, setBoard] = useState<Card[]>([]);
  const [result, setResult] = useState<EquityResult | null>(null);
  const [busy, setBusy] = useState(false);

  const toggleCard = (c: Card) => {
    setBoard((b) => (b.includes(c) ? b.filter((x) => x !== c) : b.length < 5 ? [...b, c] : b));
    setResult(null);
  };

  const run = () => {
    const heroCombos = expand(hero, board);
    const villCombos = expand(vill, board);
    if (!heroCombos.length || !villCombos.length) return;
    setBusy(true);
    // defer so the button shows its busy state before the (sync) sim runs
    setTimeout(() => {
      const boardInts = board.map(cardToInt);
      setResult(equityRangeVsRange(heroCombos, boardInts, villCombos, 5000));
      setBusy(false);
    }, 10);
  };

  const heroEq = result ? result.equity : null;

  return (
    <div className="space-y-4 rounded-2xl border border-[var(--line)] bg-ink-850 p-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="flex flex-col items-center gap-2">
          <div className="self-start text-sm font-semibold text-[var(--text)]">Your range</div>
          <RangeMatrix value={hero} onChange={(s) => { setHero(s); setResult(null); }} size={320} />
          <div className="flex w-full items-center justify-between text-[0.72rem] text-faint">
            <button className="hover:text-[var(--text)]" onClick={() => { setHero(new Set(ALL)); setResult(null); }}>Any two</button>
            <button className="hover:text-[var(--text)]" onClick={() => { setHero(new Set()); setResult(null); }}>Clear</button>
          </div>
        </div>
        <div className="flex flex-col items-center gap-2">
          <div className="self-start text-sm font-semibold text-[var(--text)]">Villain range</div>
          <RangeMatrix value={vill} onChange={(s) => { setVill(s); setResult(null); }} size={320} />
          <div className="flex w-full items-center justify-between text-[0.72rem] text-faint">
            <button className="hover:text-[var(--text)]" onClick={() => { setVill(new Set(ALL)); setResult(null); }}>Any two</button>
            <button className="hover:text-[var(--text)]" onClick={() => { setVill(new Set()); setResult(null); }}>Clear</button>
          </div>
        </div>
      </div>

      <RangeLegend />

      {/* Board */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-sm font-semibold text-[var(--text)]">Board ({board.length}/5)</span>
          {board.length > 0 && (
            <button className="text-[0.72rem] text-faint hover:text-[var(--text)]" onClick={() => { setBoard([]); setResult(null); }}>
              Clear board
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {RANKS_DESC.flatMap((r) =>
            SUITS.map((s) => {
              const c = (r + s) as Card;
              const on = board.includes(c);
              return (
                <button
                  key={c}
                  onClick={() => toggleCard(c)}
                  disabled={!on && board.length >= 5}
                  className={cx(
                    "h-7 w-7 rounded text-[0.72rem] font-bold transition disabled:opacity-30",
                    on ? "bg-gold text-ink-900" : "bg-ink-700 hover:bg-ink-600",
                  )}
                  style={!on ? { color: isRedSuit(s) ? "var(--suit-red)" : "var(--text)" } : undefined}
                >
                  {r === "T" ? "10" : r}
                  {SUIT_SYMBOL[s]}
                </button>
              );
            }),
          )}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[0.74rem] text-faint">
          {expand(hero, board).length} vs {expand(vill, board).length} combos
        </span>
        <Button onClick={run} disabled={hero.size === 0 || vill.size === 0 || busy}>
          {busy ? "Calculating…" : "Calculate equity"} <Icon name="target" size={15} />
        </Button>
      </div>

      {heroEq !== null && result && (
        <div className="animate-fade-up rounded-xl border border-[var(--line)] bg-ink-800 p-4">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-semibold text-[var(--text)]">Your equity</span>
            <span className="mono text-lg font-extrabold text-gold-light">{fmtPct(heroEq)}</span>
          </div>
          <div className="flex h-3 overflow-hidden rounded-full bg-ink-600">
            <div className="h-full bg-good" style={{ width: `${(result.win / result.samples) * 100}%` }} />
            <div className="h-full bg-warn" style={{ width: `${(result.tie / result.samples) * 100}%` }} />
            <div className="h-full bg-bad" style={{ width: `${(result.lose / result.samples) * 100}%` }} />
          </div>
          <div className="mt-2 flex gap-4 text-[0.74rem] text-muted">
            <span><span className="text-good">Win</span> {fmtPct(result.win / result.samples)}</span>
            <span><span className="text-warn">Tie</span> {fmtPct(result.tie / result.samples)}</span>
            <span><span className="text-bad">Lose</span> {fmtPct(result.lose / result.samples)}</span>
            <span className="ml-auto text-faint">{result.samples.toLocaleString()} trials</span>
          </div>
        </div>
      )}
    </div>
  );
}
