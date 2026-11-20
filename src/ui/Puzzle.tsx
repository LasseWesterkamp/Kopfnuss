import { useEffect, useMemo, useRef, useState } from 'react';
import type { Question } from '../core/types';
import { startPuzzle, tap, next, isDone, summary, currentTarget, isBetter, showHint, bestKey, bestOf, LEVELS,
  type PuzzleState, type PuzzleLevel, type BestTimes } from '../core/puzzle';
import { worldItems, type PuzzleDef, type WorldCountry } from '../core/puzzles';
import { xpFor } from '../core/scoring';
import { asset } from '../data';
import { useApp } from '../state';
import { MapCanvas } from './MapCanvas';

const K_BEST = 'kopfnuss.puzzle.best.v1';
const K_LEVEL = 'kopfnuss.puzzle.level.v1';
export function loadBest(): BestTimes { try { return JSON.parse(localStorage.getItem(K_BEST) ?? '{}'); } catch { return {}; } }
function saveBest(b: BestTimes) { try { localStorage.setItem(K_BEST, JSON.stringify(b)); } catch { /* egal */ } }
export function loadLevel(): PuzzleLevel { try { const l = localStorage.getItem(K_LEVEL); return l === 'leicht' || l === 'schwer' ? l : 'mittel'; } catch { return 'mittel'; } }
function saveLevel(l: PuzzleLevel) { try { localStorage.setItem(K_LEVEL, l); } catch { /* egal */ } }
export const fmtTime = (ms: number) => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

let worldCache: Promise<WorldCountry[]> | null = null;
const loadWorld = () => (worldCache ??= fetch(asset('data/world-puzzle.json')).then((r) => r.json()).then((d) => d.countries as WorldCountry[]));

interface Item { id: string; name: string; questionId: string | null }

/** Gebiete eines Puzzles: id = Kennung auf der Karte, questionId = zugehörige Kartenfrage (für Wertung) */
function useItems(def: PuzzleDef, questions: Question[] | null): Item[] | null {
  const [world, setWorld] = useState<WorldCountry[] | null>(null);
  useEffect(() => { if (def.kind === 'welt') loadWorld().then(setWorld); }, [def.kind]);
  return useMemo(() => {
    if (def.kind === 'welt') return world ? worldItems(world, def.area).map((c) => ({ id: c.num, name: c.name, questionId: c.mapQuestion })) : null;
    if (!questions) return null;
    return questions.flatMap((q) => (q.type === 'mapname' && q.continent === def.area
      ? [{ id: q.country, name: q.choices[q.answer], questionId: 'reg-map-' + q.country.toLowerCase() }] : []));
  }, [def, world, questions]);
}

export function LevelPicker({ value, onChange }: { value: PuzzleLevel; onChange: (l: PuzzleLevel) => void }) {
  return (
    <div className="seg" role="radiogroup" aria-label="Schwierigkeit">
      {(Object.keys(LEVELS) as PuzzleLevel[]).map((l) => (
        <button key={l} role="radio" aria-checked={value === l} className={value === l ? 'on' : ''} onClick={() => onChange(l)} title={LEVELS[l].info}>
          {LEVELS[l].label}
        </button>
      ))}
    </div>
  );
}

export function Puzzle({ def, onExit }: { def: PuzzleDef; onExit: () => void }) {
  const { questions, answer } = useApp();
  const items = useItems(def, questions);
  const [level, setLevel] = useState<PuzzleLevel>(loadLevel);
  const [run, setRun] = useState(0); // erhöhen = neu starten
  if (!items) return <div className="puzzle"><p className="muted">Karte lädt …</p></div>;
  return <PuzzleRun key={run} def={def} items={items} level={level} questions={questions ?? []} answer={answer} onExit={onExit}
    onAgain={(l) => { setLevel(l); saveLevel(l); setRun((r) => r + 1); }} />;
}

