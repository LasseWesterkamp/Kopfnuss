-- Kopfnuss: Duelle (zeitversetzt, 2 bis 10 Spieler, gleiche Fragen in gleicher Reihenfolge)
-- Im Supabase SQL Editor ausführen (nach 002_gruppen.sql). Kann mehrfach ausgeführt werden.
--
-- Grundsatz: Auf beide Tabellen gibt es KEINE Lese-/Schreib-Policies. Alles läuft über die Funktionen unten
-- (security definer), die selbst prüfen, wer was sehen darf:
--   * Fremde sehen von einem Duell gar nichts.
--   * Die Fragenliste gibt es erst mit start_duel (dabei merkt sich der Server die Startzeit) bzw. nach dem eigenen Ende.
--   * Ergebnisse der anderen sieht man erst, wenn man selbst fertig ist.
--   * Gewertete Zeit = Serverzeit von start_duel bis finish_duel, höchstens Fragen × Zeitlimit + 30 s.

create table if not exists public.duels (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  creator uuid not null references auth.users on delete cascade,
  label text not null check (char_length(label) between 1 and 60),
  settings jsonb not null default '{}'::jsonb,
  question_ids text[] not null check (cardinality(question_ids) between 1 and 10),
  time_limit int not null check (time_limit in (10, 20, 30)),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days'
);

create table if not exists public.duel_players (
  duel_id uuid not null references public.duels on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  joined_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  answers jsonb,            -- [{ "i": 0, "ok": true, "ms": 4210 }, …] (Zeiten pro Frage nur zur Anzeige)
  correct int,
  aborted boolean not null default false,
  primary key (duel_id, user_id)
);
create index if not exists duel_players_user on public.duel_players (user_id);

alter table public.duels enable row level security;
alter table public.duel_players enable row level security;
revoke all on public.duels, public.duel_players from anon, authenticated;

create or replace function public.new_duel_code() returns text
language plpgsql volatile set search_path = '' as $$
declare alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; c text;
begin
  loop
    c := '';
    for i in 1..6 loop c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1); end loop;
    exit when not exists (select 1 from public.duels d where d.code = c);
  end loop;
  return c;
end;
$$;

-- Spätester gewerteter Endzeitpunkt eines Spielers
create or replace function public.duel_deadline(d public.duels, started timestamptz) returns timestamptz
language sql immutable as $$ select started + make_interval(secs => d.time_limit * cardinality(d.question_ids) + 30) $$;

-- Wer gestartet hat und über der Maximalzeit liegt, ohne abzugeben, wird mit 0 richtig gewertet
create or replace function public.duel_finalize_overdue() returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.duel_players p set finished_at = public.duel_deadline(d, p.started_at), correct = 0, answers = '[]'::jsonb, aborted = true
  from public.duels d
  where d.id = p.duel_id and p.started_at is not null and p.finished_at is null and now() > public.duel_deadline(d, p.started_at);
end;
$$;

