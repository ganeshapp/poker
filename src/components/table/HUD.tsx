import type { Player } from "@/types/poker";
import { ARCHETYPES } from "@/game/archetypes";
import { Tooltip } from "@/components/ui/Tooltip";

/** Compact stats overlay shown under each bot — teaches reading a HUD. */
export function HUD({ player }: { player: Player }) {
  if (!player.archetype) return null;
  const cfg = ARCHETYPES[player.archetype];
  return (
    <Tooltip
      side="bottom"
      content={
        <div className="space-y-1">
          <div className="font-semibold text-gold-light">
            {cfg.name} ({cfg.archetype})
          </div>
          <div className="text-muted">{cfg.blurb}</div>
          <div className="pt-1 text-[0.7rem] text-faint">
            VPIP = how often they play a hand · PFR = how often they raise pre-flop.
          </div>
        </div>
      }
    >
      <div className="flex cursor-help items-center gap-1.5 rounded-md border border-[var(--line)] bg-black/45 px-1.5 py-0.5 backdrop-blur">
        <span className="h-2 w-2 rounded-full" style={{ background: cfg.color }} />
        <span className="mono text-[0.62rem] font-semibold text-white/85">
          {cfg.vpip}
          <span className="text-white/40">/</span>
          {cfg.pfr}
        </span>
      </div>
    </Tooltip>
  );
}
