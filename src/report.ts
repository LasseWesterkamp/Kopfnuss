// „Frage melden“: speichert die Meldung in Supabase (Tabelle meldungen). Ein Datenbank-Trigger mailt sie weiter.
// Funktioniert auch ohne Anmeldung.
import { sb } from './sync';
import type { Question } from './core/types';

export const MIN_LEN = 3, MAX_LEN = 1000;

/** Eingabe prüfen und bereinigen. Gibt Fehlermeldung oder null zurück. */
export function validateReport(text: string): string | null {
  const t = text.trim();
  if (t.length < MIN_LEN) return 'Bitte kurz beschreiben, was falsch ist.';
  if (t.length > MAX_LEN) return `Bitte höchstens ${MAX_LEN} Zeichen.`;
  return null;
}

export const reportPayload = (q: Pick<Question, 'id' | 'prompt'>, text: string) => ({
  question_id: q.id.slice(0, 100),
  frage: q.prompt.slice(0, 500),
  nachricht: text.trim().slice(0, MAX_LEN),
});

export async function sendReport(q: Pick<Question, 'id' | 'prompt'>, text: string): Promise<void> {
  const err = validateReport(text);
  if (err) throw new Error(err);
  const c = sb();
  if (!c) throw new Error('Melden ist gerade nicht möglich.');
  const { error } = await c.from('meldungen').insert(reportPayload(q, text));
  if (error) throw new Error(/failed to fetch|network/i.test(error.message) ? 'Keine Verbindung. Bist du online?' : 'Melden hat nicht geklappt. Bitte später nochmal versuchen.');
}