create or replace function public.create_duel(p_label text, p_settings jsonb, p_question_ids text[], p_time_limit int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare d public.duels;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  if not exists (select 1 from public.profiles where user_id = auth.uid()) then raise exception 'Bitte zuerst einen Anzeigenamen festlegen'; end if;
  if (select count(*) from public.duels where creator = auth.uid() and created_at > now() - interval '1 day') >= 30 then
    raise exception 'Höchstens 30 neue Duelle pro Tag'; end if;
  if (select count(distinct x) from unnest(p_question_ids) x) <> cardinality(p_question_ids) then raise exception 'Doppelte Fragen'; end if;
  insert into public.duels (code, creator, label, settings, question_ids, time_limit)
    values (public.new_duel_code(), auth.uid(), left(btrim(p_label), 60), coalesce(p_settings, '{}'::jsonb), p_question_ids, p_time_limit)
    returning * into d;
  insert into public.duel_players (duel_id, user_id) values (d.id, auth.uid());
  return jsonb_build_object('id', d.id, 'code', d.code);
end;
$$;

-- Beitreten per Code. Wer schon drin ist (auch der Herausforderer), bekommt nur die ID zurück: kein zweiter Eintrag.
create or replace function public.join_duel(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare d public.duels;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  if not exists (select 1 from public.profiles where user_id = auth.uid()) then raise exception 'Bitte zuerst einen Anzeigenamen festlegen'; end if;
  select * into d from public.duels where code = upper(btrim(p_code)) for update;
  if d.id is null then raise exception 'Duell-Code ungültig'; end if;
  if exists (select 1 from public.duel_players where duel_id = d.id and user_id = auth.uid()) then return d.id; end if;
  if now() > d.expires_at then raise exception 'Dieses Duell ist abgelaufen'; end if;
  if (select count(*) from public.duel_players where duel_id = d.id) >= 10 then raise exception 'Duell ist voll (max. 10 Spieler)'; end if;
  insert into public.duel_players (duel_id, user_id) values (d.id, auth.uid());
  return d.id;
end;
$$;

-- Start: nur einmal möglich. Erst jetzt gibt es die Fragenliste.
create or replace function public.start_duel(p_duel uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare d public.duels; p public.duel_players;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  select * into d from public.duels where id = p_duel;
  select * into p from public.duel_players where duel_id = p_duel and user_id = auth.uid() for update;
  if d.id is null or p.duel_id is null then raise exception 'Duell nicht gefunden'; end if;
  if p.started_at is not null then raise exception 'Du hast dieses Duell schon gestartet'; end if;
  if now() > d.expires_at then raise exception 'Dieses Duell ist abgelaufen'; end if;
  update public.duel_players set started_at = now() where duel_id = p_duel and user_id = auth.uid() returning * into p;
  return jsonb_build_object('question_ids', to_jsonb(d.question_ids), 'time_limit', d.time_limit, 'started_at', p.started_at);
end;
$$;

-- Abgabe: einmalig. Richtige zählen nur für gültige Positionen, jede Position höchstens einmal.
create or replace function public.finish_duel(p_duel uuid, p_answers jsonb, p_aborted boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.duels; p public.duel_players; clean jsonb; n int;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  select * into d from public.duels where id = p_duel;
  select * into p from public.duel_players where duel_id = p_duel and user_id = auth.uid() for update;
  if d.id is null or p.duel_id is null then raise exception 'Duell nicht gefunden'; end if;
  if p.started_at is null then raise exception 'Duell noch nicht gestartet'; end if;
  if p.finished_at is not null then return; end if; -- schon abgegeben (z.B. doppelt gesendet)
  n := cardinality(d.question_ids);
  select coalesce(jsonb_agg(jsonb_build_object('i', i, 'ok', ok, 'ms', least(greatest(ms, 0), d.time_limit * 1000)) order by i), '[]'::jsonb)
    into clean
    from (select distinct on ((e->>'i')::int) (e->>'i')::int as i, coalesce((e->>'ok')::boolean, false) as ok, coalesce((e->>'ms')::int, 0) as ms
          from jsonb_array_elements(case when jsonb_typeof(p_answers) = 'array' then p_answers else '[]'::jsonb end) e
          where (e->>'i') ~ '^[0-9]+$' and (e->>'i')::int < n) a;
  update public.duel_players set
    finished_at = least(now(), public.duel_deadline(d, p.started_at)),
    answers = clean,
    correct = (select count(*) from jsonb_array_elements(clean) e where (e->>'ok')::boolean),
    aborted = coalesce(p_aborted, false)
  where duel_id = p_duel and user_id = auth.uid();
end;
$$;

-- Alle eigenen Duelle mit Mitspielern. Fragenliste nur nach eigenem Start, fremde Ergebnisse nur nach eigenem Ende.
create or replace function public.my_duels() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare res jsonb;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  perform public.duel_finalize_overdue();
  select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb) into res from (
    select jsonb_build_object(
      'id', d.id, 'code', d.code, 'label', d.label, 'settings', d.settings, 'time_limit', d.time_limit,
      'n', cardinality(d.question_ids), 'created_at', d.created_at, 'expires_at', d.expires_at,
      'is_creator', d.creator = auth.uid(),
      'question_ids', case when me.started_at is not null then to_jsonb(d.question_ids) end,
      'players', (select jsonb_agg(jsonb_build_object(
          'user_id', p.user_id,
          'name', coalesce(pr.display_name, 'Unbekannt'),
          'is_me', p.user_id = auth.uid(),
          'is_creator', p.user_id = d.creator,
          'state', case when p.finished_at is not null then 'fertig' when p.started_at is not null then 'spielt' else 'offen' end,
          'correct', case when me.finished_at is not null or p.user_id = auth.uid() then p.correct end,
          'ms', case when (me.finished_at is not null or p.user_id = auth.uid()) and p.finished_at is not null
                     then round(extract(epoch from (p.finished_at - p.started_at)) * 1000)::bigint end,
          'answers', case when me.finished_at is not null or p.user_id = auth.uid() then p.answers end,
          'aborted', case when me.finished_at is not null or p.user_id = auth.uid() then p.aborted end
        ) order by p.joined_at)
        from public.duel_players p left join public.profiles pr on pr.user_id = p.user_id
        where p.duel_id = d.id)
    ) as x
    from public.duels d join public.duel_players me on me.duel_id = d.id and me.user_id = auth.uid()
    where d.created_at > now() - interval '90 days'
  ) t;
  return res;
end;
$$;

revoke all on function public.new_duel_code(), public.duel_finalize_overdue(), public.create_duel(text, jsonb, text[], int), public.join_duel(text),
  public.start_duel(uuid), public.finish_duel(uuid, jsonb, boolean), public.my_duels() from public, anon;
grant execute on function public.create_duel(text, jsonb, text[], int), public.join_duel(text),
  public.start_duel(uuid), public.finish_duel(uuid, jsonb, boolean), public.my_duels() to authenticated;
