import type { TopicId } from '../core/types';
import { DAILY_GOAL } from '../core/streak';
import { isDue } from '../core/srs';
import { TOPIC_NAMES } from '../core/badges';
import { useApp } from '../state';

export const TOPIC_ICONS: Record<TopicId, string> = {
  geografie: '🌍', flaggen: '🚩', politik: '🏛️', geschichte: '📜', bilder: '🖼️', fauna: '🦊', flora: '🌿', wissenschaft: '🔬',
};
export const TOPIC_ORDER: TopicId[] = ['geografie', 'flaggen', 'geschichte', 'bilder', 'politik', 'fauna', 'flora', 'wissenschaft'];

export function Home({ onDaily, onTopic, onMix }: { onDaily: () => void; onTopic: (t: TopicId) => void; onMix: () => void }) {
  const { streak, level, questions, progress, today } = useApp();
  const due = questions?.filter((q) => isDue(progress.cards[q.id], today)).length ?? 0;
  const pct = Math.min(1, streak.todayCount / DAILY_GOAL);
  const R = 52, C = 2 * Math.PI * R;
  return (
    <div className="home">
      <section className="hero card">
        <div className="ring" aria-label={`${streak.todayCount} von ${DAILY_GOAL} Fragen heute`}>
          <svg viewBox="0 0 120 120">
            <circle cx="60" cy="60" r={R} className="ring-bg" />
            <circle cx="60" cy="60" r={R} className="ring-fg" strokeDasharray={C} strokeDashoffset={C * (1 - pct)} transform="rotate(-90 60 60)" />
          </svg>
          <div className="ring-text">
            {streak.todayDone ? <span className="ring-done">✓</span> : <><strong>{streak.todayCount}</strong><span>/{DAILY_GOAL}</span></>}
          </div>
        </div>
        <div className="hero-side">
          <div className="streak"><span className="flame">{streak.current > 0 ? '🔥' : '🌑'}</span> <strong>{streak.current}</strong> {streak.current === 1 ? 'Tag' : 'Tage'} Serie</div>
          <div className="muted small">
            {streak.todayDone ? 'Tagesziel geschafft. Morgen weitermachen!' : streak.current > 0 ? 'Heute noch dranbleiben, sonst wackelt die Serie.' : 'Starte heute deine Serie.'}
          </div>
          <div className="muted small">
            {streak.freezeAvailableThisWeek ? '🧊 Freeze diese Woche verfügbar' : '🧊 Freeze diese Woche schon verbraucht'}
          </div>
          <div className="levelbar" title={`${level.into} / ${level.need} XP`}>
            <span>Level {level.level}</span>
            <div><div style={{ width: `${(level.into / level.need) * 100}%` }} /></div>
          </div>
        </div>
      </section>

      <button className="btn primary big wide" onClick={onDaily} disabled={!questions}>
        {streak.todayDone ? 'Noch eine Tagesrunde' : 'Tages-Challenge starten'}
        <span className="btn-sub">10 Fragen{due ? ` · ${Math.min(due, 6)} Wiederholungen fällig` : ''}</span>
      </button>

      <h3 className="section-title">Üben nach Thema</h3>
      <div className="topics">
        {TOPIC_ORDER.map((t) => {
          const n = questions?.filter((q) => q.topic === t).length ?? 0;
          return (
            <button key={t} className="topic card" onClick={() => onTopic(t)} disabled={!n}>
              <span className="topic-icon">{TOPIC_ICONS[t]}</span>
              <span className="topic-name">{TOPIC_NAMES[t]}</span>
              <span className="muted small">{n} Fragen</span>
            </button>
          );
        })}
      </div>
      <button className="btn ghost wide" onClick={onMix} disabled={!questions}>🎲 Zufallsmix aus allen Themen</button>
    </div>
  );
}
