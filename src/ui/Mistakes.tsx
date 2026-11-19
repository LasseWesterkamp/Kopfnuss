import { useState } from 'react';
import type { Question, TopicId } from '../core/types';
import { TOPIC_NAMES } from '../core/badges';
import { CATEGORIES } from '../core/categories';
import { groupMistakes, FIXED_AFTER } from '../core/mistakes';
import { SUBTOPICS } from '../core/subtopics';
import { formatYear } from '../data';
import { useApp } from '../state';
import { TOPIC_ICONS } from './Home';
import type { StartOpts } from './TopicPage';

/** Richtige Antwort einer Frage als kurzer Text */
function answerText(q: Question): string {
  switch (q.type) {
    case 'mc': case 'mapname': return q.choices[q.answer];
    case 'flagpick': return q.optionLabels[q.answer];
    case 'year': return formatYear(q.year);
    case 'order': return [...q.items].sort((a, b) => a.year - b.year).map((i) => i.label).join(' → ');
    case 'match': return q.pairs.map((p) => p.label).join(', ');
    case 'map': return q.explanation;
  }
}

const catName = (topic: TopicId, cat: string) => CATEGORIES[topic]?.find((c) => c.id === cat)?.name ?? cat;
const subName = (topic: TopicId, sub?: string) => (sub ? SUBTOPICS[topic]?.items.find((i) => i.id === sub)?.name : undefined);

/** Fehlerkasten: offene Fehler nach Thema und Kategorie, mit „Fehler üben“ auf jeder Ebene */
export function Mistakes({ onStart }: { onStart: (o: StartOpts) => void }) {
  const { questions, progress } = useApp();
  const [open, setOpen] = useState<string | null>(null);
  if (!questions) return <p className="muted">Lädt …</p>;
  const groups = groupMistakes(questions, progress);
  const byId = new Map(questions.map((q) => [q.id, q]));
  const all = groups.flatMap((g) => g.cats.flatMap((c) => c.ids));

  return (
    <div className="mistakes">
      <h2>Fehlerkasten</h2>
      <p className="muted small">Hier landen Fragen, die du falsch beantwortet hast. Nach {FIXED_AFTER} richtigen Antworten hintereinander gelten sie als behoben und verschwinden.</p>
      {!all.length ? (
        <div className="card empty"><span className="big-emoji">🎉</span><p>Keine offenen Fehler. Stark!</p></div>
      ) : (
        <>
          <button className="btn primary big wide" onClick={() => onStart({ ids: all, label: 'Alle Fehler' })}>
            Alle Fehler üben <span className="btn-sub">{all.length} offen</span>
          </button>
          {groups.map((g) => (
            <section key={g.topic} className="mistake-group">
              <div className="mg-head">
                <h3>{TOPIC_ICONS[g.topic]} {TOPIC_NAMES[g.topic]} <span className="count">{g.count}</span></h3>
                <button className="btn ghost small-btn" onClick={() => onStart({ ids: g.cats.flatMap((c) => c.ids), label: `Fehler: ${TOPIC_NAMES[g.topic]}` })}>Üben</button>
              </div>
              {g.cats.map((c) => {
                const key = g.topic + '/' + c.cat;
                return (
                  <div key={key} className="mg-cat card">
                    <div className="mg-cat-head">
                      <button className="mg-toggle" aria-expanded={open === key} onClick={() => setOpen(open === key ? null : key)}>
                        <span>{open === key ? '▾' : '▸'} {catName(g.topic, c.cat)}</span> <span className="count">{c.ids.length}</span>
                      </button>
                      <button className="btn primary small-btn" onClick={() => onStart({ ids: c.ids, label: `Fehler: ${catName(g.topic, c.cat)}` })}>Üben</button>
                    </div>
                    {open === key && (
                      <ul className="mg-list">
                        {c.ids.map((id) => {
                          const q = byId.get(id)!;
                          const s = subName(q.topic, q.sub);
                          return (
                            <li key={id}>
                              <span className="mg-q">{q.prompt}{s && <span className="muted small"> · {s}</span>}</span>
                              <span className="mg-a">→ {answerText(q)}</span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                );
              })}
            </section>
          ))}
        </>
      )}
    </div>
  );
}
