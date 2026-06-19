import { useGame } from "@/store/gameStore";
import { combosInSet } from "@/engine/notation";
import { fmtPct } from "@/lib/format";
import { Modal } from "@/components/ui/Dialog";
import { RangeMatrix, RangeLegend } from "@/components/range/RangeMatrix";

/** Read-only matrix popup used by the coach's "View range" button. */
export function RangeViewModal() {
  const rangeView = useGame((s) => s.rangeView);
  const close = useGame((s) => s.closeRangeView);
  if (!rangeView) return null;
  const set = new Set(rangeView.range);
  return (
    <Modal
      open={!!rangeView}
      onOpenChange={(o) => !o && close()}
      maxWidth={560}
      title={`${rangeView.name}'s assumed range`}
      description="This is the range the coach used for its equity estimate, based on archetype, position and action so far."
    >
      <div className="flex flex-col items-center gap-3">
        <RangeMatrix readOnly highlight={set} size={500} />
        <div className="flex w-full items-center justify-between">
          <RangeLegend />
          <span className="text-[0.72rem] text-faint">
            {combosInSet(set)} combos · {fmtPct(combosInSet(set) / 1326)} of all hands
          </span>
        </div>
      </div>
    </Modal>
  );
}
