// Duelle (Supabase). Alles über Server-Funktionen aus supabase/004_duelle.sql.
import { sb } from './sync';
import type { Duel, DuelAnswer } from './core/duel';

function client() {
  const c = sb();
  if (!c) throw new Error('Sync ist nicht eingerichtet.');
  return c;
}
async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await client().rpc(fn, args);
  if (error) {
    const m = error.message ?? String(error);
    throw new Error(/failed to fetch|network/i.test(m) ? 'Keine Verbindung. Bist du online?' : m);
  }
  return data as T;
}

export const createDuel = (label: string, settings: Record<string, unknown>, ids: string[], time: number, invite: string[] = [], rematchOf: string | null = null) =>
  rpc<{ id: string; code: string; existing: boolean }>('create_duel', { p_label: label, p_settings: settings, p_question_ids: ids, p_time_limit: time, p_invite: invite, p_rematch_of: rematchOf });
export const inviteToDuel = (id: string, users: string[]) => rpc<number>('invite_to_duel', { p_duel: id, p_users: users });
export interface Mate { user_id: string; name: string }
export const myGroupmates = () => rpc<Mate[]>('my_groupmates');
export const joinDuel = (code: string) => rpc<string>('join_duel', { p_code: code });
export const startDuel = (id: string) => rpc<{ question_ids: string[]; time_limit: number; started_at: string }>('start_duel', { p_duel: id });
export const finishDuel = (id: string, answers: DuelAnswer[], aborted = false) => rpc<void>('finish_duel', { p_duel: id, p_answers: answers, p_aborted: aborted });
export const myDuels = () => rpc<Duel[]>('my_duels');

export const duelUrl = (code: string) => `${location.origin}${import.meta.env.BASE_URL}?duell=${encodeURIComponent(code)}`;

// Laufendes Duell lokal sichern, damit nach Absturz/Schließen beim nächsten Öffnen abgegeben werden kann
const K_PENDING = 'kopfnuss.duel.pending';
export interface Pending { id: string; answers: DuelAnswer[] }
export function savePending(p: Pending | null) {
  try { if (p) localStorage.setItem(K_PENDING, JSON.stringify(p)); else localStorage.removeItem(K_PENDING); } catch { /* egal */ }
}
export function loadPending(): Pending | null {
  try { const v = localStorage.getItem(K_PENDING); return v ? JSON.parse(v) : null; } catch { return null; }
}
/** Offene Abgabe nachholen (App wurde während eines Duells geschlossen) */
export async function flushPending() {
  const p = loadPending();
  if (!p) return false;
  await finishDuel(p.id, p.answers, true);
  savePending(null);
  return true;
}

// Gesehene fertige Duelle (für die Zahl am Tab)
const K_SEEN = 'kopfnuss.duel.seen';
export function loadSeen(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(K_SEEN) ?? '[]')); } catch { return new Set(); }
}
export function markSeen(id: string) {
  const s = loadSeen(); s.add(id);
  try { localStorage.setItem(K_SEEN, JSON.stringify([...s].slice(-300))); } catch { /* egal */ }
}
