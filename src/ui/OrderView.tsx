import { useMemo, useState } from 'react';
import type { OrderQuestion } from '../core/types';
import { shuffle } from '../core/selection';
import { orderScore } from '../core/scoring';
import { formatYear } from '../data';
import type { Result } from './McView';

/** Reihenfolge per Pfeil-Buttons (zuverlässiger als Drag & Drop auf dem Handy) */
export function OrderView({ q, result, onAnswer }: { q: OrderQuestion; result: Result | null; onAnswer: (r: Result) => void }) {
  const correct = useMemo(() => q.items.map((_, i) => i).sort((a, b) => q.items[a].year - q.items[b].year), [q.id]);
  const [order, setOrder] = useState(() => {
    let s = shuffle(correct);
    for (let t = 0; t < 5 && s.every((v, i) => v === correct[i]); t++) s = shuffle(correct);
    return s;
  });
  const given: number[] = result ? JSON.parse(result.given) : order;
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= order.length) return;
    const n = [...order];
    [n[i], n[j]] = [n[j], n[i]];
    setOrder(n);
  };
  return (
    <div className="order">
      <ol>
        {given.map((idx, i) => {
          const it = q.items[idx];
          const ok = result ? correct[i] === idx : null;
          return (
            <li key={idx} className={ok === null ? '' : ok ? 'right' : 'wrong'}>
              <span className="order-label">{it.label}{result && <em> · {formatYear(it.year)}</em>}</span>
              {!result && (
                <span className="order-btns">
                  <button className="icon-btn" aria-label="nach oben" disabled={i === 0} onClick={() => move(i, -1)}>▲</button>
                  <button className="icon-btn" aria-label="nach unten" disabled={i === given.length - 1} onClick={() => move(i, 1)}>▼</button>
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {!result && (
        <button className="btn primary wide" onClick={() => {
          const s = orderScore(order, correct);
          onAnswer({ ok: s === 1, score: s, given: JSON.stringify(order) });
        }}>Antworten</button>
      )}
      {result && result.score < 1 && (
        <p className="muted">Richtige Reihenfolge: {correct.map((i) => q.items[i].label).join(' → ')}</p>
      )}
    </div>
  );
}
