import { useMemo } from 'react';
import type { TopicId } from '../core/types';
import { addDays, diffDays, isoWeek } from '../core/dates';
import { dayCounts, totals } from '../core/progress';
import { DAILY_GOAL } from '../core/streak';
import { MASTERED_BOX } from '../core/srs';
import { isMistake } from '../core/mistakes';
import { TOPIC_NAMES, evaluateBadges } from '../core/badges';
import { useApp } from '../state';
import { TOPIC_ICONS, TOPIC_ORDER } from './Home';

const WEEKS = 18;
const WD = ['Mo', '', 'Mi', '', 'Fr', '', 'So'];
const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

function Heatmap() {
  const { progress, today, streak } = useApp();
  const counts = useMemo(() => dayCounts(progress), [progress]);
  const frozen = new Set(streak.frozenDays);
  // Montag der aktuellen Woche
  const [y, m, d] = today.split('-').map(Number);
  const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  const start = addDays(today, -dow - (WEEKS - 1) * 7);
  const cols = Array.from({ length: WEEKS }, (_, w) => Array.from({ length: 7 }, (_, i) => addDays(start, w * 7 + i)));
  const level = (n: number) => (n === 0 ? 0 : n < DAILY_GOAL ? 1 : n < 2 * DAILY_GOAL ? 2 : n < 4 * DAILY_GOAL ? 3 : 4);
  return (
    <div className="heatmap-wrap">
      <div className="heatmap" style={{ gridTemplateColumns: `auto repeat(${WEEKS}, 1fr)` }}>
        <div className="hm-labels">{WD.map((l, i) => <span key={i}>{l}</span>)}</div>
        {cols.map((col, w) => (
          <div key={w} className="hm-col">
            {col.map((day) => {
              const future = diffDays(today, day) > 0;
              const n = counts[day] ?? 0;
              return <span key={day} title={`${day}: ${n} Fragen${frozen.has(day) ? ' (Freeze)' : ''}`}
                className={'hm-cell l' + level(n) + (future ? ' future' : '') + (frozen.has(day) ? ' frozen' : '') + (day === today ? ' today' : '')} />;
            })}
          </div>
        ))}
      </div>
      <div className="hm-months small muted">
        <span>{MONTHS[Number(start.slice(5, 7)) - 1]} {start.slice(0, 4)}</span><span>{isoWeek(today).replace('-W', ' · KW ')}</span>
      </div>
      <div className="hm-legend small muted">
        weniger <span className="hm-cell l0" /><span className="hm-cell l1" /><span className="hm-cell l2" /><span className="hm-cell l3" /><span className="hm-cell l4" /> mehr
        · <span className="hm-cell frozen" /> Freeze
      </div>
    </div>
  );
}

export function Stats({ onMistakes }: { onMistakes: () => void }) {
  const { progress, questions, streak, level, xp } = useApp();
  const t = useMemo(() => totals(progress), [progress]);
  const mistakeCount = useMemo(() => (questions ?? []).filter((q) => isMistake(progress.cards[q.id])).length, [questions, progress]);
  const rows = TOPIC_ORDER.map((topic) => {
    const s = t.topics[topic] ?? { answered: 0, correct: 0 };
    const qs = questions?.filter((q) => q.topic === topic) ?? [];
    const mastered = qs.filter((q) => (progress.cards[q.id]?.box ?? 0) >= MASTERED_BOX).length;
    return { topic, ...s, acc: s.answered ? s.correct / s.answered : null, mastered, total: qs.length };
  });
  const weak = rows.filter((r) => r.answered >= 5 && r.acc !== null).sort((a, b) => a.acc! - b.acc!).slice(0, 2);
  const badges = questions ? evaluateBadges({ p: progress, questions, best: streak.best, level: level.level }) : [];
  return (
    <div className="stats">
      <h2>Statistik</h2>
      <div className="kpis">
        <div className="card kpi"><strong>{streak.current}</strong><span>Serie</span></div>
        <div className="card kpi"><strong>{streak.best}</strong><span>Beste Serie</span></div>
        <div className="card kpi"><strong>{level.level}</strong><span>Level · {xp} XP</span></div>
        <div className="card kpi"><strong>{t.answered ? Math.round((t.correct / t.answered) * 100) : 0} %</strong><span>{t.answered} beantwortet</span></div>
      </div>

      <h3 className="section-title">Aktivität</h3>
      <div className="card"><Heatmap /></div>

      {weak.length > 0 && (
        <>
          <h3 className="section-title">Hier kannst du am meisten lernen</h3>
          <div className="card">
            {weak.map((r) => <p key={r.topic}>{TOPIC_ICONS[r.topic as TopicId]} <strong>{TOPIC_NAMES[r.topic as TopicId]}</strong>: {Math.round(r.acc! * 100)} % richtig</p>)}
          </div>
        </>
      )}

      <button className="teaser card mistake-card" onClick={onMistakes}>📕 Fehlerkasten: <strong>{mistakeCount}</strong> offene Fehler, nach Thema und Kategorie <span className="muted">›</span></button>

      <h3 className="section-title">Themen</h3>
      <div className="card topic-stats">
        {rows.map((r) => (
          <div key={r.topic} className="ts-row">
            <span className="ts-name">{TOPIC_ICONS[r.topic]} {TOPIC_NAMES[r.topic]}</span>
            <div className="ts-bar" title="Trefferquote"><div style={{ width: `${(r.acc ?? 0) * 100}%` }} /></div>
            <span className="ts-num small">{r.acc === null ? '–' : Math.round(r.acc * 100) + ' %'}</span>
            <span className="ts-sub small muted">{r.answered} beantwortet · {r.mastered}/{r.total} sitzen</span>
          </div>
        ))}
      </div>

      <h3 className="section-title">Abzeichen</h3>
      <div className="badges">
        {badges.map(({ badge, earned }) => (
          <div key={badge.id} className={'badge card' + (earned ? '' : ' locked')} title={badge.desc}>
            <span className="badge-icon">{badge.icon}</span>
            <strong>{badge.title}</strong>
            <span className="small muted">{badge.desc}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
