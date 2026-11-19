// Gruppen & Ranglisten (Supabase). Alle Änderungen laufen über Server-Funktionen mit Regelprüfung (supabase/002_gruppen.sql).
import { sb } from './sync';
import type { Entry, MyStats } from './core/leaderboard';

export interface Group { id: string; name: string; invite_code: string; owner_id: string }

function client() {
  const c = sb();
  if (!c) throw new Error('Sync ist nicht eingerichtet.');
  return c;
}
function deutsch(e: { message?: string; code?: string }): Error {
  const m = e.message ?? String(e);
  if (/failed to fetch|network/i.test(m)) return new Error('Keine Verbindung. Bist du online?');
  if (/display_name.*check|char_length/i.test(m)) return new Error('Der Name muss 1 bis 30 Zeichen haben.');
  if (/name.*check/i.test(m)) return new Error('Der Gruppenname muss 1 bis 40 Zeichen haben.');
  return new Error(m);
}

async function uid(): Promise<string> {
  const { data } = await client().auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error('Nicht angemeldet.');
  return id;
}

export async function getDisplayName(): Promise<string | null> {
  const { data, error } = await client().from('profiles').select('display_name').eq('user_id', await uid()).maybeSingle();
  if (error) throw deutsch(error);
  return data?.display_name ?? null;
}

export async function setDisplayName(name: string) {
  const { error } = await client().from('profiles').upsert({ user_id: await uid(), display_name: name.trim(), updated_at: new Date().toISOString() });
  if (error) throw deutsch(error);
}

/** Eigene Ranglistenwerte hochladen (nach jedem Sync). Fehler werden nur geloggt, sie sollen den Sync nicht stören. */
export async function publishStats(s: MyStats) {
  const c = sb();
  if (!c) return;
  const { data } = await c.auth.getSession();
  const id = data.session?.user.id;
  if (!id) return;
  const { error } = await c.from('stats').upsert({ user_id: id, ...s });
  if (error) console.warn('Ranglistenwerte nicht übertragen:', error.message);
}

export async function myGroups(): Promise<Group[]> {
  const { data, error } = await client().from('groups').select('id, name, invite_code, owner_id').order('created_at');
  if (error) throw deutsch(error);
  return data ?? [];
}

const rpc = async <T>(fn: string, args: Record<string, unknown>): Promise<T> => {
  const { data, error } = await client().rpc(fn, args);
  if (error) throw deutsch(error);
  return data as T;
};

export const createGroup = (name: string) => rpc<Group>('create_group', { p_name: name.trim() });
export const joinGroup = (code: string) => rpc<Group>('join_group', { p_code: code.trim().toUpperCase() });
export const leaveGroup = (id: string) => rpc<void>('leave_group', { p_group: id });
export const removeMember = (group: string, user: string) => rpc<void>('remove_member', { p_group: group, p_user: user });
export const renewCode = (id: string) => rpc<string>('renew_invite_code', { p_group: id });
export const deleteGroup = (id: string) => rpc<void>('delete_group', { p_group: id });
export const leaderboard = (id: string) => rpc<Entry[]>('group_leaderboard', { p_group: id });

export async function renameGroup(id: string, name: string) {
  const { error } = await client().from('groups').update({ name: name.trim() }).eq('id', id);
  if (error) throw deutsch(error);
}

/** Einladungslink, der die App öffnet und den Code vorausfüllt */
export const inviteLink = (code: string) => `${location.origin}${import.meta.env.BASE_URL}?beitreten=${code}`;
