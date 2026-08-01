import { useEffect, useState } from "react";
import { useStats } from "@/store/statsStore";
import { ARCHETYPES } from "@/game/archetypes";
import { LineChart, MiniBars } from "@/components/stats/charts";
import { Button, Card, ProgressBar } from "@/components/ui/controls";
import { Icon } from "@/components/ui/Icon";
import { Tooltip } from "@/components/ui/Tooltip";
import { Modal } from "@/components/ui/Dialog";
import { HandReplayModal } from "@/components/play/HandReplayModal";
import { loadRecentHands, exportBackup } from "@/db/stats";
import { useGoals, metGoal } from "@/store/goalStore";
import { useNotes, handKey } from "@/store/noteStore";
import { HandNoteEditor } from "@/components/stats/HandNoteEditor";
import { saveText } from "@/lib/exportFile";
import type { HHHand } from "@/game/handHistory";
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
  const chartBase = useStats((s) => s.chartBase);

  const [resetOpen, setResetOpen] = useState(false);
  const [resetText, setResetText] = useState("");
  const [backupMsg, setBackupMsg] = useState<string | null>(null);
  const [recent, setRecent] = useState<HHHand[]>([]);
  const [replay, setReplay] = useState<HHHand | null>(null);
  const [noteHand, setNoteHand] = useState<HHHand | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const handNotes = useNotes((s) => s.notes);

  useEffect(() => {
    void loadRecentHands(30).then((rows) => {
      const parsed: HHHand[] = [];
      for (const r of rows) {
        try {
          parsed.push(JSON.parse(r) as HHHand);
        } catch {
          /* skip corrupt rows */
        }
      }
      setRecent(parsed);
    });
  }, [handsPlayed]);

  const netBb = netChips / bb;
  const bb100 = handsPlayed > 0 ? (netBb / handsPlayed) * 100 : 0;

  // Starts at the pre-window baseline so the line always ends at Net,
  // however many older hands fell out of the loaded window.
  let acc = chartBase;
  const cumulative = history.map((h) => (acc += h.netBb));

  const sd = history.filter((h) => h.showdown);
  const sdWin = sd.length > 0 ? sd.filter((h) => h.won).length / sd.length : 0;
  const avgAcc = guesses.length > 0 ? guesses.reduce((a, g) => a + g.accuracy, 0) / guesses.length : 0;

  // Multiway hands split their result across the styles faced, so the
  // per-style nets always sum to the real total (no double counting).
  const archAgg = (["TAG", "LAG", "Nit", "Station"] as const).map((a) => {
    const hs = history.filter((h) => h.archetypes.includes(a));
    return { a, hands: hs.length, net: hs.reduce((s, h) => s + h.netBb / Math.max(1, h.archetypes.length), 0) };
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
          <Button variant="ghost" onClick={() => { setResetText(""); setBackupMsg(null); setResetOpen(true); }}>
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

        {/* Position + style numbers */}
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card>
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
              <Icon name="target" size={16} className="text-gold" /> Winnings by position
            </div>
            {(() => {
              const POS = ["UTG", "MP", "CO", "BTN", "SB", "BB"] as const;
              const rows = POS.map((pos) => {
                const hs = history.filter((h) => h.position === pos);
                const net = hs.reduce((a, h) => a + h.netBb, 0);
                const rate = hs.length ? (net / hs.length) * 100 : 0;
                return { pos, hands: hs.length, net, rate };
              });
              const tracked = rows.reduce((a, r) => a + r.hands, 0);
              if (tracked === 0)
                return <div className="text-sm text-faint">Position is tracked from every new hand you play.</div>;
              const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(r.rate)));
              return (
                <div className="space-y-2">
                  {rows.map((r) => (
                    <div key={r.pos} className="flex items-center gap-2 text-[0.76rem]">
                      <span className="w-9 font-semibold text-[var(--text)]">{r.pos}</span>
                      <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-ink-600">
                        <div
                          className="absolute top-0 h-full rounded-full"
                          style={{
                            left: r.rate < 0 ? `${50 - (Math.abs(r.rate) / maxAbs) * 50}%` : "50%",
                            width: `${(Math.abs(r.rate) / maxAbs) * 50}%`,
                            background: r.rate >= 0 ? "var(--good)" : "var(--bad)",
                          }}
                        />
                        <div className="absolute left-1/2 top-0 h-full w-px bg-white/25" />
                      </div>
                      <span className={cx("mono w-20 text-right", r.rate >= 0 ? "text-good" : "text-bad")}>
                        {r.hands ? `${fmtSigned(r.rate, 0)}/100` : "—"}
                      </span>
                      <span className="w-10 text-right text-faint">{r.hands}h</span>
                    </div>
                  ))}
                  <p className="pt-1 text-[0.7rem] leading-relaxed text-faint">
                    Everyone wins most from the button (acting last) and loses from the blinds (forced
                    money, acting first). Worry only if your early-position numbers are deep red — that
                    usually means playing too many weak hands up front.
                  </p>
                </div>
              );
            })()}
          </Card>

          <Card>
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
              <Icon name="stats" size={16} className="text-gold" /> Style numbers
            </div>
            {(() => {
              const flops = history.filter((h) => h.sawFlop === true);
              const wtsd = flops.length ? history.filter((h) => h.showdown && h.sawFlop).length / flops.length : null;
              const sdHands = history.filter((h) => h.showdown);
              const wsd = sdHands.length ? sdHands.filter((h) => h.won).length / sdHands.length : null;
              const aggro = decisions.filter((d) => d.action === "bet" || d.action === "raise").length;
              const calls = decisions.filter((d) => d.action === "call").length;
              const af = calls > 0 ? aggro / calls : null;
              const Row = ({ label, value, band, blurb }: { label: string; value: string; band: string; blurb: string }) => (
                <Tooltip
                  content={
                    <div className="space-y-1">
                      <div className="font-semibold text-gold-light">{label}</div>
                      <div className="text-muted">{blurb}</div>
                      <div className="pt-0.5 text-[0.7rem] text-faint">Healthy range: {band}</div>
                    </div>
                  }
                >
                  <div className="flex cursor-help items-center justify-between border-b border-[var(--line)] py-2 text-[0.8rem] last:border-b-0">
                    <span className="border-b border-dotted border-[var(--line-strong)] text-muted">{label}</span>
                    <span className="mono font-semibold text-[var(--text)]">{value}</span>
                  </div>
                </Tooltip>
              );
              return (
                <div>
                  <Row
                    label="Went to showdown (WTSD)"
                    value={wtsd == null ? "—" : fmtPct(wtsd)}
                    band="24–32%"
                    blurb="Of the hands where you saw a flop, how often you reached showdown. Too high = calling down too much; too low = giving up too easily."
                  />
                  <Row
                    label="Won at showdown (W$SD)"
                    value={wsd == null ? "—" : fmtPct(wsd)}
                    band="49–56%"
                    blurb="When you did reach showdown, how often you won. Very high can ironically mean you only call when it's obvious — you might be folding too many winners."
                  />
                  <Row
                    label="Aggression factor (AF)"
                    value={af == null ? "—" : af.toFixed(1)}
                    band="2.0–4.0"
                    blurb="Your bets + raises divided by your calls, over coached decisions. Below ~1.5 means you call far more than you pressure — the most common beginner leak."
                  />
                  <p className="pt-2 text-[0.7rem] leading-relaxed text-faint">
                    Small samples swing wildly — treat these as a mirror after a few hundred hands, not a
                    verdict after ten.
                  </p>
                </div>
              );
            })()}
          </Card>
        </div>

        {/* Recent hands — replayable across restarts, with notes & tags */}
        <Card className="mt-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
            <Icon name="play" size={16} className="text-gold" /> Recent hands
          </div>
          {(() => {
            const allTags = [...new Set(Object.values(handNotes).flatMap((n) => n.tags))];
            const rows = tagFilter
              ? recent.filter((h) => handNotes[handKey(h.startedAt)]?.tags.includes(tagFilter))
              : recent;
            return (
              <>
                {allTags.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    <button
                      onClick={() => setTagFilter(null)}
                      className={cx(
                        "rounded-full px-2.5 py-0.5 text-[0.7rem] font-semibold transition",
                        tagFilter === null ? "bg-gold text-ink-900" : "bg-ink-700 text-muted hover:text-[var(--text)]",
                      )}
                    >
                      all
                    </button>
                    {allTags.map((t) => (
                      <button
                        key={t}
                        onClick={() => setTagFilter(tagFilter === t ? null : t)}
                        className={cx(
                          "rounded-full px-2.5 py-0.5 text-[0.7rem] font-semibold transition",
                          tagFilter === t ? "bg-gold text-ink-900" : "bg-ink-700 text-muted hover:text-[var(--text)]",
                        )}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                )}
                {rows.length === 0 ? (
                  <div className="text-sm text-faint">
                    {tagFilter
                      ? "No hands carry that tag among the recent ones."
                      : "Finished hands appear here and stay replayable after a restart."}
                  </div>
                ) : (
                  <div className="max-h-[280px] space-y-1 overflow-auto pr-1">
                    {rows.map((h, i) => {
                      const note = handNotes[handKey(h.startedAt)];
                      return (
                        <div
                          key={`${h.startedAt}-${i}`}
                          className="rounded-lg border border-[var(--line)] bg-ink-850 px-3 py-1.5 text-[0.78rem] transition hover:bg-ink-700"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <button onClick={() => setReplay(h)} className="flex-1 text-left text-[var(--text)] hover:text-gold-light">
                              Hand #{h.id} · {new Date(h.startedAt).toLocaleString()}
                            </button>
                            <span className={cx("mono", h.heroNet >= 0 ? "text-good" : "text-bad")}>
                              {fmtSigned(h.heroNet / h.bb)} bb
                            </span>
                            <button
                              onClick={() => setNoteHand(h)}
                              title={note ? "Edit note" : "Add a note / tag"}
                              className={cx("transition", note ? "text-gold" : "text-faint hover:text-[var(--text)]")}
                              aria-label={note ? "Edit note" : "Add note"}
                            >
                              <Icon name="book" size={14} />
                            </button>
                          </div>
                          {note && (note.note || note.tags.length > 0) && (
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              {note.tags.map((t) => (
                                <span key={t} className="rounded-full bg-gold/15 px-2 py-0.5 text-[0.64rem] font-semibold text-gold">
                                  {t}
                                </span>
                              ))}
                              {note.note && <span className="truncate text-[0.7rem] text-muted">{note.note}</span>}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            );
          })()}
        </Card>
        {/* Practice heatmap — quiet consistency, not guilt */}
        <Card className="mt-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
            <Icon name="bolt" size={16} className="text-gold" /> Practice
          </div>
          {(() => {
            const activity = useGoals.getState().activity;
            const DAY = 86_400_000;
            const weeks = 16;
            const cells: { key: string; count: number; met: boolean }[] = [];
            const now = new Date();
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
            for (let i = weeks * 7 - 1; i >= 0; i--) {
              const t = today - i * DAY;
              const d = new Date(t);
              const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
              const day = activity[key];
              cells.push({ key, count: (day?.drills ?? 0) + (day?.hands ?? 0), met: metGoal(day) });
            }
            const active = cells.filter((c) => c.count > 0).length;
            return (
              <div>
                <div className="grid grid-flow-col grid-rows-7 gap-[3px]" style={{ width: "fit-content" }}>
                  {cells.map((c) => (
                    <div
                      key={c.key}
                      title={`${c.key}: ${c.count} reps${c.met ? " · goal met" : ""}`}
                      className="h-[11px] w-[11px] rounded-[3px]"
                      style={{
                        background: c.met
                          ? "var(--gold)"
                          : c.count > 0
                            ? "color-mix(in srgb, var(--gold) 35%, var(--ink-600))"
                            : "var(--ink-700)",
                      }}
                    />
                  ))}
                </div>
                <p className="mt-2 text-[0.7rem] text-faint">
                  {active === 0
                    ? "Each day you practice lights a square; hitting the daily goal (20 drills or 30 hands) makes it gold."
                    : `${active} active day${active === 1 ? "" : "s"} in the last ${weeks} weeks. Gold = daily goal met. Consistency beats bingeing.`}
                </p>
              </div>
            );
          })()}
        </Card>
      </div>

      <HandReplayModal hand={replay} onClose={() => setReplay(null)} />
      <HandNoteEditor hand={noteHand} onClose={() => setNoteHand(null)} />

      {/* Typed-confirmation reset with a backup offer */}
      <Modal
        open={resetOpen}
        onOpenChange={setResetOpen}
        maxWidth={440}
        title="Reset all progress?"
        description="This permanently deletes your lifetime stats, decisions, reads, and saved hands."
      >
        <div className="space-y-3">
          <Button
            variant="secondary"
            className="w-full"
            onClick={async () => {
              const r = await saveText(`allin-backup-${new Date().toISOString().slice(0, 10)}.json`, await exportBackup());
              setBackupMsg(r.message);
            }}
          >
            <Icon name="stats" size={15} /> Download a backup first
          </Button>
          {backupMsg && <p className="text-[0.74rem] text-faint">{backupMsg}</p>}
          <div>
            <label className="mb-1 block text-[0.78rem] text-muted">
              Type <span className="mono font-bold text-[var(--text)]">RESET</span> to confirm:
            </label>
            <input
              type="text"
              value={resetText}
              onChange={(e) => setResetText(e.target.value)}
              className="w-full rounded-lg border border-[var(--line)] bg-ink-700 px-3 py-2 text-sm text-[var(--text)] focus:border-bad focus:outline-none"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setResetOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={resetText !== "RESET"}
              onClick={async () => {
                await clear();
                setResetOpen(false);
              }}
            >
              Erase everything
            </Button>
          </div>
        </div>
      </Modal>
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
