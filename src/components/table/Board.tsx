import type { Card } from "@/types/poker";
import { PlayingCard } from "./PlayingCard";

export function Board({ cards, w = 56 }: { cards: Card[]; w?: number }) {
  const h = Math.round(w * 1.4);
  const radius = Math.max(4, Math.round(w * 0.13));
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: 5 }).map((_, i) =>
        cards[i] ? (
          <PlayingCard
            key={i}
            card={cards[i]}
            w={w}
            className="animate-deal-in"
            style={{ animationDelay: `${i * 55}ms` }}
          />
        ) : (
          <div
            key={i}
            style={{ width: w, height: h, borderRadius: radius }}
            className="shrink-0 border border-dashed border-white/12 bg-black/10"
          />
        ),
      )}
    </div>
  );
}
