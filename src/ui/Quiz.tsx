import { useEffect, useRef, useState } from 'react';
import type { Question } from '../core/types';
import { xpFor, DAILY_BONUS } from '../core/scoring';
import { DAILY_GOAL } from '../core/streak';
import { TOPIC_NAMES } from '../core/badges';
import { useApp } from '../state';
import { asset, reportUrl, formatDate } from '../data';
import { McView, type Result } from './McView';
import { MapView, MapNameView } from './MapView';
import { FlagPickView, MatchView } from './FlagViews';
import { YearView } from './YearView';
import { OrderView } from './OrderView';

const TIME_LIMIT = 25;

export interface SessionSummary { answers: { q: Question; r: Result; xp: number }[]; daily: boolean; bonus: number; streakCompletedNow: boolean }

export function Quiz({ questions, daily, onExit, onDone }: { questions: Question[]; daily: boolean; onExit: () => void; onDone: (s: SessionSummary) => void }) {
  const { answer, bonus, settings, streak } = useApp();
  const [i, setI] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [log, setLog] = useState<SessionSummary['answers']>([]);
  const [left, setLeft] = useState(TIME_LIMIT);
  const wasDone = useRef(streak.todayDone);
  const q = questions[i];

  // Timer (optional): Zeit abgelaufen = falsch
  useEffect(() => {
    if (!settings.timer || result) return;
    setLeft(TIME_LIMIT);
    const t = setInterval(() => setLeft((l) => l - 1), 1000);
    return () => clearInterval(t);
  }, [i, settings.timer, result]);
  useEffect(() => { if (settings.timer && left <= 0 && !result) submit({ ok: false, score: 0, given: '__timeout' }); }, [left]);

  function submit(r: Result) {
    const xp = xpFor(r.score, q.difficulty);
    setResult(r);
    answer(q, r.ok, xp);
    setLog((l) => [...l, { q, r, xp }]);
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
      {settings.timer && !result && <div className={'timer' + (left <= 5 ? ' urgent' : '')}>⏱ {Math.max(0, left)} s</div>}

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
          <p className="small muted">
            <a href={q.source} target="_blank" rel="noreferrer">Mehr dazu ↗</a>
            {q.topic === 'politik' && q.asOf && <> · Stand: {formatDate(q.asOf)}</>}
            {' · '}<a href={reportUrl(q)} target="_blank" rel="noreferrer">Frage melden</a>
          </p>
          <button className="btn primary wide" onClick={next} autoFocus>{i + 1 < questions.length ? 'Weiter' : 'Auswertung'}</button>
        </section>
      )}
    </div>
  );
}

export function Summary({ s, onHome, onAgain }: { s: SessionSummary; onHome: () => void; onAgain: () => void }) {
  const { streak, level } = useApp();
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
      <div className="row">
        <button className="btn ghost" onClick={onHome}>Zur Startseite</button>
        <button className="btn primary" onClick={onAgain}>Noch eine Runde</button>
      </div>
    </div>
  );
}
