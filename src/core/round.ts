// Startmenü vor einer Runde: Schwierigkeit, Zeitdruck, Flaggen-Blitz
import type { Difficulty, Question } from './types';
import { matchesFilter, type SessionOptions } from './selection';

/** Sekunden pro Frage; 0 = ohne Zeitdruck. Frei wählbar von 5 bis 60. */
export type TimeLimit = number;
export const TIME_OPTIONS: TimeLimit[] = [0, 10, 20, 30];
export const TIME_MIN = 5;
export const TIME_MAX = 60;
/** Flaggen-Blitz: Sekunden, die die Flagge sichtbar ist; 0 = aus */
export const BLITZ_OPTIONS = [0, 0.5, 1, 2, 3];

export interface RoundPrefs { difficulty?: Difficulty; time: TimeLimit; blitz?: number }

export const validTime = (t: unknown): t is number => typeof t === 'number' && (t === 0 || (Number.isInteger(t) && t >= TIME_MIN && t <= TIME_MAX));

/**
 * XP-Aufschlag für Zeitdruck: +1 % pro Sekunde unter 30 s, höchstens +20 % (ab 10 s).
 * Kürzer als 10 s bringt nichts extra, damit schnelles Raten nicht belohnt wird.
 */
export function timeBonus(time: number | undefined): number {
  if (!time || time <= 0) return 0;
  return Math.min(0.2, Math.max(0, (30 - time) / 100));
}

export function withTimeBonus(xp: number, time: number | undefined): number {
  return Math.round(xp * (1 + timeBonus(time)));
}

/** Gemerkte Wahl laden. Wer früher den globalen Zeitdruck-Schalter an hatte, startet mit 30 s. */
export function initialPrefs(saved: Partial<RoundPrefs> | null, legacyTimer: boolean): RoundPrefs {
  const time = saved && validTime(saved.time) ? saved.time : legacyTimer ? 30 : 0;
  const d = saved?.difficulty;
  const blitz = saved && BLITZ_OPTIONS.includes(saved.blitz as number) ? (saved.blitz as number) : 0;
  return { difficulty: d === 1 || d === 2 || d === 3 ? d : undefined, time, blitz };
}

/** Fragen pro Stufe für die gewählte Auswahl (Themen/Kategorien/Unterthemen) */
export function countByDifficulty(all: Question[], opts: Pick<SessionOptions, 'topics' | 'cats' | 'subs' | 'flagOnly'>) {
  const n = { all: 0, 1: 0, 2: 0, 3: 0 } as Record<'all' | Difficulty, number>;
  for (const q of all) if (matchesFilter(q, { ...opts, difficulty: undefined })) { n.all++; n[q.difficulty]++; }
  return n;
}

/** Gewählte Stufe, die es in dieser Auswahl nicht gibt, fällt auf Adaptiv zurück */
export function usableDifficulty(d: Difficulty | undefined, counts: Record<'all' | Difficulty, number>): Difficulty | undefined {
  return d && counts[d] > 0 ? d : undefined;
}

export { isFlagQuestion } from './selection';
