import { useEffect, useMemo, useState } from "react";
import type { HHHand } from "@/game/handHistory";
import { buildReplayFrames } from "@/game/handHistory";
import { Modal } from "@/components/ui/Dialog";
import { Board } from "@/components/table/Board";
import { Pot } from "@/components/table/Pot";
import { PlayingCard } from "@/components/table/PlayingCard";
import { Slider } from "@/components/ui/Slider";
import { Icon } from "@/components/ui/Icon";
import { fmtBb } from "@/lib/format";
import { cx } from "@/lib/cx";

const SEAT_POS = [
  { left: "50%", top: "86%" },
  { left: "90%", top: "60%" },
  { left: "90%", top: "16%" },
  { left: "50%", top: "5%" },
  { left: "10%", top: "16%" },
  { left: "10%", top: "60%" },
];

export function HandReplayModal({ hand, onClose }: { hand: HHHand | null; onClose: () => void }) {
  const frames = useMemo(() => (hand ? buildReplayFrames(hand) : []), [hand]);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    setIdx(hand ? buildReplayFrames(hand).length - 1 : 0);
  }, [hand]);

  if (!hand) return null;
  const last = frames.length - 1;
  const frame = frames[Math.min(idx, last)] ?? frames[0];
  const hero = hand.seats.find((s) => s.isHero) ?? hand.seats[0];
  const ordered = [hero, ...hand.seats.filter((s) => !s.isHero)];

  return (
    <Modal open={!!hand} onOpenChange={(o) => !o && onClose()} maxWidth={760} title={`Hand #${hand.id} replay`} description={frame.text}>
      <div className="relative mx-auto h-[330px] w-full">
        <div className="absolute left-1/2 top-1/2 h-[80%] w-[90%] -translate-x-1/2 -translate-y-1/2 rounded-[46%/50%] border-[9px] border-[#241509] felt-surface shadow-table" />
        <div className="absolute left-1/2 top-[40%] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2">
          <Pot pot={frame.pot} bb={hand.bb} street={frame.street} />
          <Board cards={frame.board} w={44} />
        </div>

        {ordered.map((s, i) => {
          const folded = frame.folded.includes(s.seat);
          const hole = hand.holes[s.seat];
          const showHole = hole && (s.isHero || (frame.revealAll && !folded));
          return (
            <div
              key={s.seat}
              className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
              style={{ left: SEAT_POS[i].left, top: SEAT_POS[i].top }}
            >
              <div className={cx("flex gap-0.5", folded && "opacity-25 grayscale")}>
                {showHole ? (
                  <>
                    <PlayingCard card={hole[0]} w={s.isHero ? 34 : 24} />
                    <PlayingCard card={hole[1]} w={s.isHero ? 34 : 24} />
                  </>
                ) : (
                  !folded && (
                    <>
                      <PlayingCard faceDown w={24} />
                      <PlayingCard faceDown w={24} />
                    </>
                  )
                )}
              </div>
              <div className={cx("w-[88px] rounded-lg px-2 py-1 text-center backdrop-blur", s.isHero ? "bg-ink-800/90 ring-2 ring-gold" : "bg-ink-800/80 ring-1 ring-[var(--line)]", folded && "opacity-50")}>
                <div className="text-[0.7rem] font-bold text-[var(--text)]">{s.position}</div>
                <div className="mono text-[0.62rem] text-gold-light/90">{fmtBb(s.stack, hand.bb)} bb</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button onClick={() => setIdx(0)} disabled={idx === 0} className="grid h-8 w-8 place-items-center rounded-lg bg-ink-600 text-muted disabled:opacity-40 hover:text-[var(--text)]">
          <Icon name="chevron-right" size={14} className="rotate-180" />
        </button>
        <button onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0} className="grid h-8 w-8 place-items-center rounded-lg bg-ink-600 text-muted disabled:opacity-40 hover:text-[var(--text)]">
          <Icon name="chevron-right" size={15} className="rotate-180" />
        </button>
        <Slider value={Math.min(idx, last)} min={0} max={last} step={1} onValueChange={setIdx} ariaLabel="Replay step" className="flex-1" />
        <button onClick={() => setIdx((i) => Math.min(last, i + 1))} disabled={idx >= last} className="grid h-8 w-8 place-items-center rounded-lg bg-ink-600 text-muted disabled:opacity-40 hover:text-[var(--text)]">
          <Icon name="chevron-right" size={15} />
        </button>
        <button onClick={() => setIdx(last)} disabled={idx >= last} className="grid h-8 w-8 place-items-center rounded-lg bg-ink-600 text-muted disabled:opacity-40 hover:text-[var(--text)]">
          <Icon name="chevron-right" size={14} />
        </button>
      </div>
    </Modal>
  );
}
