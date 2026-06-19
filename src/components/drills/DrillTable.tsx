import { useDrills } from "@/store/drillStore";
import { Board } from "@/components/table/Board";
import { Pot } from "@/components/table/Pot";
import { PlayingCard } from "@/components/table/PlayingCard";
import { cx } from "@/lib/cx";

const SEAT_POS = [
  { left: "50%", top: "85%" }, // hero
  { left: "89%", top: "60%" },
  { left: "89%", top: "18%" },
  { left: "50%", top: "7%" },
  { left: "11%", top: "18%" },
  { left: "11%", top: "60%" },
];

export function DrillTable() {
  const puzzle = useDrills((s) => s.puzzle);
  const navIndex = useDrills((s) => s.navIndex);
  const frame = puzzle.frames[navIndex] ?? puzzle.frames[puzzle.frames.length - 1];

  const hero = puzzle.seats.find((s) => s.isHero)!;
  const others = puzzle.seats.filter((s) => !s.isHero);
  const ordered = [hero, ...others];

  return (
    <div className="relative mx-auto h-full w-full max-w-[720px]">
      <div className="absolute left-1/2 top-1/2 h-[78%] w-[88%] -translate-x-1/2 -translate-y-1/2 rounded-[46%/50%] border-[10px] border-[#241509] felt-surface shadow-table" />

      <div className="absolute left-1/2 top-[40%] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3">
        <Pot pot={frame.pot} bb={puzzle.bb} street={frame.street} />
        <Board cards={frame.board} w={48} />
      </div>

      {ordered.map((s, i) => (
        <div
          key={s.pos}
          className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5"
          style={{ left: SEAT_POS[i].left, top: SEAT_POS[i].top }}
        >
          {s.isHero ? (
            <div className="flex gap-1">
              <PlayingCard card={puzzle.hole[0]} w={42} />
              <PlayingCard card={puzzle.hole[1]} w={42} />
            </div>
          ) : (
            <div className={cx("flex gap-0.5", s.folded && "opacity-25 grayscale")}>
              <PlayingCard faceDown w={26} />
              <PlayingCard faceDown w={26} />
            </div>
          )}
          <div
            className={cx(
              "w-[92px] rounded-xl px-2 py-1.5 text-center backdrop-blur transition",
              s.isHero ? "bg-ink-800/90 ring-2 ring-gold" : "bg-ink-800/80 ring-1 ring-[var(--line)]",
              s.folded && "opacity-50",
            )}
          >
            <div className="font-display text-sm font-bold text-[var(--text)]">{s.pos}</div>
            <div
              className={cx(
                "text-[0.62rem] font-semibold uppercase tracking-wide",
                s.isHero ? "text-gold" : s.folded ? "text-faint" : "text-info/80",
              )}
            >
              {s.isHero ? "You" : s.folded ? "Folded" : "In hand"}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
