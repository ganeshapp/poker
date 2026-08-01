import { useMemo, useState } from "react";
import { cx } from "@/lib/cx";
import { Icon } from "@/components/ui/Icon";
import { useStudy } from "@/store/studyStore";
import { hashSeed } from "@/engine/equity";

export interface QuizQuestion {
  q: string;
  options: string[];
  answer: number;
  explain: string;
}

const LETTERS = ["A", "B", "C", "D", "E"];

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Optional practice quiz — never gates lesson completion.
    Options are shuffled every time (no position patterns to learn),
    results persist across restarts, previously-missed questions come
    first, and wrong answers can be retried with a fresh shuffle. */
export function Quiz({ questions, title = "Practice" }: { questions: QuizQuestion[]; title?: string }) {
  const recordQuiz = useStudy((s) => s.recordQuiz);
  const results = useStudy((s) => s.quizResults);

  const keys = useMemo(() => questions.map((qq) => String(hashSeed(qq.q))), [questions]);

  // Previously-missed questions surface first.
  const order = useMemo(() => {
    const idx = questions.map((_, i) => i);
    const missed = idx.filter((i) => results[keys[i]] && !results[keys[i]].lastCorrect);
    const rest = idx.filter((i) => !missed.includes(i));
    return [...shuffled(missed), ...shuffled(rest)];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions]);

  // Option permutation per question; a retry reshuffles only that one.
  const [perms, setPerms] = useState<Record<number, number[]>>(() => {
    const p: Record<number, number[]> = {};
    questions.forEach((qq, i) => (p[i] = shuffled(qq.options.map((_, k) => k))));
    return p;
  });
  const permFor = (qi: number) => perms[qi] ?? questions[qi].options.map((_, i) => i);

  const [picked, setPicked] = useState<Record<number, number>>({});
  const missedBefore = order.filter((i) => results[keys[i]] && !results[keys[i]].lastCorrect).length;

  return (
    <div className="rounded-2xl border border-info/25 bg-info/[0.06] p-4">
      <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-info">
        <Icon name="target" size={16} /> {title}
        <span className="ml-1 rounded-full bg-info/15 px-2 py-0.5 text-[0.62rem] font-medium uppercase tracking-wide text-info">
          optional
        </span>
      </div>
      <p className="text-[0.74rem] text-faint">
        Test yourself — this doesn't affect lesson completion.
        {missedBefore > 0 && (
          <span className="ml-1 text-warn">You missed {missedBefore} of these before — they're up first.</span>
        )}
      </p>

      {order.map((qi, displayIdx) => {
        const qq = questions[qi];
        const perm = permFor(qi);
        const sel = picked[qi];
        const answered = sel !== undefined;
        const selCorrect = answered && perm[sel] === qq.answer;
        return (
          <div key={qi} className="mt-4">
            <div className="font-medium text-[var(--text)]">
              {displayIdx + 1}. {qq.q}
            </div>
            <div className="mt-2 grid gap-1.5">
              {perm.map((optIdx, oi) => {
                const isPicked = sel === oi;
                const correct = optIdx === qq.answer;
                let cls = "border-[var(--line)] bg-ink-800 text-muted hover:bg-ink-700";
                if (answered && correct) cls = "border-good bg-good/15 text-[var(--text)]";
                else if (answered && isPicked && !correct) cls = "border-bad bg-bad/15 text-[var(--text)]";
                return (
                  <button
                    key={oi}
                    disabled={answered}
                    onClick={() => {
                      setPicked((p) => ({ ...p, [qi]: oi }));
                      recordQuiz(keys[qi], optIdx === qq.answer);
                    }}
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
                    {qq.options[optIdx]}
                  </button>
                );
              })}
            </div>
            {answered && (
              <div className="mt-2 text-[0.8rem] leading-relaxed text-muted">
                <span className={cx("font-semibold", selCorrect ? "text-good" : "text-warn")}>
                  {selCorrect ? "Correct. " : "Not quite. "}
                </span>
                {qq.explain}
                {!selCorrect && (
                  <button
                    onClick={() => {
                      setPicked((p) => {
                        const n = { ...p };
                        delete n[qi];
                        return n;
                      });
                      setPerms((p) => ({ ...p, [qi]: shuffled(questions[qi].options.map((_, k) => k)) }));
                    }}
                    className="ml-2 font-semibold text-gold hover:text-gold-light"
                  >
                    Try again
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
