import { useMemo } from 'react';
import type { McQuestion } from '../core/types';
import { shuffle } from '../core/selection';

export interface Result { ok: boolean; score: number; given: string }

/** Multiple Choice. Antwortreihenfolge wird pro Anzeige gemischt. */
export function McView({ q, result, onAnswer }: { q: McQuestion; result: Result | null; onAnswer: (r: Result) => void }) {
  const order = useMemo(() => shuffle(q.choices.map((_, i) => i)), [q.id]);
  return (
    <div className="choices">
      {order.map((i) => {
        const isRight = i === q.answer;
        const chosen = result?.given === String(i);
        const cls = result ? (isRight ? 'choice right' : chosen ? 'choice wrong' : 'choice dim') : 'choice';
        return (
          <button key={i} className={cls} disabled={!!result}
            onClick={() => onAnswer({ ok: isRight, score: isRight ? 1 : 0, given: String(i) })}>
            {q.choices[i]}
          </button>
        );
      })}
    </div>
  );
}
