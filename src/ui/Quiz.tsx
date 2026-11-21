import { useEffect, useRef, useState } from 'react';
import type { Difficulty, Question } from '../core/types';
import { xpFor, DAILY_BONUS } from '../core/scoring';
import { withTimeBonus } from '../core/round';
import { DAILY_GOAL } from '../core/streak';
import { TOPIC_NAMES } from '../core/badges';
import { useApp } from '../state';
import { asset, formatDate } from '../data';
import { ReportForm } from './ReportForm';
import { McView, type Result } from './McView';
import { MapView, MapNameView } from './MapView';
import { FlagPickView, MatchView } from './FlagViews';
import { YearView } from './YearView';
import { OrderView } from './OrderView';


export interface SessionSummary { answers: { q: Question; r: Result; xp: number }[]; daily: boolean; bonus: number; streakCompletedNow: boolean }

export function Quiz({ questions, daily, timeLimit = 0, onExit, onDone, onAnswer, title }: {
  questions: Question[]; daily: boolean; timeLimit?: number; onExit: () => void; onDone: (s: SessionSummary) => void;
  /** Duell: jede Antwort mit Zeit seit Erscheinen der Frage */ onAnswer?: (i: number, r: Result, ms: number) => void; title?: string;
}) {
  const { answer, bonus, streak } = useApp();
  const [i, setI] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [log, setLog] = useState<SessionSummary['answers']>([]);
  const [left, setLeft] = useState(timeLimit);
  const wasDone = useRef(streak.todayDone);
  const shownAt = useRef(performance.now());
  useEffect(() => { shownAt.current = performance.now(); }, [i]);
  const q = questions[i];

  // Timer (optional): Zeit abgelaufen = falsch
  useEffect(() => {
    if (!timeLimit || result) return;
    setLeft(timeLimit);
    const t = setInterval(() => setLeft((l) => l - 1), 1000);
    return () => clearInterval(t);
  }, [i, timeLimit, result]);
  useEffect(() => { if (timeLimit && left <= 0 && !result) submit({ ok: false, score: 0, given: '__timeout' }); }, [left]);

  function submit(r: Result) {
    const xp = withTimeBonus(xpFor(r.score, q.difficulty), timeLimit);
    setResult(r);
    answer(q, r.ok, xp);
    setLog((l) => [...l, { q, r, xp }]);
    onAnswer?.(i, r, Math.round(performance.now() - shownAt.current));
  }
  function next() {
    if (i + 1 < questions.length) { setI(i + 1); setResult(null); return; }
    const b = daily && !wasDone.current ? DAILY_BONUS : 0; // Bonus nur für die erste Tagesrunde
    if (b) bonus(b);
    onDone({ answers: log, daily, bonus: b, streakCompletedNow: !wasDone.current });
  }

  const flagSrc = q.type === 'mc' && q.flag ? asset(`flags/${q.flag}.svg`) : null;
  return (
    <div className="quiz">
      <header className="quiz-head">
        <button className="icon-btn" aria-label="Runde beenden" onClick={onExit}>✕</button>
        <div className="progressbar" aria-label={`Frage ${i + 1} von ${questions.length}`}>
          <div style={{ width: `${((i + (result ? 1 : 0)) / questions.length) * 100}%` }} />
        </div>
        <span className="muted small">{i + 1}/{questions.length}</span>
      </header>
      {title && <p className="quiz-title small">{title}</p>}
      {timeLimit > 0 && !result && <div className={'timer' + (left <= 5 ? ' urgent' : '')}>⏱ {Math.max(0, left)} s</div>}

      <div className="q-meta">
        <span className={'chip topic-' + q.topic}>{TOPIC_NAMES[q.topic]}</span>
        <span className="chip">{'●'.repeat(q.difficulty)}{'○'.repeat(3 - q.difficulty)}</span>
      </div>
      <h2 className="q-prompt">{q.prompt}</h2>

      {flagSrc && <img className="flag" src={flagSrc} alt="Flagge" />}
      {q.image && (
        <figure className={"q-image" + (q.topic === "regionen" ? " flag-img" : "")}>
          <img src={asset(q.image.src)} alt="Bild zur Frage" />
          <figcaption>
            {q.image.author} · <a href={q.image.licenseUrl ?? q.image.sourceUrl} target="_blank" rel="noreferrer">{q.image.license}</a> ·{' '}
            <a href={q.image.sourceUrl} target="_blank" rel="noreferrer">Quelle</a>
          </figcaption>
        </figure>
      )}

      {q.type === 'mc' && <McView key={q.id} q={q} result={result} onAnswer={submit} />}
      {q.type === 'map' && <MapView key={q.id} q={q} result={result} onAnswer={submit} />}
      {q.type === 'mapname' && <MapNameView key={q.id} q={q} result={result} onAnswer={submit} />}
      {q.type === 'flagpick' && <FlagPickView key={q.id} q={q} result={result} onAnswer={submit} />}
      {q.type === 'match' && <MatchView key={q.id} q={q} result={result} onAnswer={submit} />}
      {q.type === 'year' && <YearView key={q.id} q={q} result={result} onAnswer={submit} />}
      {q.type === 'order' && <OrderView key={q.id} q={q} result={result} onAnswer={submit} />}

      {result && (
        <section className={'feedback ' + (result.ok ? 'ok' : result.score > 0 ? 'partial' : 'bad')}>
          <h3>{result.given === '__timeout' ? '⏱ Zeit abgelaufen' : result.ok ? '✓ Richtig!' : result.score > 0 ? '≈ Fast' : '✗ Leider falsch'}
            <span className="xp">+{log[log.length - 1]?.xp ?? 0} XP</span></h3>
          {(q.type === 'mc' || q.type === 'mapname') && !result.ok && <p>Richtig ist: <strong>{q.choices[q.answer]}</strong></p>}
          {q.type === 'flagpick' && !result.ok && <p>Richtig ist die Flagge von <strong>{q.optionLabels[q.answer]}</strong>.</p>}
          <p>{q.explanation}</p>
          <div className="small muted fb-links">
            <a href={q.source} target="_blank" rel="noreferrer">Mehr dazu ↗</a>
            {q.topic === 'politik' && q.asOf && <span> · Stand: {formatDate(q.asOf)}</span>}
            {' · '}<ReportForm key={q.id} q={q} />
          </div>
          <button className="btn primary wide" onClick={next} autoFocus>{i + 1 < questions.length ? 'Weiter' : 'Auswertung'}</button>
        </section>
      )}
    </div>
  );
}

