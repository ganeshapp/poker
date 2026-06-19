import * as RS from "@radix-ui/react-slider";
import { cx } from "@/lib/cx";

interface SliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onValueChange: (v: number) => void;
  className?: string;
  ariaLabel?: string;
}

export function Slider({ value, min, max, step = 1, onValueChange, className, ariaLabel }: SliderProps) {
  const safeMax = Math.max(min, max);
  return (
    <RS.Root
      className={cx("relative flex h-5 w-full touch-none select-none items-center", className)}
      value={[Math.min(safeMax, Math.max(min, value))]}
      min={min}
      max={safeMax}
      step={step}
      onValueChange={(v) => onValueChange(v[0])}
    >
      <RS.Track className="relative h-1.5 grow rounded-full bg-ink-500">
        <RS.Range className="absolute h-full rounded-full bg-gold" />
      </RS.Track>
      <RS.Thumb
        aria-label={ariaLabel ?? "Value"}
        className="block h-4 w-4 rounded-full border-2 border-ink-900 bg-gold shadow-card outline-none transition focus:shadow-[var(--glow-gold)]"
      />
    </RS.Root>
  );
}
