import type { Card } from "@/types/poker";
import { PlayingCard } from "@/components/table/PlayingCard";

const RANKINGS: { name: string; cards: Card[]; note: string }[] = [
  { name: "Royal Flush", cards: ["Ah", "Kh", "Qh", "Jh", "Th"], note: "A-K-Q-J-T, one suit" },
  { name: "Straight Flush", cards: ["9s", "8s", "7s", "6s", "5s"], note: "Five in a row, one suit" },
  { name: "Four of a Kind", cards: ["Qh", "Qd", "Qc", "Qs", "3d"], note: "All four of a rank" },
  { name: "Full House", cards: ["Jh", "Jd", "Jc", "8s", "8h"], note: "Trips + a pair" },
  { name: "Flush", cards: ["Ad", "Jd", "8d", "5d", "2d"], note: "Five of one suit" },
  { name: "Straight", cards: ["9h", "8s", "7d", "6c", "5h"], note: "Five in a row, mixed suits" },
  { name: "Three of a Kind", cards: ["7h", "7d", "7c", "Ks", "2d"], note: "Three of a rank" },
  { name: "Two Pair", cards: ["Ah", "Ad", "9c", "9s", "4d"], note: "Two different pairs" },
  { name: "One Pair", cards: ["Th", "Td", "As", "7c", "3d"], note: "A single pair" },
  { name: "High Card", cards: ["Ah", "Jd", "8c", "5s", "2d"], note: "Nothing — highest card plays" },
];

export function HandRankings() {
  return (
    <div className="space-y-2">
      {RANKINGS.map((r, i) => (
        <div
          key={r.name}
          className="flex items-center gap-4 rounded-xl border border-[var(--line)] bg-ink-850 px-3 py-2"
        >
          <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gold/15 mono text-sm font-bold text-gold">
            {i + 1}
          </div>
          <div className="flex gap-1">
            {r.cards.map((c, j) => (
              <PlayingCard key={j} card={c} w={30} />
            ))}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-[var(--text)]">{r.name}</div>
            <div className="text-[0.72rem] text-faint">{r.note}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
