import { useEffect, useState } from "react";
import { useGame } from "@/store/gameStore";
import { legalActions } from "@/game/engine";
import { cardsToLabel } from "@/engine/notation";
import { fmtBb, fmtPct } from "@/lib/format";
import { Button } from "@/components/ui/controls";
import { Slider } from "@/components/ui/Slider";
import { Icon } from "@/components/ui/Icon";
import { PlayingCard } from "./PlayingCard";

const clamp = (x: number, lo: number, hi: number) => Math.round(Math.max(lo, Math.min(hi, x)));

export function ActionBar() {
  const table = useGame((s) => s.table);
  const heroAction = useGame((s) => s.heroAction);
  const deal = useGame((s) => s.deal);
  const stepBot = useGame((s) => s.stepBot);
  const explain = useGame((s) => s.explainLastBotMove);
  const newSession = useGame((s) => s.newSession);
  const settings = useGame((s) => s.settings);
  const session = useGame((s) => s.session);
  const paused = useGame((s) => s.paused);
  const lastActorSeat = useGame((s) => s.lastActorSeat);

  const bb = table.bigBlind;
  const hero = table.players[0];
  const la = legalActions(table);
  const heroToAct = table.phase === "betting" && table.toAct === 0 && !paused;
  const botToAct = table.phase === "betting" && table.toAct !== null && table.toAct !== 0;
  const canExplain = lastActorSeat !== null && lastActorSeat !== 0 && !!table.players[lastActorSeat ?? 0]?.archetype;

  const [raiseTo, setRaiseTo] = useState(la.minRaiseTo);

  useEffect(() => {
    if (!heroToAct) return;
    const base = table.pot + la.toCall;
    const def = table.currentBet > 0 ? table.currentBet + Math.round(base * 0.66) : Math.round(table.pot * 0.66);
    setRaiseTo(clamp(def, la.minRaiseTo, la.maxRaiseTo));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table.toAct, table.street, table.currentBet, table.phase, table.handNumber]);

  // Keyboard: ArrowRight steps a bot in manual mode.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "ArrowRight" && settings.mode === "manual" && botToAct && !paused) {
        e.preventDefault();
        stepBot();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settings.mode, botToAct, paused, stepBot]);

  const setFraction = (frac: number) => {
    const base = table.pot + la.toCall;
    const add = Math.round(base * frac);
    const to = table.currentBet > 0 ? table.currentBet + add : add;
    setRaiseTo(clamp(to, la.minRaiseTo, la.maxRaiseTo));
  };

  const handLabel = hero.hole ? cardsToLabel(hero.hole[0], hero.hole[1]) : "";
  const canAggro = la.canBet || la.canRaise;
  const aggroVerb = table.currentBet === 0 ? "Bet" : "Raise to";

  const ExplainBtn = canExplain ? (
    <Button variant="ghost" size="lg" onClick={explain} title="Ask the coach to interpret the last action">
      <Icon name="coach" size={15} /> Explain last move
    </Button>
  ) : null;

  return (
    <div className="flex items-center gap-4 border-t border-[var(--line)] bg-ink-850/90 px-5 py-3 backdrop-blur">
      <div className="flex w-[230px] shrink-0 items-center gap-3">
        {hero.hole && session.active && (
          <div className="flex gap-1">
            <PlayingCard card={hero.hole[0]} w={38} />
            <PlayingCard card={hero.hole[1]} w={38} />
          </div>
        )}
        <div className="leading-tight">
          <div className="font-display text-sm font-bold text-[var(--text)]">
            {session.active ? handLabel || "—" : "All-In"}
          </div>
          {session.active && heroToAct && la.toCall > 0 ? (
            <div className="text-[0.72rem] text-muted">
              To call <span className="mono text-gold-light">{fmtBb(la.callAmount, bb)} bb</span> · odds{" "}
              {fmtPct(la.toCall / (table.pot + la.toCall))}
            </div>
          ) : (
            <div className="text-[0.72rem] text-faint">
              {session.active ? `${fmtBb(hero.stack, bb)} bb stack` : "Start a session to play"}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-1 items-center justify-end gap-3">
        {!session.active && (
          <Button size="lg" onClick={newSession} className="px-8">
            <Icon name="play" size={16} /> Start session
          </Button>
        )}

        {session.active && table.phase === "hand-over" && (
          <>
            {ExplainBtn}
            <Button size="lg" onClick={deal} className="px-8">
              Next hand <Icon name="arrow-right" size={16} />
            </Button>
          </>
        )}

        {session.active && botToAct && (
          <>
            {ExplainBtn}
            {settings.mode === "manual" && !paused ? (
              <Button variant="secondary" size="lg" onClick={stepBot}>
                Next action <Icon name="chevron-right" size={16} />
              </Button>
            ) : (
              <div className="text-sm text-muted">
                Waiting for{" "}
                <span className="font-semibold text-[var(--text)]">
                  {table.toAct !== null ? table.players[table.toAct].name : "…"}
                </span>
                …
              </div>
            )}
          </>
        )}

        {session.active && heroToAct && (
          <>
            <Button variant="danger" size="lg" onClick={() => void heroAction({ type: "fold" })}>
              Fold
            </Button>
            {la.canCheck ? (
              <Button variant="secondary" size="lg" onClick={() => void heroAction({ type: "check" })}>
                Check
              </Button>
            ) : (
              <Button variant="secondary" size="lg" onClick={() => void heroAction({ type: "call" })}>
                Call <span className="mono">{fmtBb(la.callAmount, bb)}</span>
              </Button>
            )}
            {canAggro && (
              <div className="flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-ink-800 px-3 py-2">
                <div className="flex flex-col gap-1.5">
                  <div className="flex gap-1">
                    {[
                      { label: "½", f: 0.5 },
                      { label: "¾", f: 0.75 },
                      { label: "Pot", f: 1 },
                    ].map((q) => (
                      <button
                        key={q.label}
                        onClick={() => setFraction(q.f)}
                        className="rounded-md bg-ink-600 px-2 py-1 text-[0.7rem] font-semibold text-muted transition hover:bg-ink-500 hover:text-[var(--text)]"
                      >
                        {q.label}
                      </button>
                    ))}
                    <button
                      onClick={() => setRaiseTo(la.maxRaiseTo)}
                      className="rounded-md bg-ink-600 px-2 py-1 text-[0.7rem] font-semibold text-chip-red/90 transition hover:bg-ink-500"
                    >
                      All-in
                    </button>
                  </div>
                  <Slider
                    value={raiseTo}
                    min={la.minRaiseTo}
                    max={la.maxRaiseTo}
                    step={Math.max(1, bb / 2)}
                    onValueChange={setRaiseTo}
                    ariaLabel="Bet size"
                    className="w-[150px]"
                  />
                </div>
                <Button
                  size="lg"
                  onClick={() => void heroAction({ type: table.currentBet === 0 ? "bet" : "raise", amount: raiseTo })}
                  className="min-w-[120px]"
                >
                  {aggroVerb} <span className="mono">{fmtBb(raiseTo, bb)}</span>
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
