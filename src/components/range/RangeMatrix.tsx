import { useEffect, useMemo, useRef, useState } from "react";
import type { HandLabel } from "@/types/poker";
import { kindOf, labelAt } from "@/engine/notation";
import { cx } from "@/lib/cx";

interface CompareData {
  painted: Set<HandLabel>;
  actual: Set<HandLabel>;
}

interface RangeMatrixProps {
  value?: Set<HandLabel>;
  onChange?: (next: Set<HandLabel>) => void;
  readOnly?: boolean;
  highlight?: Set<HandLabel>;
  compare?: CompareData;
  size?: number;
}

const GRID: HandLabel[][] = Array.from({ length: 13 }, (_, r) =>
  Array.from({ length: 13 }, (_, c) => labelAt(r, c)),
);

function baseKindClass(label: HandLabel): string {
  switch (kindOf(label)) {
    case "pair":
      return "bg-[var(--combo-pair)]";
    case "suited":
      return "bg-[var(--combo-suited)]";
    default:
      return "bg-[var(--combo-offsuit)]";
  }
}

export function RangeMatrix({
  value,
  onChange,
  readOnly,
  highlight,
  compare,
  size = 520,
}: RangeMatrixProps) {
  const [painting, setPainting] = useState(false);
  const addModeRef = useRef(true);
  const cell = size / 13;
  const font = Math.max(8, cell * 0.32);

  useEffect(() => {
    const up = () => setPainting(false);
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, []);

  const interactive = !readOnly && !compare && !!onChange;

  const apply = (label: HandLabel, add: boolean) => {
    if (!value || !onChange) return;
    if (value.has(label) === add) return;
    const next = new Set(value);
    if (add) next.add(label);
    else next.delete(label);
    onChange(next);
  };

  const colorFor = useMemo(
    () =>
      (label: HandLabel): { className: string; faint?: boolean } => {
        if (compare) {
          const inP = compare.painted.has(label);
          const inA = compare.actual.has(label);
          if (inP && inA) return { className: "bg-good text-ink-900" };
          if (inA && !inP) return { className: "bg-warn text-ink-900" };
          if (inP && !inA) return { className: "bg-chip-red text-white" };
          return { className: "bg-ink-700 text-faint", faint: true };
        }
        if (readOnly) {
          const on = highlight?.has(label);
          return on
            ? { className: cx(baseKindClass(label), "text-white") }
            : { className: "bg-ink-700 text-faint", faint: true };
        }
        const on = value?.has(label);
        return on
          ? { className: cx(baseKindClass(label), "text-white") }
          : { className: "bg-ink-700/70 text-faint hover:bg-ink-600", faint: true };
      },
    [compare, readOnly, highlight, value],
  );

  return (
    <div
      className="select-none touch-none"
      style={{ width: size, maxWidth: "100%", display: "grid", gridTemplateColumns: "repeat(13, 1fr)", gap: 2 }}
    >
      {GRID.flat().map((label) => {
        const { className, faint } = colorFor(label);
        return (
          <div
            key={label}
            onPointerDown={
              interactive
                ? (e) => {
                    e.preventDefault();
                    const add = !(value?.has(label));
                    addModeRef.current = add;
                    setPainting(true);
                    apply(label, add);
                  }
                : undefined
            }
            onPointerEnter={interactive && painting ? () => apply(label, addModeRef.current) : undefined}
            className={cx(
              "flex items-center justify-center rounded-[3px] font-semibold leading-none transition-colors",
              interactive && "cursor-pointer",
              className,
            )}
            style={{ aspectRatio: "1 / 1", fontSize: font, opacity: faint ? 0.92 : 1 }}
            aria-pressed={value?.has(label) || undefined}
          >
            {label}
          </div>
        );
      })}
    </div>
  );
}

export function RangeLegend({ mode = "kind" }: { mode?: "kind" | "compare" }) {
  const items =
    mode === "compare"
      ? [
          { c: "bg-good", t: "Correct" },
          { c: "bg-warn", t: "Missed" },
          { c: "bg-chip-red", t: "Extra" },
        ]
      : [
          { c: "bg-[var(--combo-pair)]", t: "Pairs" },
          { c: "bg-[var(--combo-suited)]", t: "Suited" },
          { c: "bg-[var(--combo-offsuit)]", t: "Offsuit" },
        ];
  return (
    <div className="flex flex-wrap items-center gap-3 text-[0.72rem] text-muted">
      {items.map((i) => (
        <span key={i.t} className="flex items-center gap-1.5">
          <span className={cx("h-3 w-3 rounded-sm", i.c)} />
          {i.t}
        </span>
      ))}
    </div>
  );
}
