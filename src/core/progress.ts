import type { AnswerLogEntry, CardState, DayEntry, Progress, Question, TopicId } from './types';
import { review } from './srs';
import { dayKey } from './dates';

export const RECENT_MAX = 300;

export const emptyProgress = (): Progress => ({ version: 1, cards: {}, log: {}, recent: [], updatedAt: 0 });

const emptyDay = (): DayEntry => ({ n: 0, c: 0, xp: 0, topics: {} });

export interface AnswerInput { q: Pick<Question, 'id' | 'topic' | 'difficulty'>; ok: boolean; xp: number }

/** Verbucht eine Antwort. Gibt ein neues Objekt zurück (unveränderlich). */
export function recordAnswer(p: Progress, a: AnswerInput, device: string, now = Date.now()): Progress {
  const today = dayKey(now);
  const dayLog = { ...(p.log[today] ?? {}) };
  const e = { ...(dayLog[device] ?? emptyDay()) };
  e.n += 1;
  if (a.ok) e.c += 1;
  e.xp += a.xp;
  const t = e.topics[a.q.topic] ?? [0, 0];
  e.topics = { ...e.topics, [a.q.topic]: [t[0] + 1, t[1] + (a.ok ? 1 : 0)] };
  dayLog[device] = e;
  const recent = [...p.recent, { t: now, id: a.q.id, topic: a.q.topic, ok: a.ok, d: a.q.difficulty } as AnswerLogEntry].slice(-RECENT_MAX);
  return {
    ...p,
    cards: { ...p.cards, [a.q.id]: review(p.cards[a.q.id], a.ok, today, now) },
    log: { ...p.log, [today]: dayLog },
    recent,
    updatedAt: now,
  };
}

/** Bonus-XP (z.B. Tages-Challenge abgeschlossen) */
export function addBonusXp(p: Progress, xp: number, device: string, now = Date.now()): Progress {
  const today = dayKey(now);
  const dayLog = { ...(p.log[today] ?? {}) };
  const e = { ...(dayLog[device] ?? emptyDay()) };
  e.xp += xp;
  dayLog[device] = e;
  return { ...p, log: { ...p.log, [today]: dayLog }, updatedAt: now };
}

/** Beantwortete Fragen pro Tag (alle Geräte summiert) */
export function dayCounts(p: Progress): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [day, devs] of Object.entries(p.log)) out[day] = Object.values(devs).reduce((s, e) => s + e.n, 0);
  return out;
}

export function totalXp(p: Progress): number {
  let xp = 0;
  for (const devs of Object.values(p.log)) for (const e of Object.values(devs)) xp += e.xp;
  return xp;
}

export function totals(p: Progress) {
  let n = 0, c = 0;
  const topics: Partial<Record<TopicId, { answered: number; correct: number }>> = {};
  for (const devs of Object.values(p.log))
    for (const e of Object.values(devs)) {
      n += e.n; c += e.c;
      for (const [k, [a, r]] of Object.entries(e.topics) as [TopicId, [number, number]][]) {
        const t = topics[k] ?? { answered: 0, correct: 0 };
        t.answered += a; t.correct += r;
        topics[k] = t;
      }
    }
  return { answered: n, correct: c, topics };
}

/**
 * Führt zwei Stände zusammen (z.B. Handy und PC). Regeln:
 * - Karten: der zuletzt beantwortete Stand gewinnt.
 * - Tageslog: pro Tag und Gerät der Eintrag mit mehr Antworten (Zähler wachsen nur).
 * - Letzte Antworten: Vereinigung, nach Zeit sortiert.
 * Kommutativ und idempotent, damit beliebig oft gesynct werden kann.
 */
export function mergeProgress(a: Progress, b: Progress): Progress {
  const cards: Record<string, CardState> = { ...a.cards };
  for (const [id, cb] of Object.entries(b.cards)) {
    const ca = cards[id];
    if (!ca || cb.last > ca.last || (cb.last === ca.last && cb.seen > ca.seen)) cards[id] = cb;
  }
  const log: Progress['log'] = {};
  for (const day of new Set([...Object.keys(a.log), ...Object.keys(b.log)])) {
    const da = a.log[day] ?? {}, db = b.log[day] ?? {};
    const merged: Record<string, DayEntry> = {};
    for (const dev of new Set([...Object.keys(da), ...Object.keys(db)])) {
      const ea = da[dev], eb = db[dev];
      merged[dev] = !ea ? eb : !eb ? ea : (eb.n > ea.n || (eb.n === ea.n && eb.xp > ea.xp) ? eb : ea);
    }
    log[day] = merged;
  }
  const seen = new Set<string>();
  const recent = [...a.recent, ...b.recent]
    .sort((x, y) => x.t - y.t)
    .filter((r) => { const k = r.t + r.id; if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(-RECENT_MAX);
  return { version: 1, cards, log, recent, updatedAt: Math.max(a.updatedAt, b.updatedAt) };
}
