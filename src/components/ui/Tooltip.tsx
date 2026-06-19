import * as RT from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
}

export function Tooltip({ content, children, side = "top" }: TooltipProps) {
  return (
    <RT.Provider delayDuration={250}>
      <RT.Root>
        <RT.Trigger asChild>{children}</RT.Trigger>
        <RT.Portal>
          <RT.Content
            side={side}
            sideOffset={6}
            className="z-[60] max-w-[260px] rounded-lg border border-[var(--line-strong)] bg-ink-700 px-3 py-2 text-xs text-[var(--text)] shadow-[var(--sh-pop)]"
            style={{ animation: "pop .14s var(--ease)" }}
          >
            {content}
            <RT.Arrow className="fill-[var(--ink-700)]" />
          </RT.Content>
        </RT.Portal>
      </RT.Root>
    </RT.Provider>
  );
}
