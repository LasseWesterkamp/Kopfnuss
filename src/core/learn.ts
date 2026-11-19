// Lernseiten: alle Fragen einer Kategorie (oder eines Landes/einer Epoche) mit Lösung zum Nachlesen.
import type { ImageInfo, Question } from './types';

export interface LearnEntry {
  ids: string[];          // alle Fragen, die diesen Fakt abfragen
  title: string;          // Frage
  answer: string;         // richtige Antwort, kurz
  explanation: string;
  source: string;
  image?: ImageInfo;      // Bild bzw. Regionalflagge
  flag?: string;          // Länderflagge (ISO-Code)
  heading?: string;       // Name des Fakts (z.B. Bundesland), wenn mehrere Fragen zusammengefasst sind
  more: { title: string; answer: string }[]; // weitere Teilfakten (Flagge, Lage …)
  reverseOnly?: boolean;
}

const fmtYear = (y: number) => (y < 0 ? `${-y} v. Chr.` : y < 1000 ? `${y} n. Chr.` : String(y));

export function answerOf(q: Question): string {
  switch (q.type) {
    case 'mc': case 'mapname': return q.choices[q.answer];
    case 'flagpick': return q.optionLabels[q.answer];
    case 'year': return fmtYear(q.year);
    case 'order': return [...q.items].sort((a, b) => a.year - b.year).map((i) => `${i.label} (${fmtYear(i.year)})`).join(' → ');
    case 'match': return q.pairs.map((p) => p.label).join(', ');
    case 'map': return q.explanation;
  }
}

/**
 * Fakt, zu dem eine Frage gehört (aus der Frage-ID). Hin- und Rückfragen zum selben Fakt
 * (z.B. geo-cap-fr / geo-capr-fr, reg-cap-de-by / reg-flag-de-by / reg-map-de-by) landen auf derselben Lernkarte.
 */
export function factKey(id: string): string {
  let m = id.match(/^reg-(?:cap|capr|map|mapname|flag|flagpick)-(.+)$/);
  if (m) return 'reg:' + m[1];
  m = id.match(/^geo-capr?-(.+)$/);
  if (m) return 'geocap:' + m[1];
  m = id.match(/^pol-(?:r-)?(.+)$/);
  if (m) return 'pol:' + m[1];
  return id;
}
/** Rückfragen bringen keinen neuen Fakt (nur andere Richtung) und werden nicht extra angezeigt */
const isReverse = (id: string) => /^(geo-capr-|reg-capr-|reg-mapname-|reg-flagpick-|pol-r-)/.test(id);

/** Lernkarten: eine pro Fakt (z.B. pro Land/Bundesland/Amt), mit allen zugehörigen Teilfakten */
export function learnEntries(questions: Question[]): LearnEntry[] {
  const byKey = new Map<string, LearnEntry>();
  for (const q of questions) {
    if (q.type === 'match') continue; // Zuordnungen bestehen aus Einzelflaggen, die schon als eigene Fragen vorkommen
    const key = factKey(q.id);
    const image = q.type === 'flagpick' ? q.options[q.answer] : q.image;
    const e = byKey.get(key);
    if (!e) {
      byKey.set(key, {
        ids: [q.id], title: q.prompt, answer: answerOf(q), explanation: q.explanation, source: q.source,
        image, flag: q.type === 'mc' ? q.flag : undefined, more: [],
        heading: q.type === 'mapname' ? q.choices[q.answer] : q.type === 'flagpick' ? q.optionLabels[q.answer] : undefined,
        reverseOnly: isReverse(q.id),
      });
      continue;
    }
    e.ids.push(q.id);
    e.image ??= image;
    if (!e.heading && q.type === 'mapname') e.heading = q.choices[q.answer];
    if (!e.heading && q.type === 'flagpick') e.heading = q.optionLabels[q.answer];
    if (isReverse(q.id)) continue;
    if (e.reverseOnly) { // Hauptfrage kam erst nach der Rückfrage: Hauptfrage nach vorn (Rückfrage wird nicht angezeigt)
      Object.assign(e, { title: q.prompt, answer: answerOf(q), explanation: q.explanation, reverseOnly: false });
    } else if (q.type === 'map') {
      e.more.push({ title: 'Lage', answer: q.explanation });
    } else {
      e.more.push({ title: q.prompt, answer: answerOf(q) });
    }
  }
  return [...byKey.values()];
}

/** Suche in Frage, Antwort und Erklärung, ohne Groß-/Kleinschreibung und Akzente */
const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
export function searchEntries(list: LearnEntry[], query: string): LearnEntry[] {
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (!words.length) return list;
  return list.filter((e) => { const hay = norm(`${e.heading ?? ''} ${e.title} ${e.answer} ${e.explanation} ${e.more.map((m) => m.answer).join(' ')}`); return words.every((w) => hay.includes(w)); });
}
