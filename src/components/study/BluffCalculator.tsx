import { useState, type ReactNode } from "react";
import { Slider } from "@/components/ui/Slider";
import { fmtPct } from "@/lib/format";

/** How often a pure bluff must work, and the price it lays a caller. */
export function BluffCalculator() {
  const [pot, setPot] = useState(10);
  const [bet, setBet] = useState(7);

  const foldNeeded = bet / (bet + pot); // pure-bluff break-even fold frequency
  const callerNeeds = bet / (pot + 2 * bet); // equity the caller is being laid

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-ink-850 p-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Pot" value={`${pot} bb`}>
          <Slider value={pot} min={1} max={60} step={1} onValueChange={setPot} ariaLabel="Pot" />
        </Field>
        <Field label="Your bet" value={`${bet} bb (${fmtPct(bet / pot)} pot)`}>
          <Slider value={bet} min={0.5} max={90} step={0.5} onValueChange={setBet} ariaLabel="Bet" />
        </Field>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-gold/10 p-4 text-center">
          <div className="text-[0.7rem] uppercase tracking-wide text-gold/80">Villain must fold</div>
          <div className="font-display text-3xl font-extrabold text-gold-light">{fmtPct(foldNeeded)}</div>
          <div className="mt-1 text-[0.74rem] text-muted">for a pure bluff to break even</div>
        </div>
        <div className="rounded-xl border border-[var(--line)] bg-ink-800 p-4 text-center">
          <div className="text-[0.7rem] uppercase tracking-wide text-faint">You're laying a caller</div>
          <div className="font-display text-3xl font-extrabold text-[var(--text)]">{fmtPct(callerNeeds)}</div>
          <div className="mt-1 text-[0.74rem] text-muted">the equity they need to call</div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, children }: { label: string; value: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm text-muted">{label}</span>
        <span className="mono text-sm font-semibold text-[var(--text)]">{value}</span>
      </div>
      {children}
    </div>
  );
}
