-- Kopfnuss: mehr Push-Einstellungen, Testnachricht, schnellerer Versand, Duell-Zeitlimit 5-60 s.
-- Nach 006_push.sql ausführen, mehrfach ausführbar.

-- ---------- Einstellungen ----------
alter table public.push_settings add column if not exists daily_max smallint not null default 5;
alter table public.push_settings add column if not exists quiet_enabled boolean not null default true;
alter table public.push_settings add column if not exists streak_time time not null default '19:30';
alter table public.push_settings drop constraint if exists push_settings_daily_max_check;
alter table public.push_settings add constraint push_settings_daily_max_check check (daily_max in (0, 1, 3, 5, 10)); -- 0 = unbegrenzt
alter table public.push_settings drop constraint if exists push_settings_streak_time_check;
alter table public.push_settings add constraint push_settings_streak_time_check
  check (streak_time between '17:00' and '22:00' and extract(minute from streak_time) in (0, 30) and extract(second from streak_time) = 0);

alter table public.push_queue drop constraint if exists push_queue_kind_check;
alter table public.push_queue add constraint push_queue_kind_check check (kind in ('challenge', 'decided', 'expiring', 'streak', 'test'));

-- Duelle: Zeitlimit frei zwischen 5 und 60 s (vorher nur 10/20/30)
alter table public.duels drop constraint if exists duels_time_limit_check;
alter table public.duels add constraint duels_time_limit_check check (time_limit between 5 and 60);

-- ---------- Ruhezeit: abschaltbar ----------
create or replace function public.push_quiet_until(p_user uuid, p_at timestamptz) returns timestamptz
language plpgsql stable security definer set search_path = '' as $$
declare s int; e int; on_ boolean; loc timestamp; h int; quiet boolean; until_loc timestamp;
begin
  select quiet_start, quiet_end, quiet_enabled into s, e, on_ from public.push_settings where user_id = p_user;
  if on_ is false then return p_at; end if;
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

-- ---------- Sofort an die Edge Function übergeben (statt bis zum nächsten Minuten-Takt zu warten) ----------
create or replace function public.push_flush() returns void
language plpgsql security definer set search_path = '' as $$
declare fn_url text; secret text;
begin
  select decrypted_secret into fn_url from vault.decrypted_secrets where name = 'push_function_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'push_secret';
  if fn_url is null or secret is null then return; end if;
  perform net.http_post(url := fn_url, headers := jsonb_build_object('x-push-secret', secret, 'Content-Type', 'application/json'), body := '{}'::jsonb, timeout_milliseconds := 20000);
end;
$$;

create or replace function public.push_enqueue(p_user uuid, p_kind text, p_ref text, p_title text, p_body text, p_url text, p_dedupe text,
  p_at timestamptz default now(), p_skip_if_quiet boolean default false) returns boolean
language plpgsql security definer set search_path = '' as $$
declare st public.push_settings; after timestamptz; added boolean;
begin
  select * into st from public.push_settings where user_id = p_user;
  if p_kind <> 'test' and st.user_id is not null and not (case p_kind when 'challenge' then st.challenge when 'decided' then st.decided
                                                   when 'expiring' then st.expiring when 'streak' then st.streak else false end) then
    return false;
  end if;
  if not exists (select 1 from public.push_subscriptions where user_id = p_user) then return false; end if;
  after := case when p_kind = 'test' then p_at else public.push_quiet_until(p_user, p_at) end;
  if p_skip_if_quiet and after > p_at then return false; end if;
  insert into public.push_queue (user_id, kind, ref, title, body, url, send_after, dedupe)
    values (p_user, p_kind, p_ref, left(p_title, 120), left(p_body, 200), p_url, after, p_dedupe)
    on conflict (dedupe) do nothing;
  added := found;
  if added and after <= now() then perform public.push_flush(); end if; -- sofort verschicken
  return added;
end;
$$;

-- ---------- Serie-Erinnerung zur eigenen Uhrzeit ----------
create or replace function public.push_enqueue_streak(p_now timestamptz default now()) returns int
language plpgsql security definer set search_path = '' as $$
declare loc timestamp := p_now at time zone 'Europe/Berlin'; r record; n int := 0;
begin
  for r in select s.user_id, s.streak from public.stats s
           left join public.push_settings ps on ps.user_id = s.user_id
           where s.streak >= 2 and (s.updated_at at time zone 'Europe/Berlin')::date < loc::date
             and loc::time >= coalesce(ps.streak_time, time '19:30')
             and exists (select 1 from public.push_subscriptions x where x.user_id = s.user_id) loop
    if public.push_enqueue(r.user_id, 'streak', null, '🔥 Deine ' || r.streak || '-Tage-Serie wartet noch auf heute',
         'Zehn Fragen, dann ist sie gerettet.', '#/', 'streak:' || r.user_id || ':' || loc::date, p_now, true) then n := n + 1; end if;
  end loop;
  return n;
end;
$$;

-- Tageshöchstzahl: Testnachrichten zählen nicht mit; Limit pro Person mitliefern (0 = unbegrenzt)
drop function if exists public.push_sent_today(uuid[]);
create or replace function public.push_sent_today(p_users uuid[]) returns table (user_id uuid, n int, daily_max int)
language sql stable security definer set search_path = '' as $$
  select u, coalesce((select count(*)::int from public.push_queue q
                      where q.user_id = u and q.status = 'gesendet' and q.kind <> 'test'
                        and (q.sent_at at time zone 'Europe/Berlin')::date = (now() at time zone 'Europe/Berlin')::date), 0),
         coalesce((select ps.daily_max from public.push_settings ps where ps.user_id = u), 5)
  from unnest(p_users) u;
$$;

-- ---------- Testnachricht (höchstens 1 pro Minute, ohne Ruhezeit und Tageslimit) ----------
create or replace function public.push_test() returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  if not exists (select 1 from public.push_subscriptions where user_id = auth.uid()) then raise exception 'Auf keinem Gerät eingeschaltet'; end if;
  if exists (select 1 from public.push_queue where user_id = auth.uid() and kind = 'test' and created_at > now() - interval '1 minute') then
    raise exception 'Bitte eine Minute warten'; end if;
  return public.push_enqueue(auth.uid(), 'test', null, '🌰 Testnachricht von Kopfnuss', 'Klappt! So sehen Benachrichtigungen aus.', '#/mehr',
    'test:' || auth.uid() || ':' || extract(epoch from now())::bigint);
end;
$$;

revoke all on function public.push_flush(), public.push_sent_today(uuid[]) from public, anon, authenticated;
grant execute on function public.push_sent_today(uuid[]) to service_role;
revoke all on function public.push_test() from public, anon;
grant execute on function public.push_test() to authenticated;
