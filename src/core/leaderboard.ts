import type { Progress } from './types';
import { addDays, isoWeek } from './dates';
import { computeStreak } from './streak';
import { dayCounts, totalXp } from './progress';

export interface MyStats { week: string; week_xp: number; week_answers: number; total_xp: number; streak: number }

/** Wochenwerte (ISO-Woche Mo–So, Europe/Berlin) aus dem lokalen Tageslog */
export function weekTotals(p: Progress, today: string): { xp: number; answers: number } {
  const week = isoWeek(today);
  let xp = 0, answers = 0;
  for (const [day, devs] of Object.entries(p.log)) {
    if (isoWeek(day) !== week || day > today) continue;
    for (const e of Object.values(devs)) { xp += e.xp; answers += e.n; }
  }
  return { xp, answers };
}

/** Werte, die für die Rangliste auf den Server geladen werden */
export function myStats(p: Progress, today: string): MyStats {
  const w = weekTotals(p, today);
  return { week: isoWeek(today), week_xp: w.xp, week_answers: w.answers, total_xp: totalXp(p), streak: computeStreak(dayCounts(p), today).current };
}

export interface Entry { user_id: string; display_name: string; week_xp: number; week_answers: number; total_xp: number; streak: number; is_me: boolean; is_owner: boolean }
export type Board = 'woche' | 'serie' | 'gesamt';

const key: Record<Board, (e: Entry) => number> = { woche: (e) => e.week_xp, serie: (e) => e.streak, gesamt: (e) => e.total_xp };

/**
 * Sortiert und vergibt Plätze. Gleichstand = gleicher Platz ("1, 1, 3").
 * Bei Gleichstand nach dem Wert stehen sich Personen alphabetisch nach Name.
 */
export function rank(entries: Entry[], board: Board): (Entry & { place: number; value: number })[] {
  const sorted = [...entries].sort((a, b) => key[board](b) - key[board](a) || a.display_name.localeCompare(b.display_name, 'de'));
  let place = 0, prev: number | null = null;
  return sorted.map((e, i) => {
    const v = key[board](e);
    if (v !== prev) { place = i + 1; prev = v; }
    return { ...e, place, value: v };
  });
}

/** Tage bis zum Wochenreset (Montag 0:00 Berlin) */
export function daysUntilReset(today: string): number {
  let d = 0;
  while (isoWeek(addDays(today, d + 1)) === isoWeek(today)) d++;
  return d + 1;
}
