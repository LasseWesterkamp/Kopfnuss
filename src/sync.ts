// Optionaler Sync über Supabase. Ohne VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY ist alles lokal.
// Login per E-Mail + Passwort. (Code-Login per Mail ist im Supabase-Gratistarif nicht möglich,
// und ein Magic-Link würde auf dem iPhone in Safari statt in der installierten App landen.)
import { createClient, type SupabaseClient, type Session } from '@supabase/supabase-js';
import type { Progress } from './core/types';
import { mergeProgress } from './core/progress';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const syncConfigured = !!(url && key);
let client: SupabaseClient | null = null;
function sb() {
  if (!client && url && key) client = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } });
  return client;
}

export async function getSession(): Promise<Session | null> {
  const c = sb();
  if (!c) return null;
  const { data } = await c.auth.getSession();
  return data.session;
}

export function onAuthChange(cb: (s: Session | null) => void) {
  const c = sb();
  if (!c) return () => {};
  const { data } = c.auth.onAuthStateChange((_e, s) => cb(s));
  return () => data.subscription.unsubscribe();
}

function deutsch(e: { message?: string }): Error {
  const m = e.message ?? String(e);
  if (/invalid login credentials/i.test(m)) return new Error('E-Mail oder Passwort falsch.');
  if (/already registered|already exists/i.test(m)) return new Error('Für diese E-Mail gibt es schon ein Konto. Bitte anmelden.');
  if (/password should be at least|weak password/i.test(m)) return new Error('Das Passwort muss mindestens 8 Zeichen haben.');
  if (/rate limit/i.test(m)) return new Error('Zu viele Versuche. Bitte kurz warten.');
  if (/failed to fetch|network/i.test(m)) return new Error('Keine Verbindung. Bist du online?');
  return new Error(m);
}

export async function signIn(email: string, password: string) {
  const c = sb();
  if (!c) throw new Error('Sync ist nicht eingerichtet.');
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw deutsch(error);
}

export async function signUp(email: string, password: string) {
  const c = sb();
  if (!c) throw new Error('Sync ist nicht eingerichtet.');
  const { data, error } = await c.auth.signUp({ email, password });
  if (error) throw deutsch(error);
  // Supabase meldet bei bereits registrierter E-Mail teils keinen Fehler, sondern einen Nutzer ohne Identitäten
  if (data.user && data.user.identities?.length === 0) throw deutsch({ message: 'already registered' });
  if (!data.session) await signIn(email, password);
}

export async function signOut() {
  await sb()?.auth.signOut();
}

/** Holt den Server-Stand, führt ihn mit dem lokalen zusammen und schreibt das Ergebnis zurück. */
export async function syncProgress(local: Progress): Promise<Progress> {
  const c = sb();
  if (!c) return local;
  const { data: s } = await c.auth.getSession();
  const uid = s.session?.user.id;
  if (!uid) return local;
  const { data, error } = await c.from('progress').select('data').eq('user_id', uid).maybeSingle();
  if (error) throw error;
  const merged = data?.data ? mergeProgress(local, data.data as Progress) : local;
  const { error: e2 } = await c.from('progress').upsert({ user_id: uid, data: merged, updated_at: new Date().toISOString() });
  if (e2) throw e2;
  return merged;
}
