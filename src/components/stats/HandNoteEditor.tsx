import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/controls";
import { Icon } from "@/components/ui/Icon";
import { useNotes, PRESET_TAGS, handKey } from "@/store/noteStore";
import type { HHHand } from "@/game/handHistory";
import { cx } from "@/lib/cx";

/** Bookmark editor for one hand: free-text note + preset/custom tags. */
export function HandNoteEditor({ hand, onClose }: { hand: HHHand | null; onClose: () => void }) {
  const notes = useNotes((s) => s.notes);
  const setNote = useNotes((s) => s.set);
  const removeNote = useNotes((s) => s.remove);

  const key = hand ? handKey(hand.startedAt) : "";
  const existing = key ? notes[key] : undefined;

  const [text, setText] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState("");

  useEffect(() => {
    setText(existing?.note ?? "");
    setTags(existing?.tags ?? []);
    setCustomTag("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!hand) return null;

  const toggleTag = (t: string) =>
    setTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));

  const customTags = tags.filter((t) => !(PRESET_TAGS as readonly string[]).includes(t));

  return (
    <Modal
      open={!!hand}
      onOpenChange={(o) => !o && onClose()}
      maxWidth={440}
      title={`Note on hand #${hand.id}`}
      description={new Date(hand.startedAt).toLocaleString()}
    >
      <div className="space-y-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What happened, and what's the lesson? (e.g. 'called the river with a bluff-catcher vs a Nit — their range had no bluffs')"
          rows={4}
          className="w-full resize-none rounded-lg border border-[var(--line)] bg-ink-700 px-3 py-2 text-sm leading-relaxed text-[var(--text)] placeholder:text-faint focus:border-gold/60 focus:outline-none"
        />
        <div>
          <div className="mb-1.5 text-[0.68rem] font-semibold uppercase tracking-wide text-faint">Tags</div>
          <div className="flex flex-wrap gap-1.5">
            {[...PRESET_TAGS, ...customTags].map((t) => (
              <button
                key={t}
                onClick={() => toggleTag(t)}
                className={cx(
                  "rounded-full px-2.5 py-1 text-[0.72rem] font-semibold transition",
                  tags.includes(t) ? "bg-gold text-ink-900" : "bg-ink-700 text-muted hover:text-[var(--text)]",
                )}
              >
                {t}
              </button>
            ))}
            <input
              type="text"
              value={customTag}
              onChange={(e) => setCustomTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && customTag.trim()) {
                  e.preventDefault();
                  toggleTag(customTag.trim().toLowerCase());
                  setCustomTag("");
                }
              }}
              placeholder="+ custom, Enter"
              className="w-[110px] rounded-full border border-dashed border-[var(--line-strong)] bg-transparent px-2.5 py-1 text-[0.72rem] text-[var(--text)] placeholder:text-faint focus:border-gold/60 focus:outline-none"
            />
          </div>
        </div>
        <div className="flex items-center justify-between">
          {existing ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                removeNote(key);
                onClose();
              }}
            >
              <Icon name="x" size={14} /> Remove note
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!text.trim() && tags.length === 0}
              onClick={() => {
                setNote(key, text.trim(), tags);
                onClose();
              }}
            >
              <Icon name="check" size={14} /> Save
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
