import type { Difficulty, Progress, Question, TopicId } from './types';
import { isDue } from './srs';

export const SESSION_SIZE = 10;
export const MAX_REVIEWS_IN_DAILY = 6;

export type Rng = () => number;

/** Passt eine Frage zu Themen-, Unterthemen- und Schwierigkeitsfilter? */
/** Zeigt die Frage genau eine Flagge (Länder- oder Regionsflagge)? Nur dann gilt der Flaggen-Blitz. */
export function isFlagQuestion(q: Question): boolean {
  if (q.type !== 'mc') return false;
  return !!q.flag || (q.topic === 'regionen' && q.cat === 'flaggen' && !!q.image);
}

export function matchesFilter(q: Question, opts: Pick<SessionOptions, 'topics' | 'subs' | 'difficulty' | 'cats' | 'flagOnly'>): boolean {
  if (opts.flagOnly && !isFlagQuestion(q)) return false;
  if (opts.topics?.length && !opts.topics.includes(q.topic)) return false;
  if (opts.difficulty && q.difficulty !== opts.difficulty) return false;
  // Unterthemen-Filter greift nur bei Themen, die Unterthemen haben (Geschichte, Regionen).
  // So kann man z.B. "Geschichte: nur NS-Zeit" mit "Flaggen" kombinieren.
  if (opts.subs?.length && q.sub !== undefined && !opts.subs.includes(q.sub)) return false;
  // Kategorien wirken pro Thema: "geografie/hauptstaedte" schränkt nur Geografie ein
  if (opts.cats?.length) {
    const own = opts.cats.filter((c) => c.startsWith(q.topic + '/'));
    if (own.length && !own.includes(q.topic + '/' + q.cat)) return false;
  }
  return true;
}

export function shuffle<T>(arr: T[], rng: Rng = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Zielschwierigkeit pro Thema aus den letzten 20 Antworten */
export function targetDifficulty(p: Progress, topic: TopicId): Difficulty {
  const last = p.recent.filter((r) => r.topic === topic).slice(-20);
  if (last.length < 5) return 1;
  const acc = last.filter((r) => r.ok).length / last.length;
  const avgD = last.reduce((s, r) => s + r.d, 0) / last.length;
  if (acc >= 0.8) return Math.min(3, Math.round(avgD) + 1) as Difficulty;
  if (acc < 0.55) return Math.max(1, Math.round(avgD) - 1) as Difficulty;
  return Math.max(1, Math.min(3, Math.round(avgD))) as Difficulty;
}

/** Sortiert neue Fragen eines Themas so, dass die Zielschwierigkeit zuerst kommt */
function newByDifficulty(qs: Question[], target: Difficulty, rng: Rng): Question[] {
  return shuffle(qs, rng).sort((x, y) => Math.abs(x.difficulty - target) - Math.abs(y.difficulty - target));
}

function dueQuestions(qs: Question[], p: Progress, today: string): Question[] {
  return qs.filter((q) => isDue(p.cards[q.id], today)).sort((a, b) => {
    const ca = p.cards[a.id], cb = p.cards[b.id];
    return ca.due.localeCompare(cb.due) || ca.box - cb.box;
  });
}

/** Mischt Fragen aus mehreren Themen reihum (damit nicht 10x Flaggen hintereinander kommt) */
function roundRobin(groups: Question[][], n: number): Question[] {
  const out: Question[] = [];
  const idx = groups.map(() => 0);
  while (out.length < n) {
    let added = false;
    for (let g = 0; g < groups.length && out.length < n; g++) {
      if (idx[g] < groups[g].length) { out.push(groups[g][idx[g]++]); added = true; }
    }
    if (!added) break;
  }
  return out;
}

export interface SessionOptions {
  topics?: TopicId[];          // leer/undefined = alle
  subs?: string[];             // Unterthemen (Epoche/Land); leer = alle. Gilt nur für Fragen, die ein Unterthema haben.
  ids?: string[];              // nur diese Fragen (z.B. Fehlerkasten)
  cats?: string[];             // Kategorien als "thema/kategorie". Gilt nur für Themen, bei denen mind. eine Kategorie gewählt ist.
  difficulty?: Difficulty;     // fest statt adaptiv
  timeLimit?: number;          // Sekunden pro Frage, 0/undefined = ohne Zeitdruck (für die Auswahl ohne Bedeutung)
  blitz?: number;              // Flaggen-Blitz: Sekunden sichtbar, 0/undefined = aus (für die Auswahl ohne Bedeutung)
  flagOnly?: boolean;          // nur Fragen mit genau einer Flagge (Blitz-Kachel)
  size?: number;
  maxReviews?: number;
}

/**
 * Stellt eine Runde zusammen: erst fällige Wiederholungen, dann neue Fragen
 * (adaptive Schwierigkeit, Themen gemischt), zuletzt schon gesehene mit niedrigster Box.
 */
export function buildSession(all: Question[], p: Progress, today: string, opts: SessionOptions = {}, rng: Rng = Math.random): Question[] {
  const size = opts.size ?? SESSION_SIZE;
  const only = opts.ids ? new Set(opts.ids) : null;
  const pool = all.filter((q) => (!only || only.has(q.id)) && matchesFilter(q, opts));
  const picked: Question[] = dueQuestions(pool, p, today).slice(0, opts.maxReviews ?? MAX_REVIEWS_IN_DAILY);
  const used = new Set(picked.map((q) => q.id));

  const topics = [...new Set(pool.map((q) => q.topic))];
  const groups = shuffle(topics, rng).map((t) => {
    const fresh = pool.filter((q) => q.topic === t && !p.cards[q.id]);
    return opts.difficulty ? shuffle(fresh, rng) : newByDifficulty(fresh, targetDifficulty(p, t), rng);
  });
  for (const q of roundRobin(groups, size - picked.length)) if (!used.has(q.id)) { picked.push(q); used.add(q.id); }

  if (picked.length < size) {
    const rest = shuffle(pool.filter((q) => !used.has(q.id)), rng).sort((a, b) => (p.cards[a.id]?.box ?? 0) - (p.cards[b.id]?.box ?? 0));
    picked.push(...rest.slice(0, size - picked.length));
  }
  return shuffle(picked, rng);
}

/**
 * Optionen für „Nochmal spielen“ mit gewählter Schwierigkeit.
 * difficulty undefined = adaptiv. Auswahl (Themen, Kategorien, Fehlerliste …) bleibt erhalten.
 */
export function againOptions(prev: SessionOptions, difficulty: Difficulty | undefined): SessionOptions {
  const { difficulty: _old, ...rest } = prev;
  return difficulty ? { ...rest, difficulty } : rest;
}
