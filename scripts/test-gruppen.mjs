// Integrationstest für Gruppen & Zugriffsregeln gegen das echte Supabase-Projekt (aus .env.production).
// Legt drei Testkonten an (A und B in einer Gruppe, C außen vor) und prüft, wer was sehen und ändern darf.
// Aufruf: npm run test:gruppen   (Node >= 22; hinter einem Proxy: NODE_USE_ENV_PROXY=1 davor)
// Danach die Testkonten löschen, siehe README „Gruppen testen“.
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
const env = Object.fromEntries(fs.readFileSync('.env.production', 'utf8').split('\n').filter((l) => l.startsWith('VITE_')).map((l) => l.split('=')));
const mk = () => createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const stamp = Date.now();
const users = {};
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log((ok ? '  OK   ' : '  FEHLER ') + name + (detail ? ' (' + detail + ')' : '')); ok ? pass++ : fail++; };
for (const n of ['a', 'b', 'c']) {
  const c = mk();
  const { data, error } = await c.auth.signUp({ email: `kopfnuss-test-${n}-${stamp}@example.com`, password: 'Testpasswort-123' });
  if (error) throw error;
  users[n] = { c, id: data.user.id };
}
const { a, b, c } = users;
const week = (await a.c.rpc('current_week')).data;
// Profile + Stats
for (const [n, u] of Object.entries(users)) await u.c.from('profiles').insert({ user_id: u.id, display_name: 'Test ' + n.toUpperCase() });
check('Stats A hochladen', !(await a.c.from('stats').upsert({ user_id: a.id, week, week_xp: 120, week_answers: 12, total_xp: 500, streak: 0 })).error);
check('Stats B hochladen', !(await b.c.from('stats').upsert({ user_id: b.id, week, week_xp: 80, week_answers: 8, total_xp: 80, streak: 1 })).error);
const bad = await b.c.from('stats').upsert({ user_id: b.id, week, week_xp: 34000, week_answers: 10, total_xp: 99999, streak: 1 });
check('Unplausible Wochen-XP werden abgelehnt', !!bad.error, bad.error?.message);
const bad2 = await b.c.from('stats').upsert({ user_id: b.id, week, week_xp: 10, week_answers: 1, total_xp: 10, streak: 5000 });
check('Unplausible Serie wird abgelehnt', !!bad2.error, bad2.error?.message);
const fake = await c.c.from('stats').upsert({ user_id: a.id, week, week_xp: 0, week_answers: 0, total_xp: 0, streak: 0 });
check('C kann Werte von A nicht überschreiben', !!fake.error);
// Gruppe
const { data: g, error: ge } = await a.c.rpc('create_group', { p_name: 'Testgruppe' });
check('A legt Gruppe an', !ge && /^[A-Z2-9]{6}$/.test(g?.invite_code), g?.invite_code);
check('C mit falschem Code abgewiesen', !!(await c.c.rpc('join_group', { p_code: 'ZZZZZZ' })).error);
check('B tritt per Code bei (Kleinbuchstaben)', !(await b.c.rpc('join_group', { p_code: g.invite_code.toLowerCase() })).error);
const direct = await c.c.from('group_members').insert({ group_id: g.id, user_id: c.id });
check('C kann sich nicht direkt in die Tabelle eintragen', !!direct.error);
// Rangliste
const lb = (await b.c.rpc('group_leaderboard', { p_group: g.id })).data ?? [];
check('B sieht Rangliste mit 2 Mitgliedern', lb.length === 2, lb.map((e) => `${e.display_name}:${e.week_xp}`).join(', '));
check('Rangliste enthält keine E-Mail', lb.every((e) => !JSON.stringify(e).includes('@')));
check('A ist als Admin markiert', lb.find((e) => e.user_id === a.id)?.is_owner === true);
check('C sieht Rangliste nicht', ((await c.c.rpc('group_leaderboard', { p_group: g.id })).data ?? []).length === 0);
check('C sieht Gruppe nicht', ((await c.c.from('groups').select('*')).data ?? []).length === 0);
check('C sieht Profil von A nicht', ((await c.c.from('profiles').select('*').eq('user_id', a.id)).data ?? []).length === 0);
check('C sieht Stats von A nicht', ((await c.c.from('stats').select('*').eq('user_id', a.id)).data ?? []).length === 0);
check('B sieht Profil von A (Gruppenmitglied)', ((await b.c.from('profiles').select('display_name').eq('user_id', a.id)).data ?? []).length === 1);
await a.c.from('progress').upsert({ user_id: a.id, data: { version: 1, cards: {}, log: {}, recent: [], updatedAt: 1 } });
check('B sieht Lernstand von A NICHT', ((await b.c.from('progress').select('*').eq('user_id', a.id)).data ?? []).length === 0);
// Admin-Rechte
check('B darf A nicht entfernen', !!(await b.c.rpc('remove_member', { p_group: g.id, p_user: a.id })).error);
check('B darf Code nicht erneuern', !!(await b.c.rpc('renew_invite_code', { p_group: g.id })).error);
const ren = await b.c.from('groups').update({ name: 'Gekapert' }).eq('id', g.id).select();
check('B darf Gruppe nicht umbenennen', (ren.data ?? []).length === 0);
const code2 = (await a.c.rpc('renew_invite_code', { p_group: g.id })).data;
check('A erneuert Code, alter Code ungültig', code2 && code2 !== g.invite_code && !!(await c.c.rpc('join_group', { p_code: g.invite_code })).error);
// Admin verlässt -> B wird Admin
check('A verlässt Gruppe', !(await a.c.rpc('leave_group', { p_group: g.id })).error);
const lb2 = (await b.c.rpc('group_leaderboard', { p_group: g.id })).data ?? [];
check('B ist jetzt Admin', lb2.length === 1 && lb2[0].is_owner === true);
check('A sieht Profil von B nicht mehr', ((await a.c.from('profiles').select('*').eq('user_id', b.id)).data ?? []).length === 0);
console.log(`\n${pass} OK, ${fail} Fehler`);
console.log('Testkonten (bitte löschen, siehe README):', Object.keys(users).map((n) => `kopfnuss-test-${n}-${stamp}@example.com`).join(', '));
process.exit(fail ? 1 : 0);
