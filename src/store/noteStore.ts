import { create } from "zustand";

/* Hand notes, bookmarks, and tags — the personal study notebook.
   Keyed by the hand's startedAt timestamp (globally unique; the same
   key the exporter derives its hand ids from). */

const KEY = "allin.handnotes.v1";

export const PRESET_TAGS = ["review later", "bluff-catch", "thin value", "weird line", "big pot"] as const;

export interface HandNote {
  note: string;
  tags: string[];
  ts: number;
}

function load(): Record<string, HandNote> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}

function save(n: Record<string, HandNote>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(n));
  } catch {
    /* ignore quota */
  }
}

interface NoteState {
  notes: Record<string, HandNote>;
  set: (key: string, note: string, tags: string[]) => void;
  remove: (key: string) => void;
}

export const useNotes = create<NoteState>((set) => ({
  notes: load(),
  set: (key, note, tags) =>
    set((st) => {
      const notes = { ...st.notes, [key]: { note, tags, ts: Date.now() } };
      save(notes);
      return { notes };
    }),
  remove: (key) =>
    set((st) => {
      const notes = { ...st.notes };
      delete notes[key];
      save(notes);
      return { notes };
    }),
}));

export const handKey = (startedAt: number) => String(startedAt);
