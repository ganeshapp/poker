import type { Player } from "@/types/poker";
import { cx } from "@/lib/cx";
import { fmtBb } from "@/lib/format";
import { ARCHETYPES } from "@/game/archetypes";
import { PlayingCard } from "./PlayingCard";
import { HUD } from "./HUD";
import { Icon } from "@/components/ui/Icon";

interface SeatProps {
  player: Player;
  bb: number;
  isCurrent: boolean;
  isButton: boolean;
  isWinner: boolean;
  canGuess: boolean;
  onGuess: (id: number) => void;
}

function actionTone(label?: string): string {
  switch (label) {
    case "Raise":
    case "Bet":
      return "text-gold";
    case "All-In":
      return "text-chip-red";
    case "Call":
      return "text-info";
    case "Fold":
      return "text-faint";
    default:
      return "text-muted";
  }
}

export function Seat({ player, bb, isCurrent, isButton, isWinner, canGuess, onGuess }: SeatProps) {
  const showHole = player.isHero || player.revealed;
  const color = player.isHero ? "var(--gold)" : player.archetype ? ARCHETYPES[player.archetype].color : "#888";
  const holeW = player.isHero ? 46 : 36;
  const initial = player.isHero ? "Y" : player.name[0];

  return (
    <div className="flex flex-col items-center gap-1.5">
      {/* Hole cards */}
      <div className={cx("flex gap-1 transition", player.hasFolded && "opacity-30 grayscale")}>
        {player.hole ? (
          <>
            <PlayingCard card={showHole ? player.hole[0] : null} faceDown={!showHole} w={holeW} />
            <PlayingCard card={showHole ? player.hole[1] : null} faceDown={!showHole} w={holeW} />
          </>
        ) : (
          <div style={{ height: Math.round(holeW * 1.4) }} />
        )}
      </div>

      {/* Plate */}
      <div
        className={cx(
          "relative w-[128px] rounded-2xl bg-ink-800/90 px-3 py-2 backdrop-blur transition",
          isCurrent ? "ring-2 ring-gold animate-pulse-ring" : "ring-1 ring-[var(--line)]",
          isWinner && "ring-2 ring-good",
          player.hasFolded && "opacity-55",
        )}
      >
        {canGuess && (
          <button
            onClick={() => onGuess(player.id)}
            title={`Guess ${player.name}'s range`}
            className="absolute -right-2 -top-2 z-10 grid h-7 w-7 place-items-center rounded-full border border-gold/50 bg-ink-700 text-gold shadow-card transition hover:bg-gold hover:text-ink-900"
          >
            <Icon name="eye" size={15} />
          </button>
        )}

        <div className="flex items-center gap-2">
          <div
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full font-display text-sm font-bold"
            style={{ background: `${color}22`, color, border: `1.5px solid ${color}66` }}
          >
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[0.8rem] font-semibold text-[var(--text)]">{player.name}</span>
              <span className="rounded bg-white/8 px-1 text-[0.58rem] font-semibold uppercase tracking-wide text-muted">
                {player.position}
              </span>
            </div>
            <div className="mono text-[0.72rem] text-gold-light/90">
              {fmtBb(player.stack, bb)} <span className="text-faint">bb</span>
            </div>
          </div>
          {isButton && (
            <div className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white text-[0.6rem] font-extrabold text-ink-900 shadow">
              D
            </div>
          )}
        </div>

        <div className="mt-1.5 flex items-center justify-between gap-2">
          {player.archetype ? <HUD player={player} /> : <span className="text-[0.62rem] font-semibold text-gold/70">HERO</span>}
          {player.lastAction && (
            <span className={cx("text-[0.66rem] font-semibold", actionTone(player.lastAction.label))}>
              {player.lastAction.label}
            </span>
          )}
        </div>
      </div>

      {/* Current-street bet */}
      <div className="h-5">
        {player.committed > 0 && (
          <div className="animate-fade-up rounded-full border border-gold/25 bg-black/40 px-2 py-0.5 mono text-[0.66rem] font-semibold text-gold-light">
            {fmtBb(player.committed, bb)} bb
          </div>
        )}
      </div>
    </div>
  );
}
