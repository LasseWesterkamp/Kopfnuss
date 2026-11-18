import { useState } from 'react';
import type { YearQuestion } from '../core/types';
import { yearScore, yearCorrect } from '../core/scoring';
import { formatYear } from '../data';
import type { Result } from './McView';

export function YearView({ q, result, onAnswer }: { q: YearQuestion; result: Result | null; onAnswer: (r: Result) => void }) {
  const [v, setV] = useState(Math.round((q.min + q.max) / 2));
  const clamp = (x: number) => Math.max(q.min, Math.min(q.max, x));
  const step = q.max - q.min > 400 ? 10 : 1;
  const submit = () => {
    const s = yearScore(v, q.year, q.min, q.max);
    onAnswer({ ok: yearCorrect(s), score: s, given: String(v) });
  };
  return (
    <div className="year">
      <div className="year-value" aria-live="polite">{formatYear(v)}</div>
      <input type="range" min={q.min} max={q.max} value={v} disabled={!!result}
        onChange={(e) => setV(Number(e.target.value))} aria-label="Jahr wählen" />
      <div className="year-scale"><span>{formatYear(q.min)}</span><span>{formatYear(q.max)}</span></div>
      {!result && (
        <>
          <div className="year-buttons">
            <button className="btn ghost" onClick={() => setV(clamp(v - 10 * step))}>−{10 * step}</button>
            <button className="btn ghost" onClick={() => setV(clamp(v - step))}>−{step}</button>
            <button className="btn ghost" onClick={() => setV(clamp(v + step))}>+{step}</button>
            <button className="btn ghost" onClick={() => setV(clamp(v + 10 * step))}>+{10 * step}</button>
          </div>
          <button className="btn primary wide" onClick={submit}>Antworten</button>
        </>
      )}
      {result && (
        <p className="year-result">
          Richtig: <strong>{formatYear(q.year)}</strong> · Dein Tipp: {formatYear(Number(result.given))}
          {' '}({Math.abs(Number(result.given) - q.year)} Jahre daneben, {Math.round(result.score * 100)} % Punkte)
        </p>
      )}
    </div>
  );
}
