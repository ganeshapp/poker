import { useGame } from "@/store/gameStore";
import { useSettings } from "@/store/settingsStore";
import type { Card, HandSummary, Player, Street } from "@/types/poker";
import { fmtBb, fmtSigned } from "@/lib/format";
import { Button } from "@/components/ui/controls";
import { Icon } from "@/components/ui/Icon";
import { PlayingCard } from "@/components/table/PlayingCard";
import { evaluateCards } from "@/engine/evaluator";
import { cardsToLabel } from "@/engine/notation";
import { PREFLOP_100 } from "@/data/preflop";
import { cx } from "@/lib/cx";

const FOLD_PHRASE: Record<Street, string> = {
  preflop: "before the flop",
  flop: "on the flop",
  turn: "on the turn",
  river: "on the river",
  showdown: "at showdown",
};

/** One plain-English line about what a revealed hand did — the teaching
    moment of the end-of-hand reveal. */
function revealNote(p: Player, board: Card[], summary: HandSummary): string {
  const winners = new Set(summary.potResults.flatMap((pr) => pr.winners));
  if (!p.hasFolded) {
    const sd = summary.showdown.find((e) => e.playerId === p.id);
    if (winners.has(p.id)) {
      return sd?.hand ? `Won with ${sd.hand.name.toLowerCase()}.` : "Won — everyone else folded.";
    }
    return sd?.hand ? `Showed ${sd.hand.name.toLowerCase()}.` : "Reached the end without showing.";
  }

  const base = `Folded ${FOLD_PHRASE[p.foldedStreet ?? "preflop"]}`;
  if ((p.foldedStreet ?? "preflop") === "preflop") {
    if (p.hole) {
      const label = cardsToLabel(p.hole[0], p.hole[1]);
      // BB never folds unopened pots, so a BB preflop fold faced a raise.
      const chart =
        p.position === "BB"
          ? { ...PREFLOP_100.vsRfi.BB_vs_BTN.call, ...PREFLOP_100.vsRfi.BB_vs_BTN.threebet }
          : PREFLOP_100.rfi[p.position];
      const inRange = ((chart ?? {})[label] ?? 0) > 0;
      return inRange ? `${base} — playable, but gave it up.` : `${base} — too weak to play from ${p.position}.`;
    }
    return `${base}.`;
  }
  if (p.hole && board.length >= 3) {
    const wouldHave = evaluateCards([...p.hole, ...board]).name.toLowerCase();
    return `${base} — the full board would have given them ${wouldHave}.`;
  }
  return `${base}.`;
}

export function ResultOverlay() {
  const table = useGame((s) => s.table);
  const deal = useGame((s) => s.deal);
  // All hooks must run before any early return (rules of hooks) —
  // calling one below the return blanks the whole app at hand-over.
  const realistic = useSettings((st) => st.realisticReveal);
  if (table.phase !== "hand-over" || !table.summary) return null;

  const s = table.summary;
  const bb = table.bigBlind;
  const netBb = s.heroNetChips / bb;
  // "You won the pot" above a line saying someone else won the bigger one is
  // a contradiction: only claim it when every pot was the hero's.
  const won =
    s.potResults.length > 0 && s.potResults.every((pr) => pr.winners.includes(0));

  // One line per pot. Naming only the first pot's winner left a side pot
  // unexplained — "You won the pot" above "Polk wins with a pair of kings".
  const sidePots = s.potResults.length - 1;
  const potLines = s.potResults.map((pr, i) => {
    const names = pr.winners.map((id) => table.players[id].name).join(", ");
    const hand = s.showdown.find((e) => pr.winners.includes(e.playerId))?.hand;
    // With two or more side pots "the side pot" names two different pots, so
    // number them; with one there is nothing to disambiguate.
    const which =
      s.potResults.length < 2 ? "" : i === 0 ? " the main pot" : sidePots > 1 ? ` side pot ${i}` : " the side pot";
    // "You" takes a plural verb; a bot's name takes the singular.
    const plural = pr.winners.includes(0) || pr.winners.length > 1;
    return {
      names,
      tail: hand
        ? `${plural ? "win" : "wins"}${which} with ${hand.name.toLowerCase()}.`
        : `${plural ? "take" : "takes"}${which} it down.`,
    };
  });

  const color = netBb > 0.01 ? "var(--good)" : netBb < -0.01 ? "var(--bad)" : "var(--text-muted)";
  const bots = table.players.filter(
    (p) => !p.isHero && !p.sittingOut && p.hole && !(realistic && p.hasFolded),
  );

  return (
    <div className="pointer-events-none absolute inset-x-0 top-[44%] flex -translate-y-1/2 justify-center">
      <div className="pointer-events-auto w-[min(600px,94%)] animate-pop rounded-2xl border border-[var(--line-strong)] bg-ink-850/95 px-5 py-3 shadow-[var(--sh-pop)] backdrop-blur">
        <div className="flex items-center gap-4">
          <div className="text-center">
            <div className="font-display text-2xl font-extrabold" style={{ color }}>
              {fmtSigned(netBb)} bb
            </div>
            <div className="text-[0.66rem] uppercase tracking-wide text-muted">
              {won ? "You won the pot" : "Hand over"}
            </div>
          </div>
          <div className="flex-1 text-[0.78rem] leading-snug text-muted">
            {potLines.map((line, i) => (
              <div key={i}>
                <span className="font-semibold text-[var(--text)]">{line.names}</span> {line.tail}
              </div>
            ))}
            {s.uncalled && (
              <div>
                <span className="font-semibold text-[var(--text)]">
                  {table.players[s.uncalled.playerId].name}
                </span>{" "}
                {s.uncalled.playerId === 0 ? "get" : "gets"} {fmtBb(s.uncalled.amount, bb)} bb back —
                nobody called it.
              </div>
            )}
          </div>
          <Button onClick={deal}>
            Next <Icon name="arrow-right" size={15} />
          </Button>
        </div>

        {/* The card sits over the middle of the felt, so it carries the board
            with it: the reveals below are unreadable without the five cards
            they are talking about. */}
        {s.board.length > 0 && (
          <div className="mt-2.5 flex items-center gap-2 border-t border-[var(--line)] pt-2.5">
            <span className="text-[0.62rem] uppercase tracking-wide text-faint">Board</span>
            <div className="flex gap-1">
              {s.board.map((c) => (
                <PlayingCard key={c} card={c} w={30} />
              ))}
            </div>
          </div>
        )}

        {/* Learning reveal: every hand dealt, folds included */}
        <div className="mt-3 grid gap-1.5 border-t border-[var(--line)] pt-3 sm:grid-cols-2">
          {bots.map((p) => (
            <div key={p.id} className="flex items-center gap-2">
              <div className={cx("flex shrink-0 gap-0.5", p.hasFolded && "opacity-45 grayscale")}>
                <PlayingCard card={p.hole![0]} w={24} />
                <PlayingCard card={p.hole![1]} w={24} />
              </div>
              <div className="min-w-0 text-[0.7rem] leading-snug text-muted">
                <span className="font-semibold text-[var(--text)]">{p.name}</span>{" "}
                {revealNote(p, s.board, s)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
