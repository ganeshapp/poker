import { useState } from "react";
import { cx } from "@/lib/cx";
import { Icon } from "@/components/ui/Icon";

export interface QuizQuestion {
  q: string;
  options: string[];
  answer: number;
  explain: string;
}

const LETTERS = ["A", "B", "C", "D", "E"];

/** Optional practice quiz — never gates lesson completion. */
export function Quiz({ questions, title = "Practice" }: { questions: QuizQuestion[]; title?: string }) {
  const [picked, setPicked] = useState<Record<number, number>>({});

  return (
    <div className="rounded-2xl border border-info/25 bg-info/[0.06] p-4">
      <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-info">
        <Icon name="target" size={16} /> {title}
        <span className="ml-1 rounded-full bg-info/15 px-2 py-0.5 text-[0.62rem] font-medium uppercase tracking-wide text-info">
          optional
        </span>
      </div>
      <p className="text-[0.74rem] text-faint">Test yourself — this doesn't affect lesson completion.</p>

      {questions.map((qq, qi) => {
        const sel = picked[qi];
        const answered = sel !== undefined;
        return (
          <div key={qi} className="mt-4">
            <div className="font-medium text-[var(--text)]">
              {qi + 1}. {qq.q}
            </div>
            <div className="mt-2 grid gap-1.5">
              {qq.options.map((opt, oi) => {
                const isPicked = sel === oi;
                const correct = oi === qq.answer;
                let cls = "border-[var(--line)] bg-ink-800 text-muted hover:bg-ink-700";
                if (answered && correct) cls = "border-good bg-good/15 text-[var(--text)]";
                else if (answered && isPicked && !correct) cls = "border-bad bg-bad/15 text-[var(--text)]";
                return (
                  <button
                    key={oi}
                    disabled={answered}
                    onClick={() => setPicked((p) => ({ ...p, [qi]: oi }))}
                    className={cx(
                      "flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-[0.84rem] transition disabled:cursor-default",
                      cls,
                    )}
                  >
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-black/20 text-[0.66rem] font-bold">
                      {answered && correct ? (
                        <Icon name="check" size={12} strokeWidth={3} />
                      ) : answered && isPicked ? (
                        <Icon name="x" size={12} strokeWidth={3} />
                      ) : (
                        LETTERS[oi]
                      )}
                    </span>
                    {opt}
                  </button>
                );
              })}
            </div>
            {answered && (
              <div className="mt-2 text-[0.8rem] leading-relaxed text-muted">
                <span className={cx("font-semibold", sel === qq.answer ? "text-good" : "text-warn")}>
                  {sel === qq.answer ? "Correct. " : "Not quite. "}
                </span>
                {qq.explain}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
