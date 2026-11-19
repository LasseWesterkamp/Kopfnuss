import { useMemo, useState } from 'react';
import type { FlagPickQuestion, ImageInfo, MatchQuestion } from '../core/types';
import { shuffle } from '../core/selection';
import { matchScore, matchCorrect } from '../core/scoring';
import { asset } from '../data';
import type { Result } from './McView';

function FlagImg({ img, alt }: { img: ImageInfo; alt: string }) {
  return <img className="flag-tile-img" src={asset(img.src)} alt={alt} draggable={false} />;
}

/** Welche von 4 Flaggen gehört zu X? Namen erscheinen erst nach der Antwort. */
export function FlagPickView({ q, result, onAnswer }: { q: FlagPickQuestion; result: Result | null; onAnswer: (r: Result) => void }) {
  const order = useMemo(() => shuffle(q.options.map((_, i) => i)), [q.id]);
  return (
    <div className="flag-grid">
      {order.map((i) => {
        const right = i === q.answer, chosen = result?.given === String(i);
        const cls = result ? (right ? 'right' : chosen ? 'wrong' : 'dim') : '';
        return (
          <button key={i} className={'flag-tile ' + cls} disabled={!!result} aria-label={result ? q.optionLabels[i] : `Flagge ${order.indexOf(i) + 1}`}
            onClick={() => onAnswer({ ok: right, score: right ? 1 : 0, given: String(i) })}>
            <FlagImg img={q.options[i]} alt={result ? q.optionLabels[i] : 'Flagge'} />
            {result && <span className="flag-tile-label">{q.optionLabels[i]}</span>}
          </button>
        );
      })}
      {result && <p className="small muted credits">Flaggen: Wikimedia Commons ({[...new Set(q.options.map((o) => o.license))].join(', ')})</p>}
    </div>
  );
}

const PAIR_COLORS = ['c0', 'c1', 'c2', 'c3'];

/**
 * Zuordnung: erst Flagge antippen, dann Namen (oder umgekehrt). Eine Verbindung lässt sich durch erneutes Antippen lösen.
 * assignment[flaggenIndex] = namensIndex
 */
export function MatchView({ q, result, onAnswer }: { q: MatchQuestion; result: Result | null; onAnswer: (r: Result) => void }) {
  const n = q.pairs.length;
  const flagOrder = useMemo(() => shuffle([...Array(n).keys()]), [q.id]);
  const nameOrder = useMemo(() => shuffle([...Array(n).keys()]), [q.id]);
  const [assign, setAssign] = useState<number[]>(() => Array(n).fill(-1));
  const [selFlag, setSelFlag] = useState<number | null>(null);
  const [selName, setSelName] = useState<number | null>(null);
  const final: number[] | null = result ? JSON.parse(result.given) : null;
  const a = final ?? assign;
  // Farbe pro Verbindung: nach Reihenfolge der Flaggen
  const colorOfFlag = (f: number) => (!final && a[f] >= 0 ? PAIR_COLORS[flagOrder.indexOf(f)] : '');
  const flagOfName = (nm: number) => a.indexOf(nm);

  const link = (f: number, nm: number) => {
    const next = assign.map((x) => (x === nm ? -1 : x)); // Name war schon vergeben -> lösen
    next[f] = nm;
    setAssign(next); setSelFlag(null); setSelName(null);
  };
  const pickFlag = (f: number) => {
    if (result) return;
    if (assign[f] >= 0) { const next = [...assign]; next[f] = -1; setAssign(next); return; } // lösen
    if (selName !== null) link(f, selName); else setSelFlag(selFlag === f ? null : f);
  };
  const pickName = (nm: number) => {
    if (result) return;
    const f = flagOfName(nm);
    if (f >= 0) { const next = [...assign]; next[f] = -1; setAssign(next); return; }
    if (selFlag !== null) link(selFlag, nm); else setSelName(selName === nm ? null : nm);
  };
  const complete = assign.every((x) => x >= 0);

  return (
    <div className="match">
      <p className="small muted">{result ? 'Auflösung:' : 'Tippe eine Flagge und dann den passenden Namen an.'}</p>
      <div className="match-cols">
        <div className="match-flags">
          {flagOrder.map((f) => {
            const st = final ? (final[f] === f ? 'right' : 'wrong') : selFlag === f ? 'selected' : '';
            return (
              <button key={f} className={`flag-tile small ${colorOfFlag(f)} ${st}`} onClick={() => pickFlag(f)} disabled={!!result} aria-label={`Flagge ${flagOrder.indexOf(f) + 1}`}>
                <FlagImg img={q.pairs[f].image} alt="Flagge" />
                {final && <span className="flag-tile-label">{final[f] !== f && <><s className="muted">{final[f] >= 0 ? q.pairs[final[f]].label : '–'}</s><br /></>}{final[f] === f ? '✓ ' : '→ '}{q.pairs[f].label}</span>}
              </button>
            );
          })}
        </div>
        <div className="match-names">
          {nameOrder.map((nm) => {
            const f = flagOfName(nm);
            const st = final ? 'dim' : selName === nm ? 'selected' : '';
            return (
              <button key={nm} className={`choice match-name ${!final && f >= 0 ? PAIR_COLORS[flagOrder.indexOf(f)] : ''} ${st}`} onClick={() => pickName(nm)} disabled={!!result}>
                {q.pairs[nm].label}
              </button>
            );
          })}
        </div>
      </div>
      {!result && (
        <button className="btn primary wide" disabled={!complete} onClick={() => {
          const s = matchScore(assign);
          onAnswer({ ok: matchCorrect(s), score: s, given: JSON.stringify(assign) });
        }}>{complete ? 'Antworten' : `Noch ${assign.filter((x) => x < 0).length} zuordnen`}</button>
      )}
      {result && <p className="small">{Math.round(result.score * n)} von {n} Paaren richtig.</p>}
    </div>
  );
}
