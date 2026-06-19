import type { ReactNode } from "react";
import { useDrills } from "@/store/drillStore";
import { cx } from "@/lib/cx";
import { Icon } from "@/components/ui/Icon";

export function MoveNavigator() {
  const puzzle = useDrills((s) => s.puzzle);
  const navIndex = useDrills((s) => s.navIndex);
  const setNav = useDrills((s) => s.setNav);
  const last = puzzle.frames.length - 1;

  const Btn = ({ onClick, disabled, children, label }: { onClick: () => void; disabled: boolean; children: ReactNode; label: string }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="grid h-8 w-8 place-items-center rounded-lg bg-ink-600 text-muted transition hover:bg-ink-500 hover:text-[var(--text)] disabled:opacity-40"
    >
      {children}
    </button>
  );

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-ink-800/70 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[0.7rem] font-semibold uppercase tracking-wide text-muted">Hand replay</span>
        <div className="flex gap-1">
          <Btn onClick={() => setNav(0)} disabled={navIndex === 0} label="First">
            <Icon name="chevron-right" size={14} className="rotate-180" />
            <Icon name="chevron-right" size={14} className="-ml-2.5 rotate-180" />
          </Btn>
          <Btn onClick={() => setNav(navIndex - 1)} disabled={navIndex === 0} label="Previous">
            <Icon name="chevron-right" size={15} className="rotate-180" />
          </Btn>
          <Btn onClick={() => setNav(navIndex + 1)} disabled={navIndex === last} label="Next">
            <Icon name="chevron-right" size={15} />
          </Btn>
          <Btn onClick={() => setNav(last)} disabled={navIndex === last} label="Decision">
            <Icon name="chevron-right" size={14} />
            <Icon name="chevron-right" size={14} className="-ml-2.5" />
          </Btn>
        </div>
      </div>

      <div className="max-h-[150px] space-y-1 overflow-auto pr-1">
        {puzzle.frames.map((f, i) => (
          <button
            key={i}
            onClick={() => setNav(i)}
            className={cx(
              "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[0.78rem] transition",
              i === navIndex ? "bg-gold/15 text-[var(--text)]" : "text-muted hover:bg-white/5",
              i === last && "font-semibold",
            )}
          >
            <span className="mono text-[0.62rem] text-faint">{i + 1}</span>
            <span className="flex-1">{f.text}</span>
            {i === last && <Icon name="target" size={13} className="text-gold" />}
          </button>
        ))}
      </div>
    </div>
  );
}
