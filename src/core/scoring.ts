import type { Difficulty } from './types';

export const XP_PER_DIFFICULTY = 10;
export const DAILY_BONUS = 25;

/** score: 0..1 (Teilpunkte bei Jahreszahl und Reihenfolge) */
export function xpFor(score: number, difficulty: Difficulty): number {
  return Math.round(XP_PER_DIFFICULTY * difficulty * Math.max(0, Math.min(1, score)));
}

/** Jahreszahl schätzen: voll bis 2 % der Spanne daneben (mind. 1 Jahr), linear abnehmend bis 20 % der Spanne */
export function yearScore(guess: number, year: number, min: number, max: number): number {
  const span = max - min;
  const full = Math.max(1, span * 0.02);
  const zero = Math.max(full + 1, span * 0.2);
  const dist = Math.abs(guess - year);
  if (dist <= full) return 1;
  if (dist >= zero) return 0;
  return 1 - (dist - full) / (zero - full);
}
export const yearCorrect = (score: number) => score >= 0.75;

/** Reihenfolge: Anteil der richtig geordneten Paare */
export function orderScore(given: number[], correct: number[]): number {
  const pos = new Map(given.map((v, i) => [v, i]));
  let ok = 0, total = 0;
  for (let i = 0; i < correct.length; i++)
    for (let j = i + 1; j < correct.length; j++) {
      total++;
      if (pos.get(correct[i])! < pos.get(correct[j])!) ok++;
    }
  return total ? ok / total : 1;
}

/** Level aus Gesamt-XP. Level n braucht 100 * n XP mehr als Level n-1. */
export function levelFromXp(xp: number) {
  let level = 1, need = 100, rest = xp;
  while (rest >= need) { rest -= need; level++; need = 100 * level; }
  return { level, into: rest, need };
}

/**
 * Zuordnung: assignment[i] = Index des Namens, der der Flagge i zugeordnet wurde (-1 = nicht zugeordnet).
 * Richtig ist Flagge i -> Name i. Punkte = Anteil richtiger Paare.
 */
export function matchScore(assignment: number[]): number {
  if (!assignment.length) return 0;
  return assignment.filter((a, i) => a === i).length / assignment.length;
}
export const matchCorrect = (score: number) => score === 1;
