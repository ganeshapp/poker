import { useGame } from "@/store/gameStore";
import { fmtSigned } from "@/lib/format";
import { Button } from "@/components/ui/controls";
import { Icon } from "@/components/ui/Icon";

export function ResultOverlay() {
  const table = useGame((s) => s.table);
  const deal = useGame((s) => s.deal);
  if (table.phase !== "hand-over" || !table.summary) return null;

  const s = table.summary;
  const bb = table.bigBlind;
  const netBb = s.heroNetChips / bb;
  const won = s.potResults.some((pr) => pr.winners.includes(0));
  const mainWinners = s.potResults[0]?.winners ?? [];
  const winnerNames = mainWinners.map((id) => table.players[id].name).join(", ");
  const winnerHand = s.showdown.find((e) => mainWinners.includes(e.playerId))?.hand;

  const color = netBb > 0.01 ? "var(--good)" : netBb < -0.01 ? "var(--bad)" : "var(--text-muted)";

  return (
    <div className="pointer-events-none absolute inset-x-0 top-[44%] flex -translate-y-1/2 justify-center">
      <div className="pointer-events-auto flex animate-pop items-center gap-4 rounded-2xl border border-[var(--line-strong)] bg-ink-850/95 px-5 py-3 shadow-[var(--sh-pop)] backdrop-blur">
        <div className="text-center">
          <div className="font-display text-2xl font-extrabold" style={{ color }}>
            {fmtSigned(netBb)} bb
          </div>
          <div className="text-[0.66rem] uppercase tracking-wide text-muted">
            {won ? "You won the pot" : "Hand over"}
          </div>
        </div>
        <div className="max-w-[220px] text-[0.78rem] text-muted">
          <span className="font-semibold text-[var(--text)]">{winnerNames}</span>
          {winnerHand ? ` wins with ${winnerHand.name.toLowerCase()}.` : " takes it down."}
        </div>
        <Button onClick={deal}>
          Next <Icon name="arrow-right" size={15} />
        </Button>
      </div>
    </div>
  );
}
