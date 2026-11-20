// Startmenü vor einer Runde: Schwierigkeit und Zeitdruck
import type { Difficulty, Question } from './types';
import { matchesFilter, type SessionOptions } from './selection';

export type TimeLimit = 0 | 10 | 20 | 30;
export const TIME_OPTIONS: TimeLimit[] = [0, 10, 20, 30];
/** XP-Aufschlag für Zeitdruck: 10 s +20 %, 20 s +10 %, 30 s und aus: nichts */
export const TIME_BONUS: Record<TimeLimit, number> = { 0: 0, 10: 0.2, 20: 0.1, 30: 0 };

export interface RoundPrefs { difficulty?: Difficulty; time: TimeLimit }

export function withTimeBonus(xp: number, time: number | undefined): number {
  const b = TIME_BONUS[(time ?? 0) as TimeLimit] ?? 0;
  return Math.round(xp * (1 + b));
}

/** Gemerkte Wahl laden. Wer früher den globalen Zeitdruck-Schalter an hatte, startet mit 30 s. */
export function initialPrefs(saved: Partial<RoundPrefs> | null, legacyTimer: boolean): RoundPrefs {
  const time = saved && TIME_OPTIONS.includes(saved.time as TimeLimit) ? (saved.time as TimeLimit) : legacyTimer ? 30 : 0;
  const d = saved?.difficulty;
  return { difficulty: d === 1 || d === 2 || d === 3 ? d : undefined, time };
}

/** Fragen pro Stufe für die gewählte Auswahl (Themen/Kategorien/Unterthemen) */
export function countByDifficulty(all: Question[], opts: Pick<SessionOptions, 'topics' | 'cats' | 'subs'>) {
  const n = { all: 0, 1: 0, 2: 0, 3: 0 } as Record<'all' | Difficulty, number>;
  for (const q of all) if (matchesFilter(q, { ...opts, difficulty: undefined })) { n.all++; n[q.difficulty]++; }
  return n;
}

/** Gewählte Stufe, die es in dieser Auswahl nicht gibt, fällt auf Adaptiv zurück */
export function usableDifficulty(d: Difficulty | undefined, counts: Record<'all' | Difficulty, number>): Difficulty | undefined {
  return d && counts[d] > 0 ? d : undefined;
}
