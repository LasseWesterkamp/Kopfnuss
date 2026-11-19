import { useEffect, useMemo, useRef, useState } from 'react';
import type { Question } from '../core/types';
import { startPuzzle, tap, next, isDone, summary, currentTarget, isBetter, MAX_TRIES, type PuzzleState } from '../core/puzzle';
import { xpFor } from '../core/scoring';
import { REGION_LAENDER } from '../core/subtopics';
import { useApp } from '../state';
import { MapCanvas } from './MapCanvas';

const K_BEST = 'kopfnuss.puzzle.best.v1';
type Best = Record<string, { ms: number; errors: number }>;
export function loadBest(): Best { try { return JSON.parse(localStorage.getItem(K_BEST) ?? '{}'); } catch { return {}; } }
function saveBest(b: Best) { try { localStorage.setItem(K_BEST, JSON.stringify(b)); } catch { /* egal */ } }
export const fmtTime = (ms: number) => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/** Kartenfrage "Wo liegt X?" einer Region (für Wertung, Name und Wiederholung) */
const mapQuestionOf = (questions: Question[], iso: string) => questions.find((q) => q.id === 'reg-map-' + iso.toLowerCase());

export function Puzzle({ cc, onExit }: { cc: string; onExit: () => void }) {
  const { questions, answer } = useApp();
  const land = REGION_LAENDER.find((l) => l.id === cc)!;
  const regionQs = useMemo(() => (questions ?? []).filter((q) => q.type === 'map' && q.regions && q.continent === cc), [questions, cc]);
  // Namen aus den Daten der "markierte Region benennen"-Fragen (choices[answer] = Name)
  const names = useMemo(() => {
    const out: Record<string, string> = {};
    for (const q of questions ?? []) if (q.type === 'mapname' && q.continent === cc) out[q.country] = q.choices[q.answer];
    return out;
  }, [questions, cc]);
  const [s, setS] = useState<PuzzleState>(() => startPuzzle(regionQs.map((q) => (q.type === 'map' ? q.country : ''))));
  const [flash, setFlash] = useState<string | null>(null);
  const [start, setStart] = useState(() => Date.now());
  const [now, setNow] = useState(Date.now());
  const [end, setEnd] = useState<{ ms: number; newBest: boolean; prev?: { ms: number; errors: number } } | null>(null);
  const flashTimer = useRef<number>();

  useEffect(() => { if (end) return; const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, [end]);

  const onPick = (iso: string) => {
    const r = tap(s, iso);
    if (r.outcome === 'ignoriert') return;
    if (r.outcome === 'falsch' || r.outcome === 'aufgedeckt') {
      setFlash(iso); clearTimeout(flashTimer.current); flashTimer.current = window.setTimeout(() => setFlash(null), 600);
    }
    if (r.finished) {
      const q = mapQuestionOf(questions ?? [], r.finished.iso);
      if (q) answer(q, r.finished.ok, r.finished.ok ? xpFor(1, q.difficulty) : 0);
    }
    setS(r.state);
    if (isDone(r.state)) finish(r.state);
  };
  const onNext = () => { const n = next(s); setS(n); if (isDone(n)) finish(n); };
  const finish = (st: PuzzleState) => {
    const ms = Date.now() - start;
    const best = loadBest();
    const cur = { ms, errors: st.errors };
    const newBest = isBetter(best[cc] ?? null, cur);
    if (newBest) { best[cc] = cur; saveBest(best); }
    setEnd({ ms, newBest, prev: newBest ? undefined : best[cc] });
  };

  const target = currentTarget(s);
  const solved = new Set(s.order.slice(0, s.index));
  const classFor = (id: string) => {
    if (s.revealed === id) return 'reveal';
    if (flash === id) return 'flash';
    if (solved.has(id)) return s.results[id] ? 'solved' : 'reveal';
    return '';
  };
  const sum = summary(s);

  if (end) {
    return (
      <div className="puzzle">
        <div className="summary">
          <div className="big-emoji">{sum.accuracy === 1 ? '🏆' : sum.accuracy >= 0.7 ? '🎉' : '💪'}</div>
          <h2>{land.name} geschafft!</h2>
          <p><strong>{fmtTime(end.ms)}</strong> · {sum.firstTry} von {sum.total} im ersten Versuch · {sum.errors} Fehler</p>
          <p className={end.newBest ? 'streak-msg' : 'muted'}>{end.newBest ? '⭐ Neue Bestzeit!' : `Bestzeit: ${fmtTime(end.prev!.ms)} (${end.prev!.errors} Fehler)`}</p>
          <p className="small muted">Jedes im ersten Versuch getroffene Gebiet zählt als richtig beantwortete Kartenfrage, Fehlversuche kommen in die Wiederholung.</p>
          <MapCanvas regions area={cc} classFor={classFor} resetKey="end" />
          <div className="row">
            <button className="btn ghost" onClick={onExit}>Zurück</button>
            <button className="btn primary" onClick={() => { setS(startPuzzle(s.order)); setStart(Date.now()); setNow(Date.now()); setEnd(null); }}>Nochmal</button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="puzzle">
      <header className="quiz-head">
        <button className="icon-btn" aria-label="Puzzle beenden" onClick={onExit}>✕</button>
        <div className="progressbar"><div style={{ width: `${(s.index / s.order.length) * 100}%` }} /></div>
        <span className="muted small">{s.index}/{s.order.length}</span>
      </header>
      <div className="puzzle-bar">
        <span>{land.icon} {land.name}</span>
        <span className="muted small">⏱ {fmtTime(now - start)} · ✗ {s.errors}</span>
      </div>
      <div className={'puzzle-target' + (s.revealed ? ' revealed' : '')} aria-live="polite">
        {s.revealed ? <>Das war <strong>{names[s.revealed]}</strong> (gelb markiert)</> : <>Tippe: <strong>{target ? names[target] : ''}</strong>
          {s.tries > 0 && <span className="muted small"> · noch {MAX_TRIES - s.tries} {MAX_TRIES - s.tries === 1 ? 'Versuch' : 'Versuche'}</span>}</>}
      </div>
      <MapCanvas regions area={cc} classFor={classFor} onPick={s.revealed ? undefined : onPick} resetKey={cc} />
      {s.revealed && <button className="btn primary wide" onClick={onNext} autoFocus>Weiter</button>}
      <p className="small muted">Grün: im ersten Versuch richtig · Gelb: aufgedeckt · Zoomen mit + und −, verschieben durch Ziehen.</p>
    </div>
  );
}
