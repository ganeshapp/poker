import { useMemo, useState } from "react";
import { useStudy } from "@/store/studyStore";
import { LEVELS, ALL_LESSON_IDS } from "@/components/study/lessons";
import { Icon } from "@/components/ui/Icon";
import { Button, ProgressBar } from "@/components/ui/controls";
import { cx } from "@/lib/cx";

export function StudyView() {
  const completed = useStudy((s) => s.completed);
  const complete = useStudy((s) => s.complete);
  const [activeId, setActiveId] = useState(LEVELS[0].lessons[0].id);

  const { lesson, level } = useMemo(() => {
    for (const lv of LEVELS) {
      const ls = lv.lessons.find((x) => x.id === activeId);
      if (ls) return { lesson: ls, level: lv };
    }
    return { lesson: LEVELS[0].lessons[0], level: LEVELS[0] };
  }, [activeId]);

  const idx = ALL_LESSON_IDS.indexOf(activeId);
  const nextId = ALL_LESSON_IDS[idx + 1];
  const done = completed.includes(activeId);
  const pct = (completed.length / ALL_LESSON_IDS.length) * 100;

  return (
    <div className="flex h-full min-h-0">
      {/* Path nav */}
      <nav className="flex w-[310px] shrink-0 flex-col overflow-auto border-r border-[var(--line)] bg-ink-850/60 p-4">
        <div className="mb-4">
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="font-semibold text-[var(--text)]">Your progress</span>
            <span className="mono text-muted">
              {completed.length}/{ALL_LESSON_IDS.length}
            </span>
          </div>
          <ProgressBar value={pct} />
        </div>

        <div className="space-y-5">
          {LEVELS.map((lv, li) => {
            const lvDone = lv.lessons.filter((x) => completed.includes(x.id)).length;
            return (
              <div key={lv.id}>
                <div className="mb-2 flex items-center gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-gold/15 text-gold">
                    <Icon name={lv.icon} size={15} />
                  </span>
                  <div>
                    <div className="text-sm font-bold text-[var(--text)]">
                      <span className="text-faint">L{li + 1}</span> {lv.title}
                    </div>
                  </div>
                  <span className="mono ml-auto text-[0.66rem] text-faint">
                    {lvDone}/{lv.lessons.length}
                  </span>
                </div>
                <div className="ml-2 space-y-1 border-l border-[var(--line)] pl-3">
                  {lv.lessons.map((ls) => {
                    const isActive = ls.id === activeId;
                    const isDone = completed.includes(ls.id);
                    return (
                      <button
                        key={ls.id}
                        onClick={() => setActiveId(ls.id)}
                        className={cx(
                          "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[0.82rem] transition",
                          isActive ? "bg-gold/15 text-[var(--text)]" : "text-muted hover:bg-white/5",
                        )}
                      >
                        <span
                          className={cx(
                            "grid h-4 w-4 shrink-0 place-items-center rounded-full border",
                            isDone ? "border-good bg-good text-ink-900" : "border-[var(--line-strong)]",
                          )}
                        >
                          {isDone && <Icon name="check" size={11} strokeWidth={3} />}
                        </span>
                        <span className="flex-1 truncate">{ls.title}</span>
                        <span className="mono text-[0.62rem] text-faint">{ls.minutes}m</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </nav>

      {/* Lesson content */}
      <main key={activeId} className="min-w-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-[760px] px-8 py-7">
          <div className="mb-1 text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-gold/80">
            {level.title}
          </div>
          <h1 className="font-display text-3xl font-extrabold text-[var(--text)]">{lesson.title}</h1>
          <div className="mb-6 mt-1 text-sm text-faint">{lesson.minutes} min read</div>

          <div className="space-y-4">{lesson.body()}</div>

          <div className="mt-8 flex items-center justify-between border-t border-[var(--line)] pt-5">
            <Button variant={done ? "secondary" : "primary"} onClick={() => complete(activeId)} disabled={done}>
              {done ? (
                <>
                  <Icon name="check" size={16} /> Completed
                </>
              ) : (
                "Mark complete"
              )}
            </Button>
            {nextId && (
              <Button
                variant="outline"
                onClick={() => {
                  complete(activeId);
                  setActiveId(nextId);
                }}
              >
                Next lesson <Icon name="arrow-right" size={15} />
              </Button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
