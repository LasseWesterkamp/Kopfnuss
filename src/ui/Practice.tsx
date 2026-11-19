import { useEffect, useState } from 'react';
import type { Difficulty, TopicId } from '../core/types';
import { TOPIC_NAMES } from '../core/badges';
import { MASTERED_BOX } from '../core/srs';
import { targetDifficulty, matchesFilter } from '../core/selection';
import { SUBTOPICS } from '../core/subtopics';
import { CATEGORIES, catKey } from '../core/categories';
import { useApp } from '../state';
import { loadLast, saveLast, loadMixes, saveMix, deleteMix, MAX_MIXES, type Mix, type Selection } from '../selectionStore';
import { PuzzleTiles } from './TopicPage';
import { WORLD_PUZZLES, REGION_PUZZLES } from '../core/puzzles';
import { TOPIC_ICONS, TOPIC_ORDER } from './Home';

export function Practice({ initial, onStart, onPuzzle }: {
  initial: TopicId | null;
  onStart: (sel: Selection) => void;
  onPuzzle: (cc: string) => void;
}) {
  const { questions, progress } = useApp();
  const [sel, setSel] = useState<Selection>(() => (initial ? { topics: [initial], cats: [], subs: [] } : loadLast()));
  const [mixes, setMixes] = useState<Mix[]>(loadMixes);
  const [mixName, setMixName] = useState('');
  const [naming, setNaming] = useState(false);
  useEffect(() => saveLast(sel), [sel]);

  const { topics, cats, subs, diff } = sel;
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const toggleTopic = (t: TopicId) => setSel((s) => {
    const on = s.topics.includes(t);
    // Beim Abwählen eines Themas auch dessen Kategorien entfernen
    return { ...s, topics: toggle(s.topics, t) as TopicId[], cats: on ? s.cats.filter((c) => !c.startsWith(t + '/')) : s.cats };
  });
  const toggleCat = (k: string) => setSel((s) => ({ ...s, cats: toggle(s.cats, k) }));
  const toggleSub = (id: string) => setSel((s) => ({ ...s, subs: toggle(s.subs, id) }));
  // Unterthemen nur gültig, wenn ihr Thema gewählt ist
  const validSubs = subs.filter((id) => topics.some((t) => SUBTOPICS[t]?.items.some((i) => i.id === id)));
  const validCats = cats.filter((c) => topics.includes(c.split('/')[0] as TopicId));
  const filter = { topics, difficulty: diff, subs: validSubs, cats: validCats };
  const pool = (questions ?? []).filter((q) => matchesFilter(q, filter));
  const mastered = (qs: typeof pool) => qs.filter((q) => (progress.cards[q.id]?.box ?? 0) >= MASTERED_BOX).length;

  const renderDetail = (t: TopicId) => {
    if (!topics.includes(t)) return null;
    const cs = CATEGORIES[t] ?? [];
    const sub = SUBTOPICS[t];
    const tq = (questions ?? []).filter((q) => q.topic === t);
    return (
      <div key={t + '-detail'} className="topic-detail">
        <p className="small muted sub-hint">Kategorien (keine Auswahl = alle)</p>
        <div className="chips">
          {cs.map((c) => {
            const k = catKey(t, c.id);
            const n = tq.filter((q) => q.cat === c.id && (!validSubs.length || q.sub === undefined || validSubs.includes(q.sub))).length;
            return (
              <button key={k} className={'chip-btn' + (validCats.includes(k) ? ' on' : '')} aria-pressed={validCats.includes(k)} onClick={() => toggleCat(k)} disabled={!n}>
                {c.name} <span className="chip-n">{n}</span>
              </button>
            );
          })}
        </div>
        {sub && (
          <>
            <p className="small muted sub-hint">{sub.label} (keine Auswahl = alle)</p>
            <div className="sub-list">
              {sub.items.map((it) => {
                const qs = tq.filter((q) => q.sub === it.id);
                const on = validSubs.includes(it.id);
                return (
                  <label key={it.id} className={'sub-row card' + (on ? ' on' : '')}>
                    <input type="checkbox" checked={on} onChange={() => toggleSub(it.id)} />
                    <span className="sub-icon">{it.icon}</span>
                    <span className="grow">
                      <span className="sub-name">{it.name}</span> <span className="muted small">{it.hint}</span>
                      <span className="sub-bar" title={`${mastered(qs)} von ${qs.length} sitzen sicher`}><span style={{ width: `${qs.length ? (mastered(qs) / qs.length) * 100 : 0}%` }} /></span>
                      <span className="muted small">{mastered(qs)} von {qs.length} sitzen</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </>
        )}
      </div>
    );
  };

  const describe = (m: Selection) => {
    const parts = m.topics.map((t) => TOPIC_NAMES[t]);
    return (parts.length ? parts.join(', ') : 'Alle Themen') + (m.cats.length + m.subs.length ? ` · ${m.cats.length + m.subs.length} Filter` : '');
  };

  return (
    <div className="practice">
      <h2>Üben</h2>

      <h3 className="section-title">Spiele: Karten-Puzzle</h3>
      <p className="small muted sub-hint">Länder der Welt</p>
      <PuzzleTiles list={WORLD_PUZZLES} onPuzzle={onPuzzle} />
      <p className="small muted sub-hint">Bundesländer, Kantone & Bundesstaaten</p>
      <PuzzleTiles list={REGION_PUZZLES} onPuzzle={onPuzzle} />

      {mixes.length > 0 && (
        <>
          <h3 className="section-title">Meine Mischungen</h3>
          <div className="mixes">
            {mixes.map((m) => (
              <div key={m.name} className="mix card">
                <button className="mix-load" onClick={() => setSel({ topics: m.topics, cats: m.cats, subs: m.subs, diff: m.diff })}>
                  <strong>{m.name}</strong><span className="muted small">{describe(m)}</span>
                </button>
                <button className="icon-btn mix-del" aria-label={`Mischung ${m.name} löschen`} onClick={() => setMixes(deleteMix(m.name))}>✕</button>
              </div>
            ))}
          </div>
        </>
      )}

      <h3 className="section-title">Themen <span className="muted">(keine Auswahl = alle)</span></h3>
      <div className="topic-list">
        {TOPIC_ORDER.map((t) => {
          const qs = questions?.filter((q) => q.topic === t) ?? [];
          return [
            <label key={t} className={'topic-row card' + (topics.includes(t) ? ' on' : '')}>
              <input type="checkbox" checked={topics.includes(t)} onChange={() => toggleTopic(t)} />
              <span className="topic-icon">{TOPIC_ICONS[t]}</span>
              <span className="grow">{TOPIC_NAMES[t]}<br /><span className="muted small">{mastered(qs)} von {qs.length} sitzen · Stufe {targetDifficulty(progress, t)}</span></span>
            </label>,
            renderDetail(t),
          ];
        })}
      </div>

      <div className="seg" role="radiogroup" aria-label="Schwierigkeit">
        {([undefined, 1, 2, 3] as (Difficulty | undefined)[]).map((d) => (
          <button key={String(d)} role="radio" aria-checked={diff === d} className={diff === d ? 'on' : ''} onClick={() => setSel((s) => ({ ...s, diff: d }))}>
            {d === undefined ? 'Adaptiv' : d === 1 ? 'Leicht' : d === 2 ? 'Mittel' : 'Schwer'}
          </button>
        ))}
      </div>
      <button className="btn primary big wide" disabled={pool.length === 0} onClick={() => onStart({ topics, cats: validCats, subs: validSubs, diff })}>
        Los geht’s <span className="btn-sub">{pool.length} Fragen im Pool</span>
      </button>

      <div className="save-mix">
        {!naming ? (
          <button className="btn ghost wide" onClick={() => setNaming(true)} disabled={!topics.length}>☆ Auswahl als Mischung speichern</button>
        ) : (
          <form className="inline" onSubmit={(e) => { e.preventDefault(); if (mixName.trim()) { setMixes(saveMix({ name: mixName.trim(), topics, cats: validCats, subs: validSubs, diff })); setMixName(''); setNaming(false); } }}>
            <input className="text" autoFocus maxLength={30} placeholder="Name, z.B. Ost-Flaggen" value={mixName} onChange={(e) => setMixName(e.target.value)} />
            <button className="btn primary" disabled={!mixName.trim()}>Speichern</button>
          </form>
        )}
        {naming && mixes.length >= MAX_MIXES && <p className="small muted">Maximal {MAX_MIXES} Mischungen. Die älteste wird ersetzt.</p>}
      </div>
    </div>
  );
}
