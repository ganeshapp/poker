import { useEffect, useState } from "react";
import { useStats } from "@/store/statsStore";
import { ARCHETYPES } from "@/game/archetypes";
import { classifyStyle, STYLE_MIN_HANDS } from "@/game/profile";
import { LineChart, MiniBars } from "@/components/stats/charts";
import { Button, Card, ProgressBar } from "@/components/ui/controls";
import { Icon } from "@/components/ui/Icon";
import { Tooltip } from "@/components/ui/Tooltip";
import { Modal } from "@/components/ui/Dialog";
import { HandReplayModal } from "@/components/play/HandReplayModal";
import { loadRecentHands, exportBackup, persistImportedHands } from "@/db/stats";
import { parsePokerStars, analyzeImported } from "@/lib/hhImport";
import { useLeaks } from "@/store/leakStore";
import { useGoals, metGoal } from "@/store/goalStore";
import { useNotes, handKey } from "@/store/noteStore";
import { HandNoteEditor } from "@/components/stats/HandNoteEditor";
import { saveText } from "@/lib/exportFile";
import type { HHHand } from "@/game/handHistory";
import { fmtSigned, fmtPct } from "@/lib/format";
import { leaksFromDecisions } from "@/lib/leaks";
import { cx } from "@/lib/cx";

/** The engine's style names are terse because the bots use them; these are
 *  the words shown to the player. */
const STYLE_WORDS = {
  unknown: "—",
  rock: "Rock",
  nit: "Nit",
  tight: "Tight",
  solid: "Solid",
  loose: "Loose",
  maniac: "Maniac",
  station: "Calling station",
} as const;

/**
 * The label in the vocabulary players actually use.
 *
 * "Tight" and "TAG" are not the same thing — a player who sees 20% of flops
 * and never raises is tight and *passive*, which is a different leak and
 * deserves a different word. So the aggressive names are only used when the
 * raising actually backs them up.
 */
