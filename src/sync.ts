// Optionaler Sync über Supabase. Ohne VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY ist alles lokal.
// Login per 6-stelligem Code aus der E-Mail (funktioniert auch in der installierten iPhone-App,
// wo ein Magic-Link im Safari statt in der App landen würde).
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

export async function sendCode(email: string) {
  const c = sb();
  if (!c) throw new Error('Sync ist nicht eingerichtet.');
  const { error } = await c.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) throw error;
}

export async function verifyCode(email: string, token: string) {
  const c = sb();
  if (!c) throw new Error('Sync ist nicht eingerichtet.');
  const { error } = await c.auth.verifyOtp({ email, token, type: 'email' });
  if (error) throw error;
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
