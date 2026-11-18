import { addDays, isoWeek, diffDays } from './dates';

export const DAILY_GOAL = 10;

export interface StreakResult {
  current: number;             // aktuelle Serie (erledigte Tage, eingefrorene zählen nicht mit)
  todayDone: boolean;
  todayCount: number;
  frozenDays: string[];        // Tage der aktuellen Serie, die per Freeze gerettet wurden
  freezeAvailableThisWeek: boolean;
  best: number;
}

const done = (days: Record<string, number>, d: string) => (days[d] ?? 0) >= DAILY_GOAL;

/**
 * Regeln:
 * - Ein Tag zählt als erledigt ab DAILY_GOAL beantworteten Fragen.
 * - Heute noch nicht erledigt bricht die Serie nicht (der Tag läuft noch).
 * - Pro ISO-Woche darf genau ein verpasster Tag automatisch "eingefroren" werden.
 *   Er hält die Serie am Leben, zählt aber nicht als Tag.
 * - Zwei verpasste Tage in derselben Woche beenden die Serie.
 */
export function computeStreak(days: Record<string, number>, today: string): StreakResult {
  const todayCount = days[today] ?? 0;
  const todayDone = todayCount >= DAILY_GOAL;
  const doneDays = Object.keys(days).filter((d) => done(days, d)).sort();
  const first = doneDays[0];

  let current = todayDone ? 1 : 0;
  const frozenDays: string[] = [];
  const usedWeeks = new Set<string>();
  if (first) {
    let pending: string[] = []; // eingefrorene Tage, die erst zählen, wenn davor wieder ein erledigter Tag kommt
    let d = addDays(today, -1);
    while (diffDays(first, d) >= 0) {
      if (done(days, d)) {
        current++;
        frozenDays.push(...pending);
        pending = [];
      } else {
        const w = isoWeek(d);
        if (usedWeeks.has(w)) break;
        usedWeeks.add(w);
        pending.push(d);
      }
      d = addDays(d, -1);
    }
    // Freezes, die keinen erledigten Tag mehr "verbinden", wurden nicht wirklich gebraucht
    for (const p of pending) usedWeeks.delete(isoWeek(p));
  }
  if (current === 0) { frozenDays.length = 0; usedWeeks.clear(); }

  const freezeAvailableThisWeek = !usedWeeks.has(isoWeek(today));
  return { current, todayDone, todayCount, frozenDays, freezeAvailableThisWeek, best: Math.max(current, bestStreak(days)) };
}

/** Längste Serie aller Zeiten (gleiche Freeze-Regel) */
export function bestStreak(days: Record<string, number>): number {
  const doneDays = Object.keys(days).filter((d) => done(days, d)).sort();
  if (!doneDays.length) return 0;
  let best = 0, cur = 0, prev: string | null = null;
  const used = new Set<string>();
  for (const d of doneDays) {
    if (prev === null) { cur = 1; used.clear(); }
    else {
      const gap = diffDays(prev, d) - 1; // Anzahl verpasster Tage dazwischen
      let ok = true;
      const weeksInGap = new Set<string>();
      for (let i = 1; i <= gap; i++) {
        const w = isoWeek(addDays(prev, i));
        if (used.has(w) || weeksInGap.has(w)) { ok = false; break; }
        weeksInGap.add(w);
      }
      if (ok) { weeksInGap.forEach((w) => used.add(w)); cur++; }
      else { cur = 1; used.clear(); }
    }
    best = Math.max(best, cur);
    prev = d;
  }
  return best;
}
