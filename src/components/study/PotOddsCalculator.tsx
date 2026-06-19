import { useState, type ReactNode } from "react";
import { Slider } from "@/components/ui/Slider";
import { fmtPct, fmtSigned } from "@/lib/format";

/** Interactive pot-odds / break-even / EV teaching widget. */
export function PotOddsCalculator() {
  const [pot, setPot] = useState(10);
  const [bet, setBet] = useState(6.5);
  const [eq, setEq] = useState(50);

  const toWin = pot + bet;
  const finalPot = pot + 2 * bet;
  const breakEven = bet / finalPot;
  const ratio = bet > 0 ? toWin / bet : 0;
  const ev = (eq / 100) * finalPot - bet; // EV of calling, in bb
  const call = ev > 0.02;

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-ink-850 p-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Pot before the bet" value={`${pot} bb`}>
          <Slider value={pot} min={1} max={60} step={1} onValueChange={setPot} ariaLabel="Pot" />
        </Field>
        <Field label="Villain's bet" value={`${bet} bb`}>
          <Slider value={bet} min={0.5} max={60} step={0.5} onValueChange={setBet} ariaLabel="Bet" />
        </Field>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3 text-center">
        <Result label="You risk" value={`${bet} bb`} />
        <Result label="To win" value={`${toWin.toFixed(1)} bb`} />
        <Result label="Getting" value={`${ratio.toFixed(1)} : 1`} />
      </div>

      <div className="mt-4 rounded-xl bg-gold/10 p-4 text-center">
        <div className="text-[0.7rem] uppercase tracking-wide text-gold/80">Break-even equity</div>
        <div className="font-display text-3xl font-extrabold text-gold-light">{fmtPct(breakEven)}</div>
        <p className="mt-1 text-[0.78rem] text-muted">
          = your call ({bet}) ÷ final pot ({finalPot.toFixed(1)}). Call when your equity beats this.
        </p>
      </div>

      {/* Plug in your own equity estimate and watch EV flip */}
      <div className="mt-5">
        <Field label="Your equity estimate" value={`${eq}%`}>
          <Slider value={eq} min={0} max={100} step={1} onValueChange={setEq} ariaLabel="Your equity" />
        </Field>
        <div
          className="mt-3 flex items-center justify-between rounded-xl border p-4"
          style={{
            borderColor: call ? "var(--good)" : "var(--bad)",
            background: call ? "rgba(63,191,127,0.1)" : "rgba(236,90,90,0.1)",
          }}
        >
          <div>
            <div className="text-[0.7rem] uppercase tracking-wide text-muted">EV of calling</div>
            <div className="mono text-2xl font-extrabold" style={{ color: call ? "var(--good)" : "var(--bad)" }}>
              {fmtSigned(ev)} bb
            </div>
            <div className="mt-0.5 text-[0.72rem] text-faint">
              {eq}% × {finalPot.toFixed(1)} − {bet} = {ev.toFixed(1)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[0.7rem] uppercase tracking-wide text-muted">Decision</div>
            <div className="font-display text-xl font-bold" style={{ color: call ? "var(--good)" : "var(--bad)" }}>
              {call ? "Call" : "Fold"}
            </div>
          </div>
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

function Result({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-ink-800 px-2 py-3">
      <div className="text-[0.62rem] uppercase tracking-wide text-faint">{label}</div>
      <div className="mono text-base font-bold text-[var(--text)]">{value}</div>
    </div>
  );
}
