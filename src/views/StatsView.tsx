import { useStats } from "@/store/statsStore";
import { ARCHETYPES } from "@/game/archetypes";
import { LineChart, MiniBars } from "@/components/stats/charts";
import { Button, Card, ProgressBar } from "@/components/ui/controls";
import { Icon } from "@/components/ui/Icon";
import { Tooltip } from "@/components/ui/Tooltip";
import { fmtSigned, fmtPct } from "@/lib/format";
import { leaksFromDecisions } from "@/lib/leaks";
import { cx } from "@/lib/cx";

export function StatsView() {
  const handsPlayed = useStats((s) => s.handsPlayed);
  const netChips = useStats((s) => s.netChips);
  const bb = useStats((s) => s.bigBlind);
  const history = useStats((s) => s.history);
  const guesses = useStats((s) => s.guesses);
  const decisions = useStats((s) => s.decisions);
  const clear = useStats((s) => s.clear);

  const netBb = netChips / bb;
  const bb100 = handsPlayed > 0 ? (netBb / handsPlayed) * 100 : 0;

  let acc = 0;
  const cumulative = history.map((h) => (acc += h.netBb));

  const sd = history.filter((h) => h.showdown);
  const sdWin = sd.length > 0 ? sd.filter((h) => h.won).length / sd.length : 0;
  const avgAcc = guesses.length > 0 ? guesses.reduce((a, g) => a + g.accuracy, 0) / guesses.length : 0;

  const archAgg = (["TAG", "LAG", "Nit", "Station"] as const).map((a) => {
    const hs = history.filter((h) => h.archetypes.includes(a));
    return { a, hands: hs.length, net: hs.reduce((s, h) => s + h.netBb, 0) };
  });
  const maxArchHands = Math.max(1, ...archAgg.map((x) => x.hands));

  const leak = leaksFromDecisions(decisions);
  const allLeaks = [...leak.leaks];
  if (guesses.length >= 5 && avgAcc < 0.5)
    allLeaks.push("Your range reads are often off — drill Guess & Peek and the Range-Building exercise.");
  const recentMistakes = decisions.filter((d) => d.verdict === "mistake").slice(-5).reverse();

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-[980px] px-8 py-7">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl font-extrabold">Your progress</h1>
            <p className="text-sm text-muted">Decisions, not results — but we track both.</p>
          </div>
          <Button variant="ghost" onClick={() => clear()}>
            <Icon name="refresh" size={15} /> Reset
          </Button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Kpi label="Hands" value={String(handsPlayed)} />
          <Kpi label="Net" value={`${fmtSigned(netBb)} bb`} tone={netBb >= 0 ? "good" : "bad"} />
          <Tooltip
            content={
              <div className="space-y-1">
                <div className="font-semibold text-gold-light">bb / 100</div>
                Big blinds won per 100 hands — the standard, stake-independent win-rate. Roughly: +5 is a
                strong winner; expect wild swings under a few thousand hands.
              </div>
            }
          >
            <div>
              <Kpi label="Win rate" value={`${fmtSigned(bb100)}`} sub="bb/100 (lifetime)" tone={bb100 >= 0 ? "good" : "bad"} />
            </div>
          </Tooltip>
          <Kpi label="Showdown" value={fmtPct(sdWin)} sub="won" />
          <Kpi label="Read acc." value={guesses.length ? fmtPct(avgAcc) : "—"} sub={`${guesses.length} reads`} />
        </div>

        {/* Win-rate chart */}
        <Card className="mt-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
            <Icon name="stats" size={16} className="text-gold" /> Cumulative winnings (bb)
          </div>
          <LineChart values={cumulative} color={netBb >= 0 ? "var(--good)" : "var(--bad)"} unit="" />
        </Card>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {/* Reads */}
          <Card>
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
              <Icon name="eye" size={16} className="text-gold" /> Range-read accuracy
            </div>
            <MiniBars values={guesses.map((g) => g.accuracy)} />
            <p className="mt-2 text-[0.74rem] text-faint">Last {Math.min(30, guesses.length)} Peek scores.</p>
          </Card>

          {/* Archetype breakdown */}
          <Card>
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
              <Icon name="target" size={16} className="text-gold" /> Hands vs each style
            </div>
            <div className="space-y-3">
              {archAgg.map((x) => (
                <div key={x.a}>
                  <div className="mb-1 flex items-center justify-between text-[0.78rem]">
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: ARCHETYPES[x.a].color }} />
                      <span className="text-[var(--text)]">{ARCHETYPES[x.a].name}</span>
                    </span>
                    <span className={cx("mono", x.net >= 0 ? "text-good" : "text-bad")}>
                      {fmtSigned(x.net)} bb
                    </span>
                  </div>
                  <ProgressBar value={x.hands} max={maxArchHands} tone={ARCHETYPES[x.a].color} />
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Coaching review & leaks */}
        <Card className="mt-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
            <Icon name="coach" size={16} className="text-gold" /> Coaching review
          </div>
          {leak.total === 0 ? (
            <div className="text-sm text-faint">
              Play with the EV Coach on and your reviewed decisions, leaks and mistakes will appear here.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3 text-center">
                <VerdictBox label="Mistakes" value={leak.mistakes} color="var(--bad)" />
                <VerdictBox label="Thin spots" value={leak.thin} color="var(--warn)" />
                <VerdictBox label="Great plays" value={leak.great} color="var(--good)" />
              </div>

              {allLeaks.length > 0 && (
                <div className="space-y-1.5">
                  {allLeaks.map((l, i) => (
                    <div key={i} className="flex items-start gap-2 text-[0.82rem] text-muted">
                      <Icon name="bolt" size={14} className="mt-0.5 shrink-0 text-gold" />
                      {l}
                    </div>
                  ))}
                </div>
              )}

              {recentMistakes.length > 0 && (
                <div>
                  <div className="mb-1.5 text-[0.7rem] font-semibold uppercase tracking-wide text-muted">
                    Recent −EV decisions
                  </div>
                  <div className="space-y-1">
                    {recentMistakes.map((d, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between rounded-lg border border-[var(--line)] bg-ink-850 px-3 py-1.5 text-[0.78rem]"
                      >
                        <span className="capitalize text-[var(--text)]">
                          {d.street} {d.action}
                          {d.villainArchetype ? ` vs ${d.villainArchetype}` : ""}
                        </span>
                        <span className="mono text-bad">
                          {Math.round(d.equity * 100)}% eq · {Math.round(d.potOdds * 100)}% needed ·{" "}
                          {fmtSigned(d.evBb)} bb
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function VerdictBox({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-ink-850 px-2 py-3">
      <div className="mono text-2xl font-extrabold" style={{ color }}>
        {value}
      </div>
      <div className="text-[0.62rem] uppercase tracking-wide text-faint">{label}</div>
    </div>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-ink-800/80 p-4">
      <div className="text-[0.66rem] uppercase tracking-wide text-faint">{label}</div>
      <div
        className={cx(
          "mono text-2xl font-extrabold",
          tone === "good" && "text-good",
          tone === "bad" && "text-bad",
          !tone && "text-[var(--text)]",
        )}
      >
        {value}
      </div>
      {sub && <div className="text-[0.62rem] text-faint">{sub}</div>}
    </div>
  );
}
