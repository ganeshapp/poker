import type { Street } from "@/types/poker";
import { Icon } from "@/components/ui/Icon";
import { fmtBb } from "@/lib/format";

const STREET_LABEL: Record<Street, string> = {
  preflop: "Pre-flop",
  flop: "Flop",
  turn: "Turn",
  river: "River",
  showdown: "Showdown",
};

export function Pot({ pot, bb, street }: { pot: number; bb: number; street: Street }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="text-[0.62rem] font-semibold uppercase tracking-[0.3em] text-white/55">
        {STREET_LABEL[street]}
      </div>
      <div className="flex items-center gap-2 rounded-full border border-gold/30 bg-black/35 px-4 py-1.5 shadow-card backdrop-blur">
        <Icon name="chip" size={16} className="text-gold" />
        <span className="mono text-[0.95rem] font-bold text-gold-light">{fmtBb(pot, bb)} bb</span>
      </div>
    </div>
  );
}
