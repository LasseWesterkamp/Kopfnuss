-- Kopfnuss: Push-Benachrichtigungen (Web Push). Nach 005_duelle_gruppen.sql ausführen, mehrfach ausführbar.
--
-- Ablauf: Trigger und ein Minuten-Takt (pg_cron) legen Nachrichten in public.push_queue.
-- push_tick() ruft jede Minute die Edge Function push-send auf, die verschlüsselt und verschickt.
-- Die App selbst kann niemandem Nachrichten schicken.
--
-- Einmalig zusätzlich (NICHT ins Repo, enthält ein Geheimnis):
--   select vault.create_secret('https://<projekt>.supabase.co/functions/v1/push-send', 'push_function_url');
--   select vault.create_secret('<zufälliger Wert, gleich wie Edge-Function-Secret PUSH_SECRET>', 'push_secret');

create extension if not exists pg_cron;

-- ---------- Tabellen ----------
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  endpoint text not null unique check (endpoint like 'https://%'),
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  last_ok_at timestamptz
);
create index if not exists push_subscriptions_user on public.push_subscriptions (user_id);

create table if not exists public.push_settings (
  user_id uuid primary key references auth.users on delete cascade default auth.uid(),
  challenge boolean not null default true,   -- herausgefordert / Revanche / dazugeholt
  decided boolean not null default true,     -- Duell entschieden
  expiring boolean not null default true,    -- Duell läuft in 24 h ab
  streak boolean not null default true,      -- Serie in Gefahr (19:30)
  quiet_start smallint not null default 21 check (quiet_start between 0 and 23),
  quiet_end smallint not null default 8 check (quiet_end between 0 and 23),
  updated_at timestamptz not null default now()
);

create table if not exists public.push_queue (
  id bigserial primary key,
  user_id uuid not null references auth.users on delete cascade,
  kind text not null check (kind in ('challenge', 'decided', 'expiring', 'streak')),
  ref text,
  title text not null,
  body text not null,
  url text not null,
  send_after timestamptz not null default now(),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  status text,
  dedupe text unique
);
create index if not exists push_queue_due on public.push_queue (send_after) where sent_at is null;

alter table public.push_subscriptions enable row level security;
alter table public.push_settings enable row level security;
alter table public.push_queue enable row level security;
revoke all on public.push_queue from anon, authenticated;
revoke all on public.push_subscriptions from anon;
revoke all on public.push_settings from anon;

drop policy if exists "eigene geraete lesen" on public.push_subscriptions;
drop policy if exists "eigene geraete loeschen" on public.push_subscriptions;
create policy "eigene geraete lesen" on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
create policy "eigene geraete loeschen" on public.push_subscriptions for delete to authenticated using (user_id = auth.uid());

drop policy if exists "eigene einstellungen lesen" on public.push_settings;
drop policy if exists "eigene einstellungen anlegen" on public.push_settings;
drop policy if exists "eigene einstellungen aendern" on public.push_settings;
create policy "eigene einstellungen lesen" on public.push_settings for select to authenticated using (user_id = auth.uid());
create policy "eigene einstellungen anlegen" on public.push_settings for insert to authenticated with check (user_id = auth.uid());
create policy "eigene einstellungen aendern" on public.push_settings for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- Gerät an- und abmelden (aus der App) ----------
-- Ein Gerät gehört immer nur einem Konto: meldet sich jemand anders darauf an, wird es umgehängt.
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  if p_endpoint not like 'https://%' or char_length(p_endpoint) > 1000 or char_length(p_p256dh) > 200 or char_length(p_auth) > 100 then
    raise exception 'Ungültiges Push-Abo'; end if;
  if (select count(*) from public.push_subscriptions where user_id = auth.uid()) >= 10 then
    delete from public.push_subscriptions where id = (select id from public.push_subscriptions where user_id = auth.uid() order by created_at limit 1);
  end if;
  delete from public.push_subscriptions where endpoint = p_endpoint;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values (auth.uid(), p_endpoint, p_p256dh, p_auth);
  insert into public.push_settings (user_id) values (auth.uid()) on conflict do nothing;
end;
$$;

create or replace function public.remove_push_subscription(p_endpoint text) returns void
language sql security definer set search_path = '' as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
$$;

