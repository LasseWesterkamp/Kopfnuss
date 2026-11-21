// Push-Benachrichtigungen: Gerät an-/abmelden, Einstellungen. Verschickt wird nur vom Server (supabase/006_push.sql).
import { sb } from './sync';
import { iosVersionFromUa, pushAdvice, urlB64ToUint8Array, normTime, DEFAULT_PUSH_PREFS, type Platform, type PushPrefs } from './core/pushinfo';

const KEY = import.meta.env.VITE_VAPID_PUBLIC as string | undefined;
export const pushConfigured = !!KEY;

export function platform(): Platform {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return {
    ios,
    iosVersion: iosVersionFromUa(ua),
    standalone: matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true,
    supported: 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window,
    permission: 'Notification' in window ? Notification.permission : 'default',
  };
}
export const advice = () => pushAdvice(platform());

async function subscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator)) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager ? reg.pushManager.getSubscription() : null;
}
export async function isOn(): Promise<boolean> {
  return advice() === 'ok' && Notification.permission === 'granted' && !!(await subscription());
}

async function save(sub: PushSubscription) {
  const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  const c = sb(); if (!c) throw new Error('Sync ist nicht eingerichtet.');
  const { error } = await c.rpc('save_push_subscription', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth });
  if (error) throw new Error(error.message);
}

/** Erlaubnis holen (nur nach Tipp aufrufen!), Gerät beim Push-Dienst und bei uns anmelden */
export async function enable() {
  if (!KEY) throw new Error('Push ist nicht eingerichtet.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error(perm === 'denied' ? 'Benachrichtigungen sind blockiert. Erlaube sie in den Einstellungen deines Browsers bzw. iPhones.' : 'Nicht erlaubt.');
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(KEY) as BufferSource }));
  await save(sub);
}

/** Dieses Gerät abmelden (beim Ausschalten und beim Abmelden vom Konto) */
export async function disable() {
  await resyncing?.catch(() => {}); // eine laufende Neu-Zuordnung zuerst abwarten, sonst trägt sie das Gerät danach wieder ein
  const sub = await subscription();
  if (!sub) return;
  await sb()?.rpc('remove_push_subscription', { p_endpoint: sub.endpoint });
  await sub.unsubscribe().catch(() => {});
}

/** Nach Anmeldung: vorhandenes Abo dem aktuellen Konto zuordnen (falls jemand anders vorher angemeldet war) */
let resyncing: Promise<void> | null = null;
export function resync() {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return Promise.resolve();
  resyncing = (async () => { const sub = await subscription(); if (sub) await save(sub).catch(() => {}); })();
  return resyncing;
}

export async function loadPrefs(): Promise<PushPrefs> {
  const c = sb(); if (!c) return DEFAULT_PUSH_PREFS;
  const { data } = await c.from('push_settings').select('challenge,decided,expiring,streak,quiet_enabled,quiet_start,quiet_end,daily_max,streak_time').maybeSingle();
  return data ? { ...DEFAULT_PUSH_PREFS, ...data, streak_time: normTime(data.streak_time) } : DEFAULT_PUSH_PREFS;
}
export async function savePrefs(p: PushPrefs) {
  const c = sb(); if (!c) return;
  const { data: s } = await c.auth.getSession();
  const { error } = await c.from('push_settings').upsert({ user_id: s.session?.user.id, ...p, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

/** Testnachricht an alle eigenen Geräte (höchstens 1 pro Minute) */
export async function sendTest() {
  const c = sb(); if (!c) throw new Error('Sync ist nicht eingerichtet.');
  const { error } = await c.rpc('push_test');
  if (error) throw new Error(error.message);
}

// Einmaliger Hinweis nach dem ersten Duell
const K_HINT = 'kopfnuss.push.hint';
export const hintDone = () => { try { return localStorage.getItem(K_HINT) === '1'; } catch { return true; } };
export const setHintDone = () => { try { localStorage.setItem(K_HINT, '1'); } catch { /* egal */ } };
