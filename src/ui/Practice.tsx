import { useState } from 'react';
import type { Difficulty, TopicId } from '../core/types';
import { TOPIC_NAMES } from '../core/badges';
import { MASTERED_BOX } from '../core/srs';
import { targetDifficulty } from '../core/selection';
import { useApp } from '../state';
import { TOPIC_ICONS, TOPIC_ORDER } from './Home';

export function Practice({ initial, onStart }: { initial: TopicId | null; onStart: (topics: TopicId[], d?: Difficulty) => void }) {
  const { questions, progress } = useApp();
  const [topics, setTopics] = useState<TopicId[]>(initial ? [initial] : []);
  const [diff, setDiff] = useState<Difficulty | undefined>();
  const toggle = (t: TopicId) => setTopics((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t]));
  const pool = (questions ?? []).filter((q) => (!topics.length || topics.includes(q.topic)) && (!diff || q.difficulty === diff));
  return (
    <div className="practice">
      <h2>Üben</h2>
      <p className="muted">Wähle Themen (keins = alle) und den Schwierigkeitsgrad.</p>
      <div className="topic-list">
        {TOPIC_ORDER.map((t) => {
          const qs = questions?.filter((q) => q.topic === t) ?? [];
          const m = qs.filter((q) => (progress.cards[q.id]?.box ?? 0) >= MASTERED_BOX).length;
          return (
            <label key={t} className={'topic-row card' + (topics.includes(t) ? ' on' : '')}>
              <input type="checkbox" checked={topics.includes(t)} onChange={() => toggle(t)} />
              <span className="topic-icon">{TOPIC_ICONS[t]}</span>
              <span className="grow">{TOPIC_NAMES[t]}<br /><span className="muted small">{m} von {qs.length} sitzen · adaptiv: Stufe {targetDifficulty(progress, t)}</span></span>
            </label>
          );
        })}
      </div>
      <div className="seg" role="radiogroup" aria-label="Schwierigkeit">
        {([undefined, 1, 2, 3] as (Difficulty | undefined)[]).map((d) => (
          <button key={String(d)} role="radio" aria-checked={diff === d} className={diff === d ? 'on' : ''} onClick={() => setDiff(d)}>
            {d === undefined ? 'Adaptiv' : d === 1 ? 'Leicht' : d === 2 ? 'Mittel' : 'Schwer'}
          </button>
        ))}
      </div>
      <button className="btn primary big wide" disabled={pool.length === 0} onClick={() => onStart(topics, diff)}>
        Los geht’s <span className="btn-sub">{pool.length} Fragen im Pool</span>
      </button>
    </div>
  );
}
