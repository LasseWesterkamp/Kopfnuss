import { useMemo, useState } from 'react';
import type { TopicId } from '../core/types';
import { TOPIC_NAMES } from '../core/badges';
import { CATEGORIES, catKey } from '../core/categories';
import { SUBTOPICS } from '../core/subtopics';
import { learnEntries, searchEntries } from '../core/learn';
import { isMistake } from '../core/mistakes';
import { asset } from '../data';
import { useApp } from '../state';
import { TOPIC_ICONS } from './Home';
import type { StartOpts } from './TopicPage';

const PAGE = 60; // Einträge pro Nachladen (große Kategorien wie Hauptstädte haben über 200)

/** Lernseite: alle Lösungen einer Kategorie (kind=cat) oder eines Landes/einer Epoche (kind=sub) */
export function LearnPage({ topic, kind, id, onStart }: { topic: TopicId; kind: 'cat' | 'sub'; id: string; onStart: (o: StartOpts) => void }) {
  const { questions, progress } = useApp();
  const [query, setQuery] = useState('');
  const [onlyMistakes, setOnlyMistakes] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const label = kind === 'cat' ? CATEGORIES[topic]?.find((c) => c.id === id)?.name : SUBTOPICS[topic]?.items.find((i) => i.id === id)?.name;
  const qs = useMemo(() => (questions ?? []).filter((q) => q.topic === topic && (kind === 'cat' ? q.cat === id : q.sub === id)), [questions, topic, kind, id]);
  const entries = useMemo(() => learnEntries(qs), [qs]);
  const isErr = (ids: string[]) => ids.some((i) => isMistake(progress.cards[i]));
  const list = searchEntries(onlyMistakes ? entries.filter((e) => isErr(e.ids)) : entries, query);
  const errCount = entries.filter((e) => isErr(e.ids)).length;

  if (!questions) return <p className="muted">Lädt …</p>;
  if (!label) return <div className="card">Diese Kategorie gibt es nicht.</div>;
  return (
    <div className="learn">
      <p className="muted small">{TOPIC_ICONS[topic]} {TOPIC_NAMES[topic]}</p>
      <h2>📖 {label}</h2>
      <p className="muted small">{entries.length} Fakten zum Nachlesen. Danach abfragen, damit es hängen bleibt.</p>
      <button className="btn primary wide" onClick={() => onStart({ topics: [topic], ...(kind === 'cat' ? { cats: [catKey(topic, id)] } : { subs: [id] }), label })}>
        Jetzt abfragen <span className="btn-sub">10 Fragen aus „{label}“</span>
      </button>
      <div className="learn-tools">
        <input className="text" type="search" placeholder="Suchen, z.B. „Bayern“ oder „Fluss“" value={query}
          onChange={(e) => { setQuery(e.target.value); setShown(PAGE); }} aria-label="Lösungen durchsuchen" />
        {errCount > 0 && (
          <label className="switch-row small">
            <span>Nur meine Fehler ({errCount})</span>
            <input type="checkbox" checked={onlyMistakes} onChange={(e) => { setOnlyMistakes(e.target.checked); setShown(PAGE); }} />
          </label>
        )}
      </div>
      {!list.length && <p className="muted">Nichts gefunden.</p>}
      <ul className="learn-list">
        {list.slice(0, shown).map((e) => (
          <li key={e.ids[0]} className={'card learn-item' + (isErr(e.ids) ? ' err' : '')}>
            {(e.image || e.flag) && (
              <img className={'learn-img' + (e.flag || topic === 'regionen' ? ' flagish' : '')} loading="lazy" alt=""
                src={asset(e.flag ? `flags/${e.flag}.svg` : e.image!.src)} />
            )}
            <div className="grow">
              {e.heading && <p className="learn-h">{e.heading}</p>}
              <p className="learn-q">{e.title}</p>
              <p className="learn-a">{e.answer}</p>
              {e.explanation !== e.answer && !e.more.some((m) => m.answer === e.explanation) && <p className="small muted">{e.explanation}</p>}
              {e.more.filter((m) => m.answer !== e.heading).map((m, i) => <p key={i} className="small learn-more"><span className="muted">{m.title}:</span> {m.answer}</p>)}
              <p className="small">
                {isErr(e.ids) && <span className="count">Fehler</span>}{' '}
                <a href={e.source} target="_blank" rel="noreferrer">Quelle ↗</a>
                {e.image && <span className="muted"> · Bild: {e.image.author.slice(0, 40)}, {e.image.license}</span>}
              </p>
            </div>
          </li>
        ))}
      </ul>
      {list.length > shown && <button className="btn ghost wide" onClick={() => setShown(shown + PAGE)}>Weitere {Math.min(PAGE, list.length - shown)} anzeigen ({list.length - shown} übrig)</button>}
    </div>
  );
}
