import type { Difficulty, TopicId } from '../core/types';
import { TOPIC_NAMES } from '../core/badges';
import { MASTERED_BOX } from '../core/srs';
import { CATEGORIES, catKey } from '../core/categories';
import { SUBTOPICS } from '../core/subtopics';
import { REGION_PUZZLES, WORLD_PUZZLES, type PuzzleDef } from '../core/puzzles';
import { bestOf } from '../core/puzzle';
import { totals } from '../core/progress';
import { mistakeIds } from '../core/mistakes';
import { useApp } from '../state';
import { TOPIC_ICONS } from './Home';
import { loadBest, loadLevel, fmtTime } from './Puzzle';

export interface StartOpts { topics?: TopicId[]; cats?: string[]; subs?: string[]; ids?: string[]; difficulty?: Difficulty; label?: string }

export function PuzzleTiles({ list, onPuzzle }: { list: PuzzleDef[]; onPuzzle: (key: string) => void }) {
  const best = loadBest();
  const level = loadLevel();
  return (
    <div className="games">
      {list.map((p) => {
        const b = bestOf(best, p.key, level);
        return (
          <button key={p.key} className="game card" onClick={() => onPuzzle(p.key)}>
            <span className="game-icon">{p.icon}</span>
            <span className="game-name">{p.name}</span>
            <span className="muted small">{b ? `Bestzeit ${fmtTime(b.ms)}` : p.hint}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Eigene Seite pro Thema: Fortschritt, Kategorien, Länder/Epochen, Puzzles, Fehler */
export function TopicPage({ topic, onStart, onPuzzle, onMistakes }: {
  topic: TopicId;
  onStart: (o: StartOpts) => void;
  onPuzzle: (key: string) => void;
  onMistakes: () => void;
}) {
  const { questions, progress } = useApp();
  if (!TOPIC_NAMES[topic]) return <div className="card">Dieses Thema gibt es nicht.</div>;
  const qs = (questions ?? []).filter((q) => q.topic === topic);
  const mastered = (list: typeof qs) => list.filter((q) => (progress.cards[q.id]?.box ?? 0) >= MASTERED_BOX).length;
  const t = totals(progress).topics[topic];
  const acc = t?.answered ? Math.round((t.correct / t.answered) * 100) : null;
  const m = mastered(qs);
  const errs = questions ? mistakeIds(questions, progress, { topic }) : [];
  const sub = SUBTOPICS[topic];
  const puzzles = topic === 'geografie' ? WORLD_PUZZLES : topic === 'regionen' ? REGION_PUZZLES : [];

  const Row = ({ label, hint, icon, list, opts }: { label: string; hint?: string; icon?: string; list: typeof qs; opts: StartOpts }) => {
    const mm = mastered(list);
    return (
      <div className="cat-row card">
        {icon && <span className="sub-icon">{icon}</span>}
        <div className="grow">
          <div><span className="sub-name">{label}</span> {hint && <span className="muted small">{hint}</span>}</div>
          <span className="sub-bar" title={`${mm} von ${list.length} sitzen sicher`}><span style={{ width: `${list.length ? (mm / list.length) * 100 : 0}%` }} /></span>
          <span className="muted small">{mm} von {list.length} sitzen</span>
        </div>
        <button className="btn primary start-btn" disabled={!list.length} onClick={() => onStart({ topics: [topic], ...opts, label })} aria-label={`${label} üben`}>▶</button>
      </div>
    );
  };

  return (
    <div className="topic-page">
      <div className="topic-hero card">
        <span className="topic-hero-icon">{TOPIC_ICONS[topic]}</span>
        <div className="grow">
          <h2>{TOPIC_NAMES[topic]}</h2>
          <div className="sub-bar big"><span style={{ width: `${qs.length ? (m / qs.length) * 100 : 0}%` }} /></div>
          <p className="muted small">{m} von {qs.length} Fragen sitzen sicher{acc !== null ? ` · ${acc} % richtig` : ''}</p>
        </div>
      </div>
      <button className="btn primary big wide" disabled={!qs.length} onClick={() => onStart({ topics: [topic], label: TOPIC_NAMES[topic] })}>
        Ganzes Thema üben <span className="btn-sub">10 Fragen, passend zu deinem Stand</span>
      </button>

      {errs.length > 0 && (
        <div className="mistake-teaser card">
          <span>❗ <strong>{errs.length}</strong> offene {errs.length === 1 ? 'Fehler' : 'Fehler'} in diesem Thema</span>
          <div className="row">
            <button className="btn ghost" onClick={onMistakes}>Ansehen</button>
            <button className="btn primary" onClick={() => onStart({ ids: errs, label: `Fehler: ${TOPIC_NAMES[topic]}` })}>Fehler üben</button>
          </div>
        </div>
      )}

      {puzzles.length > 0 && (<><h3 className="section-title">Karten-Puzzle</h3><PuzzleTiles list={puzzles} onPuzzle={onPuzzle} /></>)}

      <h3 className="section-title">Kategorien</h3>
      <div className="cat-list">
        {(CATEGORIES[topic] ?? []).map((c) => (
          <Row key={c.id} label={c.name} list={qs.filter((q) => q.cat === c.id)} opts={{ cats: [catKey(topic, c.id)] }} />
        ))}
      </div>

      {sub && (
        <>
          <h3 className="section-title">{sub.label}</h3>
          <div className="cat-list">
            {sub.items.map((it) => (
              <Row key={it.id} label={it.name} hint={it.hint} icon={it.icon} list={qs.filter((q) => q.sub === it.id)} opts={{ subs: [it.id] }} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