function PuzzleRun({ def, items, level, questions, answer, onExit, onAgain }: {
  def: PuzzleDef; items: Item[]; level: PuzzleLevel; questions: Question[];
  answer: (q: Question, ok: boolean, xp: number) => void; onExit: () => void; onAgain: (l: PuzzleLevel) => void;
}) {
  const names = useMemo(() => Object.fromEntries(items.map((i) => [i.id, i.name])), [items]);
  const targets = useMemo(() => new Set(items.map((i) => i.id)), [items]);
  const qById = useMemo(() => new Map(questions.map((q) => [q.id, q])), [questions]);
  const [s, setS] = useState<PuzzleState>(() => startPuzzle(items.map((i) => i.id), Math.random, level));
  const [flash, setFlash] = useState<string | null>(null);
  const [start] = useState(() => Date.now());
  const [now, setNow] = useState(Date.now());
  const [end, setEnd] = useState<{ ms: number; newBest: boolean; prev: { ms: number; errors: number } | null } | null>(null);
  const [nextLevel, setNextLevel] = useState<PuzzleLevel>(level);
  const flashTimer = useRef<number>();

  useEffect(() => { if (end) return; const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, [end]);

  const finish = (st: PuzzleState) => {
    const ms = Date.now() - start;
    const best = loadBest();
    const prev = bestOf(best, def.key, level);
    const cur = { ms, errors: st.errors };
    const newBest = isBetter(prev, cur);
    if (newBest) { best[bestKey(def.key, level)] = cur; saveBest(best); }
    setEnd({ ms, newBest, prev });
  };
  const onPick = (id: string) => {
    if (!targets.has(id)) return; // Gebiete, die nicht zum Puzzle gehören (z.B. abhängige Gebiete), ignorieren
    const r = tap(s, id);
    if (r.outcome === 'ignoriert') return;
    if (r.outcome === 'falsch' || r.outcome === 'aufgedeckt') {
      setFlash(id); clearTimeout(flashTimer.current); flashTimer.current = window.setTimeout(() => setFlash(null), 600);
    }
    if (r.finished) {
      const qid = items.find((i) => i.id === r.finished!.iso)?.questionId;
      const q = qid ? qById.get(qid) : undefined;
      if (q) answer(q, r.finished.ok, r.finished.ok ? xpFor(1, q.difficulty) : 0);
    }
    setS(r.state);
    if (isDone(r.state)) finish(r.state);
  };
  const onNext = () => { const n = next(s); setS(n); if (isDone(n)) finish(n); };

  const target = currentTarget(s);
  const solved = new Set(s.order.slice(0, s.index));
  const hint = showHint(s) ? target : null;
  const classFor = (id: string) => {
    if (s.revealed === id) return 'reveal';
    if (flash === id) return 'flash';
    if (solved.has(id)) return s.results[id] ? 'solved' : 'reveal';
    if (hint === id) return 'hint';
    return '';
  };
  const sum = summary(s);
  const mapProps = { regions: def.kind === 'regionen', world50: def.kind === 'welt', targets, area: def.area, classFor };
  const left = s.maxTries - s.tries;

  if (end) {
    return (
      <div className="puzzle">
        <div className="summary">
          <div className="big-emoji">{sum.accuracy === 1 ? '🏆' : sum.accuracy >= 0.7 ? '🎉' : '💪'}</div>
          <h2>{def.name} geschafft!</h2>
          <p><strong>{fmtTime(end.ms)}</strong> · {sum.firstTry} von {sum.total} im ersten Versuch · {sum.errors} Fehler · Stufe {LEVELS[level].label}</p>
          <p className={end.newBest ? 'streak-msg' : 'muted'}>{end.newBest ? '⭐ Neue Bestzeit für diese Stufe!' : `Bestzeit (${LEVELS[level].label}): ${fmtTime(end.prev!.ms)} mit ${end.prev!.errors} Fehlern`}</p>
          <MapCanvas {...mapProps} resetKey="end" />
          <p className="small muted">Treffer im ersten Versuch zählen als richtige Kartenfrage, Fehlversuche kommen in die Wiederholung.</p>
          <div className="again card">
            <p className="small"><strong>Nochmal spielen</strong>: Schwierigkeit wählen</p>
            <LevelPicker value={nextLevel} onChange={setNextLevel} />
            <p className="small muted">{LEVELS[nextLevel].info}</p>
            <div className="row">
              <button className="btn ghost" onClick={onExit}>Zurück</button>
              <button className="btn primary" onClick={() => onAgain(nextLevel)}>Nochmal</button>
            </div>
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
        <span>{def.icon} {def.name} <span className="chip">{LEVELS[level].label}</span></span>
        <span className="muted small">⏱ {fmtTime(now - start)} · ✗ {s.errors}</span>
      </div>
      <div className={'puzzle-target' + (s.revealed ? ' revealed' : '')} aria-live="polite">
        {s.revealed ? <>Das war <strong>{names[s.revealed]}</strong> (gelb markiert)</> : <>Tippe: <strong>{target ? names[target] : ''}</strong>
          {s.tries > 0 && <span className="muted small"> · noch {left} {left === 1 ? 'Versuch' : 'Versuche'}{hint ? ' · Hinweis: blinkt' : ''}</span>}</>}
      </div>
      <MapCanvas {...mapProps} onPick={s.revealed ? undefined : onPick} resetKey={def.key} />
      {s.revealed && <button className="btn primary wide" onClick={onNext} autoFocus>Weiter</button>}
      <p className="small muted">Grün: im ersten Versuch richtig · Gelb: aufgedeckt · Kleine Länder als Kreis · Zoomen mit zwei Fingern, Mausrad oder + / −, verschieben durch Ziehen.</p>
    </div>
  );
}
