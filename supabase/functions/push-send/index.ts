// Supabase Edge Function: verschickt fällige Push-Nachrichten aus public.push_queue (Web Push, VAPID).
// Wird jede Minute von pg_cron aufgerufen (siehe supabase/006_push.sql), nur mit dem Header x-push-secret.
// Secrets (Supabase → Edge Functions → Secrets): VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT, PUSH_SECRET.
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';


Deno.serve(async (req) => {
  if (req.headers.get('x-push-secret') !== Deno.env.get('PUSH_SECRET')) return new Response('nein', { status: 401 });
  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT')!, Deno.env.get('VAPID_PUBLIC')!, Deno.env.get('VAPID_PRIVATE')!);
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  const { data: due, error } = await db.from('push_queue').select('*').is('sent_at', null).lte('send_after', new Date().toISOString()).order('id').limit(100);
  if (error) return new Response(error.message, { status: 500 });
  const out = { sent: 0, capped: 0, noDevice: 0, failed: 0, removed: 0 };
  // Heute (deutsche Zeit) schon verschickte pro Person
  const { data: counts } = await db.rpc('push_sent_today', { p_users: [...new Set((due ?? []).map((q) => q.user_id))] });
  const sentToday = new Map<string, number>((counts ?? []).map((c: { user_id: string; n: number }) => [c.user_id, c.n]));
  // Tageslimit pro Person (Einstellung, 0 = unbegrenzt)
  const maxOf = new Map<string, number>((counts ?? []).map((c: { user_id: string; daily_max: number }) => [c.user_id, c.daily_max]));

  for (const q of due ?? []) {
    // Reservieren: nur wer den Eintrag noch unversendet vorfindet, verschickt ihn (Minuten-Takt und Sofort-Versand können sich überschneiden)
    const { data: mine } = await db.from('push_queue').update({ sent_at: new Date().toISOString(), status: 'sende' }).eq('id', q.id).is('sent_at', null).select('id');
    if (!mine?.length) continue;
    const n = sentToday.get(q.user_id) ?? 0;
    const max = maxOf.get(q.user_id) ?? 5;
    if (q.kind !== 'test' && max > 0 && n >= max) { await db.from('push_queue').update({ sent_at: new Date().toISOString(), status: 'limit' }).eq('id', q.id); out.capped++; continue; }
    const { data: subs } = await db.from('push_subscriptions').select('*').eq('user_id', q.user_id);
    if (!subs?.length) { await db.from('push_queue').update({ sent_at: new Date().toISOString(), status: 'kein-geraet' }).eq('id', q.id); out.noDevice++; continue; }
    const payload = JSON.stringify({ title: q.title, body: q.body, url: q.url, tag: q.kind + ':' + (q.ref ?? q.id) });
    let okAny = false;
    for (const s of subs) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 24 * 3600, urgency: 'normal' });
        okAny = true;
        await db.from('push_subscriptions').update({ last_ok_at: new Date().toISOString() }).eq('id', s.id);
      } catch (e: any) {
        // 404/410: Gerät gibt es nicht mehr -> entfernen
        if (e?.statusCode === 404 || e?.statusCode === 410) { await db.from('push_subscriptions').delete().eq('id', s.id); out.removed++; }
        else console.error('push', e?.statusCode, e?.body ?? e?.message);
      }
    }
    await db.from('push_queue').update({ sent_at: new Date().toISOString(), status: okAny ? 'gesendet' : 'fehler' }).eq('id', q.id);
    if (okAny) { out.sent++; if (q.kind !== 'test') sentToday.set(q.user_id, n + 1); } else out.failed++;
  }
  return new Response(JSON.stringify(out), { headers: { 'content-type': 'application/json' } });
});
