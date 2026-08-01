import { useEffect, useState } from "react";
import { Modal } from "./Dialog";
import { isTypingTarget, hasModifier } from "@/lib/hotkeys";

const SECTIONS: { title: string; keys: [string, string][] }[] = [
  {
    title: "Play",
    keys: [
      ["F", "Fold"],
      ["C", "Check / call"],
      ["R", "Bet / raise the selected size"],
      ["Enter", "Confirm bet · next hand"],
      ["→", "Next bot action (manual pace)"],
      ["Space", "Start session · next hand"],
    ],
  },
  {
    title: "Drills",
    keys: [
      ["1 / 2 / 3", "Choose an answer"],
      ["Enter", "Next puzzle"],
    ],
  },
  {
    title: "General",
    keys: [
      ["?", "Show / hide this overlay"],
      ["Esc", "Close dialogs"],
    ],
  },
];

export function ShortcutOverlay() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e) || hasModifier(e)) return;
      if (e.key === "?" || (e.code === "Slash" && e.shiftKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      maxWidth={420}
      title="Keyboard shortcuts"
      description="Play and drill without touching the mouse."
    >
      <div className="space-y-4">
        {SECTIONS.map((s) => (
          <div key={s.title}>
            <div className="mb-1.5 text-[0.66rem] font-semibold uppercase tracking-wide text-faint">
              {s.title}
            </div>
            <div className="space-y-1">
              {s.keys.map(([k, desc]) => (
                <div key={k + desc} className="flex items-center justify-between gap-4 text-sm">
                  <span className="text-muted">{desc}</span>
                  <kbd className="rounded-md border border-[var(--line-strong)] bg-ink-700 px-2 py-0.5 mono text-[0.72rem] font-semibold text-[var(--text)]">
                    {k}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