function styleWord(style: keyof typeof STYLE_WORDS, vpip: number, pfr: number): string {
  const raises = vpip > 0 ? pfr / vpip : 0;
  const aggressive = raises >= 0.6;
  if (style === "tight") return aggressive ? "TAG (tight-aggressive)" : "Tight but passive";
  if (style === "loose") return aggressive ? "LAG (loose-aggressive)" : "Loose but passive";
  if (style === "solid") return aggressive ? "TAG-ish (solid)" : "Solid but passive";
  return STYLE_WORDS[style];
}

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
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const onImportFile = async (file: File) => {
    const text = await file.text();
    const { hands, skipped } = parsePokerStars(text);
    if (hands.length === 0) {
      setImportMsg(`Couldn't find any PokerStars-style hands in that file${skipped ? ` (${skipped} blocks unparseable)` : ""}.`);
      return;
    }
    await persistImportedHands(hands.map((h) => JSON.stringify(h)));
    const { reviewed, leaks } = analyzeImported(hands);
    const addLeak = useLeaks.getState().add;
    for (const l of leaks) addLeak(l);
    setImportMsg(
      `Imported ${hands.length} hand${hands.length === 1 ? "" : "s"}${skipped ? ` (${skipped} skipped)` : ""} · reviewed ${reviewed} of your calls · ${leaks.length ? `${leaks.length} questionable one${leaks.length === 1 ? "" : "s"} added to the Review queue` : "no clear mistakes found"}. Imported hands never count toward your play stats.`,
    );
    setReloadKey((k) => k + 1);
  };
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
  }, [handsPlayed, reloadKey]);

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
              // Only rows that actually recorded the flags count. Older rows
              // predate them, and treating a missing value as "did not play
              // the hand" would quietly drag every VPIP down.
              const rated = history.filter((h) => h.vpip != null);
              const vpip = rated.length ? rated.filter((h) => h.vpip).length / rated.length : null;
              const pfr = rated.length ? rated.filter((h) => h.pfr).length / rated.length : null;
              const postAggro = aggro + calls > 0 ? aggro / (aggro + calls) : 0;
              const style =
                vpip != null && pfr != null && rated.length >= STYLE_MIN_HANDS
                  ? classifyStyle(vpip, pfr, postAggro)
                  : null;
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
                    label="Hands played (VPIP)"
                    value={vpip == null ? "—" : fmtPct(vpip)}
                    band="20–28%"
                    blurb="How often you put money in before the flop by choice — posting a blind does not count. Much above 30% and you are paying to see flops with hands that cannot stand a raise; much below 18% and you are folding your way out of pots you could have won."
                  />
                  <Row
                    label="Raised first in (PFR)"
                    value={pfr == null ? "—" : fmtPct(pfr)}
                    band="16–22%"
                    blurb="How often you raised before the flop. The gap between this and VPIP is the tell: a small gap is a player who raises or folds, a large gap is a player who limps and calls. Limping is where most money leaks."
                  />
                  <Row
                    label="Your style"
                    value={style && vpip != null && pfr != null ? styleWord(style, vpip, pfr) : "—"}
                    band="TAG — tight and aggressive"
                    blurb="The label these numbers add up to — and the same one the bots at your table work out about you from watching, using the very same thresholds. They play back against it."
                  />
                  <Row
                    label="Aggression factor (AF)"
                    value={af == null ? "—" : af.toFixed(1)}
                    band="2.0–4.0"
                    blurb="Your bets + raises divided by your calls, over every graded decision — including sessions you played with the coach switched off. Below ~1.5 means you call far more than you pressure, the most common beginner leak."
                  />
                  {(() => {
                    // Which of the player's own gears makes money. Hand
                    // numbers restart at 1 each session, so a number that
                    // does not continue the previous one is a new session.
                    const sessions: (typeof rated)[] = [];
                    for (const h of [...rated].reverse()) {
                      const last = sessions[sessions.length - 1];
                      if (!last || h.n <= last[last.length - 1].n) sessions.push([h]);
                      else last.push(h);
                    }
                    const buckets = new Map<string, { hands: number; net: number }>();
                    for (const s of sessions) {
                      if (s.length < STYLE_MIN_HANDS) continue;
                      const sv = s.filter((h) => h.vpip).length / s.length;
                      const sp = s.filter((h) => h.pfr).length / s.length;
                      const label = classifyStyle(sv, sp, postAggro);
                      const b = buckets.get(label) ?? { hands: 0, net: 0 };
                      b.hands += s.length;
                      b.net += s.reduce((a, h) => a + h.netBb, 0);
                      buckets.set(label, b);
                    }
                    const rows = [...buckets.entries()].sort((a, b) => b[1].hands - a[1].hands);
                    if (!rows.length) return null;
                    return (
                      <div className="pt-3">
                        <div className="pb-1 text-[0.7rem] font-semibold uppercase tracking-wide text-faint">
                          Win rate by how you were playing
                        </div>
                        {rows.map(([label, b]) => (
                          <div
                            key={label}
                            className="flex items-center justify-between border-b border-[var(--line)] py-1.5 text-[0.8rem] last:border-b-0"
                          >
                            <span className="text-muted">{STYLE_WORDS[label as keyof typeof STYLE_WORDS]}</span>
                            <span className="flex items-center gap-3">
                              <span className="text-[0.7rem] text-faint">{b.hands}h</span>
                              <span className="mono font-semibold text-[var(--text)]">
                                {((b.net / b.hands) * 100).toFixed(0)}/100
                              </span>
                            </span>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
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
          <div className="mb-3 flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
              <Icon name="play" size={16} className="text-gold" /> Recent hands
            </span>
            <label className="cursor-pointer rounded-lg border border-[var(--line)] bg-ink-700 px-2.5 py-1 text-[0.72rem] font-semibold text-[var(--text)] transition hover:bg-ink-600">
              Import hands (.txt)
              <input
                type="file"
                accept=".txt,text/plain"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onImportFile(f);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          {importMsg && (
            <div className="mb-2 rounded-lg border border-info/30 bg-info/10 px-3 py-2 text-[0.76rem] leading-relaxed text-info">
              {importMsg}
            </div>
          )}
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
                              {(h as HHHand & { imported?: boolean }).imported && (
                                <span className="ml-2 rounded-full bg-info/15 px-1.5 py-0.5 text-[0.6rem] font-semibold text-info">imported</span>
                              )}
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
