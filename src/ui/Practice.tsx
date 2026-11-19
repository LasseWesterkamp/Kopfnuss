import { useState } from 'react';
import type { Difficulty, TopicId } from '../core/types';
import { TOPIC_NAMES } from '../core/badges';
import { MASTERED_BOX } from '../core/srs';
import { targetDifficulty, matchesFilter } from '../core/selection';
import { SUBTOPICS } from '../core/subtopics';
import { useApp } from '../state';
import { TOPIC_ICONS, TOPIC_ORDER } from './Home';

export function Practice({ initial, onStart }: { initial: TopicId | null; onStart: (topics: TopicId[], d?: Difficulty, subs?: string[]) => void }) {
  const { questions, progress } = useApp();
  const [topics, setTopics] = useState<TopicId[]>(initial ? [initial] : []);
  const [diff, setDiff] = useState<Difficulty | undefined>();
  const [subs, setSubs] = useState<string[]>([]);
  const toggle = (t: TopicId) => setTopics((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t]));
  const toggleSub = (id: string) => setSubs((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  // Nur Unterthemen der gewählten Themen zählen
  const activeSubTopics = topics.filter((t) => SUBTOPICS[t]);
  const validSubs = subs.filter((id) => activeSubTopics.some((t) => SUBTOPICS[t]!.items.some((i) => i.id === id)));
  const pool = (questions ?? []).filter((q) => matchesFilter(q, { topics, difficulty: diff, subs: validSubs }));
  const renderSubs = (t: TopicId) => {
    const conf = SUBTOPICS[t];
    if (!conf || !topics.includes(t)) return null;
    return (
      <section key={t + '-subs'} className="subtopics">
        <p className="small muted sub-hint">{conf.label} wählen (keine Auswahl = alle)</p>
        <div className="sub-list">
          {conf.items.map((it) => {
            const qs = questions?.filter((q) => q.topic === t && q.sub === it.id) ?? [];
            const m = qs.filter((q) => (progress.cards[q.id]?.box ?? 0) >= MASTERED_BOX).length;
            const on = validSubs.includes(it.id);
            return (
              <label key={it.id} className={'sub-row card' + (on ? ' on' : '')}>
                <input type="checkbox" checked={on} onChange={() => toggleSub(it.id)} />
                <span className="sub-icon">{it.icon}</span>
                <span className="grow">
                  <span className="sub-name">{it.name}</span> <span className="muted small">{it.hint}</span>
                  <span className="sub-bar" title={`${m} von ${qs.length} sitzen sicher`}><span style={{ width: `${qs.length ? (m / qs.length) * 100 : 0}%` }} /></span>
                  <span className="muted small">{m} von {qs.length} sitzen</span>
                </span>
              </label>
            );
          })}
        </div>
      </section>
    );
  };
  return (
    <div className="practice">
      <h2>Üben</h2>
      <p className="muted">Wähle Themen (keins = alle) und den Schwierigkeitsgrad.</p>
      <div className="topic-list">
        {TOPIC_ORDER.map((t) => {
          const qs = questions?.filter((q) => q.topic === t) ?? [];
          const m = qs.filter((q) => (progress.cards[q.id]?.box ?? 0) >= MASTERED_BOX).length;
          return [
            <label key={t} className={'topic-row card' + (topics.includes(t) ? ' on' : '')}>
              <input type="checkbox" checked={topics.includes(t)} onChange={() => toggle(t)} />
              <span className="topic-icon">{TOPIC_ICONS[t]}</span>
              <span className="grow">{TOPIC_NAMES[t]}<br /><span className="muted small">{m} von {qs.length} sitzen · adaptiv: Stufe {targetDifficulty(progress, t)}{SUBTOPICS[t] ? ` · nach ${SUBTOPICS[t]!.label} filterbar` : ''}</span></span>
            </label>,
            renderSubs(t),
          ];
        })}
      </div>
      <div className="seg" role="radiogroup" aria-label="Schwierigkeit">
        {([undefined, 1, 2, 3] as (Difficulty | undefined)[]).map((d) => (
          <button key={String(d)} role="radio" aria-checked={diff === d} className={diff === d ? 'on' : ''} onClick={() => setDiff(d)}>
            {d === undefined ? 'Adaptiv' : d === 1 ? 'Leicht' : d === 2 ? 'Mittel' : 'Schwer'}
          </button>
        ))}
      </div>
      <button className="btn primary big wide" disabled={pool.length === 0} onClick={() => onStart(topics, diff, validSubs)}>
        Los geht’s <span className="btn-sub">{pool.length} Fragen im Pool</span>
      </button>
    </div>
  );
}