-- ---------- Ruhezeit: wann darf frühestens gesendet werden? ----------
create or replace function public.push_quiet_until(p_user uuid, p_at timestamptz) returns timestamptz
language plpgsql stable security definer set search_path = '' as $$
declare s int; e int; loc timestamp; h int; quiet boolean; until_loc timestamp;
begin
  select quiet_start, quiet_end into s, e from public.push_settings where user_id = p_user;
  s := coalesce(s, 21); e := coalesce(e, 8);
  if s = e then return p_at; end if;
  loc := p_at at time zone 'Europe/Berlin';
  h := extract(hour from loc);
  quiet := case when s < e then h >= s and h < e else h >= s or h < e end;
  if not quiet then return p_at; end if;
  until_loc := date_trunc('day', loc) + make_interval(hours => e);
  if until_loc <= loc then until_loc := until_loc + interval '1 day'; end if;
  return until_loc at time zone 'Europe/Berlin';
end;
$$;

-- ---------- In die Warteschlange (nur wenn Anlass an und mindestens ein Gerät da) ----------
create or replace function public.push_enqueue(p_user uuid, p_kind text, p_ref text, p_title text, p_body text, p_url text, p_dedupe text,
  p_at timestamptz default now(), p_skip_if_quiet boolean default false) returns boolean
language plpgsql security definer set search_path = '' as $$
declare st public.push_settings; after timestamptz;
begin
  select * into st from public.push_settings where user_id = p_user;
  if st.user_id is not null and not (case p_kind when 'challenge' then st.challenge when 'decided' then st.decided
                                                   when 'expiring' then st.expiring when 'streak' then st.streak else false end) then
    return false;
  end if;
  if not exists (select 1 from public.push_subscriptions where user_id = p_user) then return false; end if;
  after := public.push_quiet_until(p_user, p_at);
  if p_skip_if_quiet and after > p_at then return false; end if;
  insert into public.push_queue (user_id, kind, ref, title, body, url, send_after, dedupe)
    values (p_user, p_kind, p_ref, left(p_title, 120), left(p_body, 200), p_url, after, p_dedupe)
    on conflict (dedupe) do nothing;
  return found;
end;
$$;

-- ---------- Anlass: herausgefordert (direkt, Revanche, dazugeholt) ----------
create or replace function public.push_on_duel_player() returns trigger
language plpgsql security definer set search_path = '' as $$
declare d public.duels; who text;
begin
  if new.user_id = auth.uid() or auth.uid() is null then return new; end if; -- selbst beigetreten (Link/Code) oder Herausforderer
  select * into d from public.duels where id = new.duel_id;
  select display_name into who from public.profiles where user_id = auth.uid();
  perform public.push_enqueue(new.user_id, 'challenge', d.id::text,
    case when d.rematch_of is not null then '🔁 ' || coalesce(who, 'Jemand') || ' will eine Revanche'
         else '⚔️ ' || coalesce(who, 'Jemand') || ' fordert dich heraus' end,
    d.label || ' · ' || cardinality(d.question_ids) || ' Fragen, ' || d.time_limit || ' s pro Frage',
    '#/duell/' || d.id, 'challenge:' || d.id || ':' || new.user_id);
  return new;
end;
$$;
drop trigger if exists push_duel_player on public.duel_players;
create trigger push_duel_player after insert on public.duel_players for each row execute function public.push_on_duel_player();

-- ---------- Anlass: Duell entschieden (alle fertig). Kein Ergebnis im Text, keine Nachricht an den, der gerade selbst fertig wurde ----------
create or replace function public.push_on_duel_finished() returns trigger
language plpgsql security definer set search_path = '' as $$
declare d public.duels; p record;
begin
  if old.finished_at is not null or new.finished_at is null then return new; end if;
  if exists (select 1 from public.duel_players where duel_id = new.duel_id and finished_at is null) then return new; end if;
  if (select count(*) from public.duel_players where duel_id = new.duel_id) < 2 then return new; end if;
  select * into d from public.duels where id = new.duel_id;
  for p in select user_id from public.duel_players where duel_id = new.duel_id loop
    if p.user_id = auth.uid() then continue; end if;
    perform public.push_enqueue(p.user_id, 'decided', d.id::text, '🏁 Duell „' || d.label || '“ ist entschieden',
      'Wer hat gewonnen? Tipp zum Nachsehen.', '#/duell/' || d.id, 'decided:' || d.id || ':' || p.user_id);
  end loop;
  return new;
end;
$$;
drop trigger if exists push_duel_finished on public.duel_players;
create trigger push_duel_finished after update of finished_at on public.duel_players for each row execute function public.push_on_duel_finished();

