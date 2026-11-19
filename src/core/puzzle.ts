// Karten-Puzzle: Alle Regionen eines Landes nacheinander antippen.
// Wertung: Wer eine Region im ERSTEN Versuch trifft, hat die Kartenfrage dieser Region richtig beantwortet.
// Jeder Fehlversuch zählt als Fehler; nach MAX_TRIES Fehlversuchen wird die Region gezeigt und gilt als falsch.

export const MAX_TRIES = 3;

export interface PuzzleState {
  order: string[];                  // Reihenfolge der gesuchten Regionen (ISO-Codes)
  index: number;                    // aktuelle Position
  tries: number;                    // Fehlversuche bei der aktuellen Region
  results: Record<string, boolean>; // ISO -> im ersten Versuch richtig?
  errors: number;                   // Fehlversuche gesamt
  revealed: string | null;          // nach MAX_TRIES Fehlversuchen aufgedeckte Region
}

export function startPuzzle(isos: string[], rng: () => number = Math.random): PuzzleState {
  const order = [...isos];
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  return { order, index: 0, tries: 0, results: {}, errors: 0, revealed: null };
}

export const currentTarget = (s: PuzzleState): string | null => s.order[s.index] ?? null;
export const isDone = (s: PuzzleState) => s.index >= s.order.length;

export type TapOutcome = 'richtig' | 'falsch' | 'aufgedeckt' | 'ignoriert';

/** Antippen einer Region. Gibt neuen Zustand und Ergebnis zurück (unveränderlich). */
export function tap(s: PuzzleState, iso: string): { state: PuzzleState; outcome: TapOutcome; finished?: { iso: string; ok: boolean } } {
  const target = currentTarget(s);
  if (!target || s.revealed) return { state: s, outcome: 'ignoriert' };
  if (s.order.slice(0, s.index).includes(iso)) return { state: s, outcome: 'ignoriert' }; // schon gelöst
  if (iso === target) {
    const ok = s.tries === 0;
    return { state: { ...s, index: s.index + 1, tries: 0, results: { ...s.results, [target]: ok } }, outcome: 'richtig', finished: { iso: target, ok } };
  }
  const tries = s.tries + 1;
  if (tries >= MAX_TRIES) {
    return { state: { ...s, tries, errors: s.errors + 1, revealed: target, results: { ...s.results, [target]: false } }, outcome: 'aufgedeckt', finished: { iso: target, ok: false } };
  }
  return { state: { ...s, tries, errors: s.errors + 1 }, outcome: 'falsch' };
}

/** Nach dem Aufdecken weiter zur nächsten Region */
export function next(s: PuzzleState): PuzzleState {
  return s.revealed ? { ...s, revealed: null, index: s.index + 1, tries: 0 } : s;
}

export function summary(s: PuzzleState) {
  const total = s.order.length;
  const firstTry = Object.values(s.results).filter(Boolean).length;
  return { total, firstTry, errors: s.errors, accuracy: total ? firstTry / total : 0 };
}

/** Bestzeit nur, wenn alle Regionen gelöst wurden; bessere Zeit oder gleiche Zeit mit weniger Fehlern gewinnt */
export function isBetter(prev: { ms: number; errors: number } | null, cur: { ms: number; errors: number }) {
  if (!prev) return true;
  return cur.ms < prev.ms || (cur.ms === prev.ms && cur.errors < prev.errors);
}
