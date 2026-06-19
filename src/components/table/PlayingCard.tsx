import type { CSSProperties } from "react";
import type { Card } from "@/types/poker";
import { SUIT_SYMBOL, cardRank, cardSuit, isRedSuit } from "@/engine/cards";
import { cx } from "@/lib/cx";

interface PlayingCardProps {
  card?: Card | null;
  faceDown?: boolean;
  w?: number;
  className?: string;
  style?: CSSProperties;
  dim?: boolean;
}

export function PlayingCard({ card, faceDown, w = 46, className, style, dim }: PlayingCardProps) {
  const h = Math.round(w * 1.4);
  const radius = Math.max(4, Math.round(w * 0.13));

  if (faceDown || !card) {
    return (
      <div
        className={cx("relative shrink-0 shadow-card ring-1 ring-black/40", className)}
        style={{
          width: w,
          height: h,
          borderRadius: radius,
          background: "linear-gradient(135deg, #11805a 0%, #0a4f34 55%, #073a2a 100%)",
          ...style,
        }}
      >
        <div
          className="absolute inset-[3px] flex items-center justify-center"
          style={{ borderRadius: radius - 2, border: "1px solid rgba(232,194,90,0.45)" }}
        >
          <div
            style={{ width: w * 0.34, height: w * 0.34, borderRadius: "50%", border: `2px solid rgba(232,194,90,0.6)` }}
          />
        </div>
      </div>
    );
  }

  const r = cardRank(card);
  const s = cardSuit(card);
  const color = isRedSuit(s) ? "var(--suit-red)" : "var(--suit-black)";
  const rankText = r === "T" ? "10" : r;

  return (
    <div
      className={cx("relative shrink-0 overflow-hidden shadow-card ring-1 ring-black/15", className)}
      style={{
        width: w,
        height: h,
        borderRadius: radius,
        background: "linear-gradient(180deg, #ffffff 0%, #eef2f6 100%)",
        opacity: dim ? 0.55 : 1,
        ...style,
      }}
    >
      <div
        className="absolute font-display font-extrabold leading-none"
        style={{ left: w * 0.12, top: h * 0.06, color, fontSize: w * 0.36 }}
      >
        {rankText}
      </div>
      <div className="absolute leading-none" style={{ left: w * 0.13, top: h * 0.34, color, fontSize: w * 0.26 }}>
        {SUIT_SYMBOL[s]}
      </div>
      <div
        className="absolute leading-none"
        style={{ right: w * 0.08, bottom: h * 0.04, color, fontSize: w * 0.5, opacity: 0.92 }}
      >
        {SUIT_SYMBOL[s]}
      </div>
    </div>
  );
}
