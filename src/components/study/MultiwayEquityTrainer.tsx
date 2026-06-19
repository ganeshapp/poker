import { useMemo, useState } from "react";
import type { Card } from "@/types/poker";
import { equityVsField, comboToInts } from "@/engine/equity";
import { cardToInt } from "@/engine/cards";
import { Slider } from "@/components/ui/Slider";
import { PlayingCard } from "@/components/table/PlayingCard";
import { fmtPct } from "@/lib/format";
import { cx } from "@/lib/cx";

interface Scenario {
  name: string;
  hero: [Card, Card];
  board: Card[];
}

const SCENARIOS: Scenario[] = [
  { name: "Two pair (top two)", hero: ["Ah", "Kh"], board: ["Ad", "Kc", "7s"] },
  { name: "Top pair top kicker", hero: ["Ah", "Kd"], board: ["Ac", "9h", "4s"] },
  { name: "A set", hero: ["7h", "7d"], board: ["7s", "Kc", "2d"] },
  { name: "Overpair (QQ)", hero: ["Qh", "Qd"], board: ["9s", "6c", "2d"] },
  { name: "Flush draw", hero: ["Ah", "Kh"], board: ["Qh", "7h", "2s"] },
  { name: "Pocket Aces (pre-flop)", hero: ["Ah", "Ad"], board: [] },
];

export function MultiwayEquityTrainer() {
  const [idx, setIdx] = useState(0);
  const [opp, setOpp] = useState(2);
  const sc = SCENARIOS[idx];

  const series = useMemo(() => {
    const h = comboToInts(sc.hero);
    const b = sc.board.map(cardToInt);
    return [1, 2, 3, 4, 5].map((n) => equityVsField(h, b, n, 1200).equity);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  const cur = series[opp - 1];
  const curColor = cur >= 0.6 ? "var(--good)" : cur >= 0.4 ? "var(--gold)" : "var(--bad)";

  return (
    <div className="space-y-4 rounded-2xl border border-[var(--line)] bg-ink-850 p-5">
      <div className="flex flex-wrap gap-2">
        {SCENARIOS.map((s, i) => (
          <button
            key={s.name}
            onClick={() => setIdx(i)}
            className={cx(
              "rounded-md px-2.5 py-1 text-[0.74rem] font-semibold transition",
              i === idx ? "bg-gold text-ink-900" : "bg-ink-600 text-muted hover:text-[var(--text)]",
            )}
          >
            {s.name}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            {sc.hero.map((c, i) => (
              <PlayingCard key={i} card={c} w={40} />
            ))}
          </div>
          <span className="text-faint">on</span>
          <div className="flex gap-1">
            {sc.board.length ? (
              sc.board.map((c, i) => <PlayingCard key={i} card={c} w={36} />)
            ) : (
              <span className="text-[0.78rem] text-faint">(pre-flop)</span>
            )}
          </div>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm text-muted">Opponents</span>
          <span className="mono text-sm font-semibold text-[var(--text)]">{opp}</span>
        </div>
        <Slider value={opp} min={1} max={5} step={1} onValueChange={setOpp} ariaLabel="Opponents" />
      </div>

      <div className="flex items-end gap-4">
        <div className="text-center">
          <div className="font-display text-4xl font-extrabold" style={{ color: curColor }}>
            {fmtPct(cur)}
          </div>
          <div className="text-[0.66rem] uppercase tracking-wide text-faint">equity vs {opp}</div>
        </div>
        <div className="flex h-[110px] flex-1 items-end gap-2">
          {series.map((e, i) => {
            const n = i + 1;
            const active = n === opp;
            return (
              <button
                key={n}
                onClick={() => setOpp(n)}
                className="flex flex-1 flex-col items-center justify-end gap-1"
                title={`${n} opponent${n > 1 ? "s" : ""}: ${fmtPct(e)}`}
              >
                <span className="mono text-[0.66rem]" style={{ color: active ? "var(--text)" : "var(--text-faint)" }}>
                  {Math.round(e * 100)}%
                </span>
                <div
                  className="w-full rounded-t-sm transition-all"
                  style={{
                    height: `${Math.max(4, e * 90)}px`,
                    background: active ? "var(--gold)" : "var(--ink-500)",
                  }}
                />
                <span className="text-[0.62rem] text-faint">{n}</span>
              </button>
            );
          })}
        </div>
      </div>

      <p className="text-[0.78rem] leading-relaxed text-faint">
        Each extra opponent is another chance someone holds a better hand, so equity falls — fast for
        one-pair hands, more slowly for the nuts. This is why you tighten up and value-bet more carefully
        the more players are in the pot.
      </p>
    </div>
  );
}