const DIFFS: { d: Difficulty | undefined; label: string }[] = [{ d: undefined, label: 'Adaptiv' }, { d: 1, label: 'Leicht' }, { d: 2, label: 'Mittel' }, { d: 3, label: 'Schwer' }];

export function Summary({ s, label, currentDifficulty, timeLimit, onHome, onAgain }: {
  s: SessionSummary; label?: string; currentDifficulty?: Difficulty; timeLimit?: number; onHome: () => void; onAgain: (d: Difficulty | undefined) => void;
}) {
  const { streak, level } = useApp();
  const [diff, setDiff] = useState<Difficulty | undefined>(currentDifficulty);
  const right = s.answers.filter((a) => a.r.ok).length;
  const xp = s.answers.reduce((t, a) => t + a.xp, 0) + s.bonus;
  return (
    <div className="summary">
      <div className="big-emoji">{right / s.answers.length >= 0.8 ? '🎉' : right / s.answers.length >= 0.5 ? '👍' : '💪'}</div>
      <h2>{right} von {s.answers.length} richtig</h2>
      <p className="muted">+{xp} XP{s.bonus ? ` (inkl. ${s.bonus} Bonus für die Tages-Challenge)` : ''} · Level {level.level}</p>
      {streak.todayDone && <p className="streak-msg">🔥 Tagesziel erreicht! Serie: <strong>{streak.current} {streak.current === 1 ? 'Tag' : 'Tage'}</strong></p>}
      {!streak.todayDone && <p className="muted">Heute: {streak.todayCount} von {DAILY_GOAL} Fragen fürs Tagesziel.</p>}
      <ul className="review-list">
        {s.answers.map(({ q, r }) => (
          <li key={q.id} className={r.ok ? 'right' : 'wrong'}>
            <span>{r.ok ? '✓' : '✗'}</span> {q.prompt}
            {(q.type === 'mc' || q.type === 'mapname') && !r.ok && <em> → {q.choices[q.answer]}</em>}
          </li>
        ))}
      </ul>
      <p className="small muted">Falsch beantwortete Fragen kommen morgen wieder. Richtige erst nach 1, 3, 7, 21 und 60 Tagen.</p>
      <div className="again card">
        <p className="small"><strong>Nochmal spielen</strong>{label ? ` (${label})` : ''}: Schwierigkeit wählen{timeLimit ? <span className="chip time-chip">⏱ {timeLimit} s pro Frage</span> : null}</p>
        <div className="seg" role="radiogroup" aria-label="Schwierigkeit">
          {DIFFS.map((x) => (
            <button key={x.label} role="radio" aria-checked={diff === x.d} className={diff === x.d ? 'on' : ''} onClick={() => setDiff(x.d)}>{x.label}</button>
          ))}
        </div>
        <div className="row">
          <button className="btn ghost" onClick={onHome}>Zur Startseite</button>
          <button className="btn primary" onClick={() => onAgain(diff)}>Noch eine Runde</button>
        </div>
      </div>
    </div>
  );
}
