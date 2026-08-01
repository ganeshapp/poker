import type { Player } from "@/types/poker";
import { ARCHETYPES } from "@/game/archetypes";
import { Tooltip } from "@/components/ui/Tooltip";

/** Minimum observed hands before the HUD shows numbers — reads must be
    earned from what you've actually seen this session. */
const MIN_SAMPLE = 8;

/** Compact stats overlay shown under each bot — teaches reading a HUD. */
export function HUD({ player }: { player: Player }) {
  if (!player.archetype) return null;
  const cfg = ARCHETYPES[player.archetype];
  const n = player.handsSeen;
  const enough = n >= MIN_SAMPLE;
  const vpip = enough ? Math.round((player.vpipCount / n) * 100) : null;
  const pfr = enough ? Math.round((player.pfrCount / n) * 100) : null;
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
            {enough
              ? `Observed over ${n} hands this session — VPIP = how often they put money in pre-flop, PFR = how often they raise. Each player's exact numbers vary, so watch them settle.`
              : `Stats appear after ${MIN_SAMPLE} observed hands (${n} so far) — reads are earned, not given.`}
          </div>
        </div>
      }
    >
      <div className="flex cursor-help items-center gap-1.5 rounded-md border border-[var(--line)] bg-black/45 px-1.5 py-0.5 backdrop-blur">
        <span className="h-2 w-2 rounded-full" style={{ background: cfg.color }} />
        <span className="mono text-[0.62rem] font-semibold text-white/85">
          {vpip != null && pfr != null ? (
            <>
              {vpip}
              <span className="text-white/40">/</span>
              {pfr}
              <span className="ml-1 text-white/35">{n}h</span>
            </>
          ) : (
            <span className="text-white/45">–/– · {n}h</span>
          )}
        </span>
      </div>
    </Tooltip>
  );
}
