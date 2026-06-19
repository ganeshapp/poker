import * as RD from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import { Icon } from "./Icon";

interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  maxWidth?: number;
  hideClose?: boolean;
  className?: string;
}

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  maxWidth = 560,
  hideClose,
  className,
}: ModalProps) {
  return (
    <RD.Root open={open} onOpenChange={onOpenChange}>
      <RD.Portal>
        <RD.Overlay
          className="fixed inset-0 z-50 bg-black/65 backdrop-blur-[3px]"
          style={{ animation: "overlayIn .18s ease" }}
        />
        <RD.Content
          aria-describedby={description ? undefined : undefined}
          className={cx(
            "fixed left-1/2 top-1/2 z-50 max-h-[92vh] w-[94vw] -translate-x-1/2 -translate-y-1/2 overflow-auto",
            "rounded-[18px] border border-[var(--line-strong)] bg-ink-800 p-6 shadow-[var(--sh-pop)]",
            className,
          )}
          style={{ maxWidth, animation: "pop .22s var(--ease)" }}
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <RD.Title className="font-display text-xl font-bold text-[var(--text)]">{title}</RD.Title>
              {description && (
                <RD.Description className="mt-1 text-sm text-muted">{description}</RD.Description>
              )}
            </div>
            {!hideClose && (
              <RD.Close
                className="rounded-lg p-1.5 text-muted transition hover:bg-white/5 hover:text-[var(--text)]"
                aria-label="Close"
              >
                <Icon name="x" size={20} />
              </RD.Close>
            )}
          </div>
          {children}
        </RD.Content>
      </RD.Portal>
    </RD.Root>
  );
}
