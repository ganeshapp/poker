import { useGame } from "@/store/gameStore";
import type { Card, HandSummary, Player, Street } from "@/types/poker";
import { fmtSigned } from "@/lib/format";
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
  if (table.phase !== "hand-over" || !table.summary) return null;

  const s = table.summary;
  const bb = table.bigBlind;
  const netBb = s.heroNetChips / bb;
  const won = s.potResults.some((pr) => pr.winners.includes(0));
  const mainWinners = s.potResults[0]?.winners ?? [];
  const winnerNames = mainWinners.map((id) => table.players[id].name).join(", ");
  const winnerHand = s.showdown.find((e) => mainWinners.includes(e.playerId))?.hand;

  const color = netBb > 0.01 ? "var(--good)" : netBb < -0.01 ? "var(--bad)" : "var(--text-muted)";
  const bots = table.players.filter((p) => !p.isHero && p.hole);

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
          <div className="flex-1 text-[0.78rem] text-muted">
            <span className="font-semibold text-[var(--text)]">{winnerNames}</span>
            {winnerHand ? ` wins with ${winnerHand.name.toLowerCase()}.` : " takes it down."}
          </div>
          <Button onClick={deal}>
            Next <Icon name="arrow-right" size={15} />
          </Button>
        </div>

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
