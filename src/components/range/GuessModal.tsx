import { useEffect, useState } from "react";
import type { HandLabel } from "@/types/poker";
import { useGame } from "@/store/gameStore";
import { ARCHETYPES } from "@/game/archetypes";
import { combosInSet } from "@/engine/notation";
import { fmtPct } from "@/lib/format";
import { Modal } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/controls";
import { Icon } from "@/components/ui/Icon";
import { PlayingCard } from "@/components/table/PlayingCard";
import { RangeMatrix, RangeLegend } from "./RangeMatrix";

function grade(acc: number): { label: string; color: string } {
  if (acc >= 0.8) return { label: "Sharp read", color: "var(--good)" };
  if (acc >= 0.6) return { label: "Solid", color: "var(--gold)" };
  if (acc >= 0.4) return { label: "Rough", color: "var(--warn)" };
  return { label: "Way off", color: "var(--bad)" };
}

export function GuessModal() {
  const guess = useGame((s) => s.guess);
  const table = useGame((s) => s.table);
  const peek = useGame((s) => s.peek);
  const closeGuess = useGame((s) => s.closeGuess);
  const [painted, setPainted] = useState<Set<HandLabel>>(new Set());

  useEffect(() => {
    if (guess?.open) setPainted(new Set());
  }, [guess?.open, guess?.botId, guess?.street]);

  if (!guess) return null;
  const bot = table.players[guess.botId];
  const cfg = bot.archetype ? ARCHETYPES[bot.archetype] : null;
  const revealed = guess.revealed;
  const actual = new Set(guess.actualRange);

  return (
    <Modal
      open={guess.open}
      onOpenChange={(o) => !o && closeGuess()}
      maxWidth={620}
      title={
        <span className="flex items-center gap-2">
          <Icon name="eye" size={20} className="text-gold" /> Read {bot.name}'s range
        </span>
      }
      description={
        <>
          {bot.position} · {cfg ? `${cfg.name} (${cfg.archetype})` : "Player"} ·{" "}
          {guess.street[0].toUpperCase() + guess.street.slice(1)}. Optionally paint your guess, or just
          peek to study their range.
        </>
      }
    >
      <div className="flex flex-col items-center gap-4">
        {!revealed ? (
          <RangeMatrix value={painted} onChange={setPainted} size={520} />
        ) : (
          <RangeMatrix compare={guess.scored ? { painted, actual } : undefined} highlight={guess.scored ? undefined : actual} readOnly={!guess.scored} size={520} />
        )}

        <div className="flex w-full items-center justify-between">
          <RangeLegend mode={revealed && guess.scored ? "compare" : "kind"} />
          <span className="text-[0.72rem] text-faint">
            {revealed ? `Their range: ${combosInSet(actual)} combos` : `${combosInSet(painted)} combos selected`}
          </span>
        </div>

        {!revealed ? (
          <div className="flex w-full items-center justify-between gap-2">
            <span className="text-[0.72rem] text-faint">Guessing is optional — peek any time.</span>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setPainted(new Set())} disabled={painted.size === 0}>
                Clear
              </Button>
              <Button onClick={() => peek([...painted])}>
                <Icon name="eye" size={16} /> {painted.size > 0 ? "Peek & score" : "Peek"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex w-full items-center justify-between gap-4 rounded-xl border border-[var(--line)] bg-ink-850 p-4">
            {guess.scored ? (
              <div className="flex items-center gap-4">
                <div className="text-center">
                  <div className="font-display text-3xl font-extrabold" style={{ color: grade(guess.accuracy ?? 0).color }}>
                    {fmtPct(guess.accuracy ?? 0)}
                  </div>
                  <div className="text-[0.66rem] font-semibold uppercase tracking-wide" style={{ color: grade(guess.accuracy ?? 0).color }}>
                    {grade(guess.accuracy ?? 0).label}
                  </div>
                </div>
                <div className="text-[0.72rem] text-muted">
                  <div>Coverage (recall): {fmtPct(guess.recall ?? 0)}</div>
                  <div>Precision: {fmtPct(guess.precision ?? 0)}</div>
                </div>
              </div>
            ) : (
              <div className="text-[0.8rem] text-muted">
                Here's {bot.name}'s assumed range. Paint a guess first next time for an accuracy score.
              </div>
            )}
            <div className="flex items-center gap-3">
              <div className="text-right text-[0.72rem] text-muted">Actually held</div>
              {guess.botHole && (
                <div className="flex gap-1">
                  <PlayingCard card={guess.botHole[0]} w={40} />
                  <PlayingCard card={guess.botHole[1]} w={40} />
                </div>
              )}
              <Button onClick={closeGuess}>Continue</Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
