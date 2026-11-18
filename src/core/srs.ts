import type { CardState } from './types';
import { addDays } from './dates';

/** Wiederholungsabstände in Tagen pro Box (Leitner-System). Box 5 = sitzt. */
export const INTERVALS = [1, 1, 3, 7, 21, 60];
export const MASTERED_BOX = 4;

export function review(prev: CardState | undefined, ok: boolean, today: string, now = Date.now()): CardState {
  const box = ok ? Math.min((prev?.box ?? 0) + 1, 5) : 0;
  // Falsch: morgen wieder. Richtig: je nach Box später.
  const due = addDays(today, INTERVALS[box]);
  return {
    box,
    due,
    seen: (prev?.seen ?? 0) + 1,
    correct: (prev?.correct ?? 0) + (ok ? 1 : 0),
    last: now,
  };
}

export const isDue = (c: CardState | undefined, today: string) => !!c && c.due <= today;