-- ---------- Anlass: Serie in Gefahr (ab 19:30 deutscher Zeit, einmal pro Tag, nicht in der Ruhezeit) ----------
-- "Heute aktiv" = Ranglistenwerte heute (deutsche Zeit) hochgeladen. Im Zweifel lieber keine Nachricht.
create or replace function public.push_enqueue_streak(p_now timestamptz default now()) returns int
language plpgsql security definer set search_path = '' as $$
declare loc timestamp := p_now at time zone 'Europe/Berlin'; r record; n int := 0;
begin
  if loc::time < time '19:30' then return 0; end if;
  for r in select s.user_id, s.streak from public.stats s
           where s.streak >= 2 and (s.updated_at at time zone 'Europe/Berlin')::date < loc::date
             and exists (select 1 from public.push_subscriptions ps where ps.user_id = s.user_id) loop
    if public.push_enqueue(r.user_id, 'streak', null, '🔥 Deine ' || r.streak || '-Tage-Serie wartet noch auf heute',
         'Zehn Fragen, dann ist sie gerettet.', '#/', 'streak:' || r.user_id || ':' || loc::date, p_now, true) then n := n + 1; end if;
  end loop;
  return n;
end;
$$;

-- ---------- Anlass: Duell läuft in 24 h ab und ich habe noch nicht gespielt ----------
create or replace function public.push_enqueue_expiring(p_now timestamptz default now()) returns int
language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0;
begin
  for r in select d.id, d.label, p.user_id from public.duels d join public.duel_players p on p.duel_id = d.id
           where p.started_at is null and d.expires_at > p_now and d.expires_at <= p_now + interval '24 hours'
             and (select count(*) from public.duel_players x where x.duel_id = d.id) >= 2 loop
    if public.push_enqueue(r.user_id, 'expiring', r.id::text, '⏳ Dein Duell „' || r.label || '“ läuft bald ab',
         'Du hast noch nicht gespielt. Zehn Fragen, dann bist du durch.', '#/duell/' || r.id, 'expiring:' || r.id || ':' || r.user_id, p_now) then n := n + 1; end if;
  end loop;
  return n;
end;
$$;

-- Für die Edge Function: heute (deutsche Zeit) schon verschickte Nachrichten pro Person (Tageshöchstzahl)
create or replace function public.push_sent_today(p_users uuid[]) returns table (user_id uuid, n int)
language sql stable security definer set search_path = '' as $$
  select q.user_id, count(*)::int from public.push_queue q
  where q.user_id = any(p_users) and q.status = 'gesendet'
    and (q.sent_at at time zone 'Europe/Berlin')::date = (now() at time zone 'Europe/Berlin')::date
  group by q.user_id;
$$;

-- ---------- Minuten-Takt ----------
create or replace function public.push_tick() returns void
language plpgsql security definer set search_path = '' as $$
declare fn_url text; secret text;
begin
  perform public.duel_finalize_overdue();
  perform public.push_enqueue_expiring();
  perform public.push_enqueue_streak();
  if not exists (select 1 from public.push_queue where sent_at is null and send_after <= now()) then return; end if;
  select decrypted_secret into fn_url from vault.decrypted_secrets where name = 'push_function_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'push_secret';
  if fn_url is null or secret is null then return; end if;
  perform net.http_post(url := fn_url, headers := jsonb_build_object('x-push-secret', secret, 'Content-Type', 'application/json'), body := '{}'::jsonb, timeout_milliseconds := 20000);
end;
$$;

revoke all on function public.push_quiet_until(uuid, timestamptz), public.push_enqueue(uuid, text, text, text, text, text, text, timestamptz, boolean),
  public.push_enqueue_streak(timestamptz), public.push_enqueue_expiring(timestamptz), public.push_sent_today(uuid[]), public.push_tick(),
  public.push_on_duel_player(), public.push_on_duel_finished() from public, anon, authenticated;
grant execute on function public.push_sent_today(uuid[]) to service_role;
grant select, insert, update, delete on public.push_queue, public.push_subscriptions, public.push_settings to service_role;
-- Zugriff aus der App (Zeilen begrenzt durch die Policies oben)
grant select, delete on public.push_subscriptions to authenticated;
grant select, insert, update on public.push_settings to authenticated;
grant usage, select on sequence public.push_queue_id_seq to service_role;
revoke all on function public.save_push_subscription(text, text, text), public.remove_push_subscription(text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text), public.remove_push_subscription(text) to authenticated;

do $$ begin perform cron.unschedule('kopfnuss-push'); exception when others then null; end $$;
select cron.schedule('kopfnuss-push', '* * * * *', 'select public.push_tick()');
