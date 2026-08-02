import { useGame } from "@/store/gameStore";
import { Seat } from "./Seat";
import { Board } from "./Board";
import { Pot } from "./Pot";

/** Seats on the felt's rim for any table size, hero at bottom center. */
function seatPos(n: number, i: number): { left: string; top: string } {
  const rad = Math.PI / 2 - (2 * Math.PI * i) / n;
  return {
    left: `${(50 + 42 * Math.cos(rad)).toFixed(1)}%`,
    top: `${(48 + 41 * Math.sin(rad)).toFixed(1)}%`,
  };
}

export function PokerTable() {
  const table = useGame((s) => s.table);
  const thinking = useGame((s) => s.thinking);
  const openGuess = useGame((s) => s.openGuess);

  const winners = new Set<number>();
  if (table.phase === "hand-over" && table.summary) {
    for (const pr of table.summary.potResults) for (const w of pr.winners) winners.add(w);
  }

  return (
    <div className="relative mx-auto h-full w-full max-w-[1000px]">
      {/* Felt */}
      <div className="absolute left-1/2 top-1/2 h-[80%] w-[90%] -translate-x-1/2 -translate-y-1/2 rounded-[46%/50%] border-[12px] border-[#241509] felt-surface shadow-table" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[72%] w-[84%] -translate-x-1/2 -translate-y-1/2 rounded-[46%/50%] border border-white/10" />

      {/* Center: pot + board */}
      <div className="absolute left-1/2 top-[39%] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3">
        <Pot pot={table.pot} bb={table.bigBlind} street={table.street} />
        <Board cards={table.board} />
        <div className="h-5">
          {thinking && (
            <div className="flex items-center gap-2 text-[0.66rem] font-medium uppercase tracking-[0.25em] text-white/55">
              <span className="h-3.5 w-3.5 animate-[spin_0.9s_linear_infinite] rounded-full border-2 border-white/25 border-t-gold" />
              dealing
            </div>
          )}
        </div>
      </div>

      {/* Seats */}
      {table.players.map((p) => {
        const canGuess = table.phase === "betting" && !p.isHero && !p.hasFolded && !!p.hole;
        return (
          <div
            key={p.id}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={seatPos(table.players.length, p.id)}
          >
            <Seat
              player={p}
              bb={table.bigBlind}
              isCurrent={table.phase === "betting" && table.toAct === p.id}
              isButton={table.button === p.id}
              isWinner={winners.has(p.id)}
              canGuess={canGuess}
              onGuess={openGuess}
            />
          </div>
        );
      })}
    </div>
  );
}
