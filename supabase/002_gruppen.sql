-- Kopfnuss: Gruppen & Ranglisten
-- Im Supabase SQL Editor ausführen (nach schema.sql). Kann gefahrlos mehrfach ausgeführt werden.
--
-- Datenschutz-Prinzip:
--   * Fremde sehen NIE die Tabelle progress (Lernstand) und NIE E-Mail-Adressen.
--   * Profile (Anzeigename) und Ranglistenwerte (stats) sieht nur, wer mit der Person in einer Gruppe ist.
--   * Gruppen anlegen/beitreten/verlassen/rauswerfen läuft nur über Funktionen, die Regeln prüfen
--     (max. 50 Mitglieder, nur Admin darf rauswerfen usw.).

-- ---------- Tabellen ----------
create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 30),
  updated_at timestamptz not null default now()
);

create table if not exists public.stats (
  user_id uuid primary key references auth.users (id) on delete cascade,
  week text not null check (week ~ '^\d{4}-W\d{2}$'),        -- ISO-Woche, z.B. 2026-W47 (Europe/Berlin)
  week_xp integer not null default 0 check (week_xp between 0 and 35000),          -- max. 5.000 XP pro Tag
  week_answers integer not null default 0 check (week_answers between 0 and 7000),
  total_xp integer not null default 0 check (total_xp >= 0),
  streak integer not null default 0 check (streak >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  invite_code text not null unique,
  owner_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists group_members_user_idx on public.group_members (user_id);

-- ---------- Hilfsfunktionen ----------
-- Aktuelle ISO-Woche in deutscher Zeit
create or replace function public.current_week() returns text
language sql stable set search_path = '' as $$
  select to_char((now() at time zone 'Europe/Berlin')::date, 'IYYY-"W"IW');
$$;

-- Bin ich mit dieser Person in mindestens einer Gruppe? (security definer, damit die Policy keine Rekursion auslöst)
create or replace function public.is_groupmate(other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.group_members a
    join public.group_members b on a.group_id = b.group_id
    where a.user_id = auth.uid() and b.user_id = other
  );
$$;

create or replace function public.is_member(g uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.group_members where group_id = g and user_id = auth.uid());
$$;

-- Einladungscode: 6 Zeichen ohne verwechselbare Zeichen (0/O, 1/I/L)
create or replace function public.new_invite_code() returns text
language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code text;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.groups where invite_code = code);
  end loop;
  return code;
end;
$$;

-- ---------- Plausibilitätsprüfung der Ranglistenwerte ----------
-- Die Punkte entstehen auf dem Gerät, deshalb wird hier nur Unmögliches abgelehnt.
create or replace function public.check_stats() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  account_days integer;
begin
  select greatest(1, (now()::date - created_at::date) + 1) into account_days from auth.users where id = new.user_id;
  -- Serie kann nicht länger sein als das Konto alt ist (+ lokaler Vorlauf vor dem Anlegen des Kontos, max. 2 Jahre)
  if new.streak > account_days + 730 then
    raise exception 'Serie unplausibel';
  end if;
  -- Wochen-XP höchstens 5.000 pro bisher vergangenem Wochentag
  if new.week = public.current_week()
     and new.week_xp > 5000 * extract(isodow from (now() at time zone 'Europe/Berlin'))::int then
    raise exception 'Wochen-XP unplausibel';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists stats_check on public.stats;
create trigger stats_check before insert or update on public.stats for each row execute function public.check_stats();

-- ---------- Rechte & Row Level Security ----------
alter table public.profiles enable row level security;
alter table public.stats enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;

revoke all on public.profiles, public.stats, public.groups, public.group_members from anon;
revoke all on public.profiles, public.stats, public.groups, public.group_members from authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update on public.stats to authenticated;
grant select on public.groups to authenticated;                   -- anlegen nur per Funktion
grant update (name) on public.groups to authenticated;            -- Admin darf nur umbenennen
grant select on public.group_members to authenticated;           -- beitreten/verlassen nur per Funktion

drop policy if exists "profil lesen" on public.profiles;
drop policy if exists "profil anlegen" on public.profiles;
drop policy if exists "profil ändern" on public.profiles;
create policy "profil lesen" on public.profiles for select using (user_id = auth.uid() or public.is_groupmate(user_id));
create policy "profil anlegen" on public.profiles for insert with check (user_id = auth.uid());
create policy "profil ändern" on public.profiles for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "stats lesen" on public.stats;
drop policy if exists "stats anlegen" on public.stats;
drop policy if exists "stats ändern" on public.stats;
create policy "stats lesen" on public.stats for select using (user_id = auth.uid() or public.is_groupmate(user_id));
create policy "stats anlegen" on public.stats for insert with check (user_id = auth.uid());
create policy "stats ändern" on public.stats for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "gruppe lesen" on public.groups;
drop policy if exists "gruppe umbenennen" on public.groups;
create policy "gruppe lesen" on public.groups for select using (public.is_member(id));
create policy "gruppe umbenennen" on public.groups for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "mitglieder lesen" on public.group_members;
create policy "mitglieder lesen" on public.group_members for select using (public.is_member(group_id));

-- ---------- Funktionen für die App ----------
create or replace function public.create_group(p_name text) returns public.groups
language plpgsql security definer set search_path = '' as $$
declare g public.groups;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  if not exists (select 1 from public.profiles where user_id = auth.uid()) then raise exception 'Bitte zuerst einen Anzeigenamen festlegen'; end if;
  if (select count(*) from public.groups where owner_id = auth.uid()) >= 20 then raise exception 'Du kannst höchstens 20 Gruppen anlegen'; end if;
  insert into public.groups (name, invite_code, owner_id) values (btrim(p_name), public.new_invite_code(), auth.uid()) returning * into g;
  insert into public.group_members (group_id, user_id) values (g.id, auth.uid());
  return g;
end;
$$;

create or replace function public.join_group(p_code text) returns public.groups
language plpgsql security definer set search_path = '' as $$
declare g public.groups;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  if not exists (select 1 from public.profiles where user_id = auth.uid()) then raise exception 'Bitte zuerst einen Anzeigenamen festlegen'; end if;
  select * into g from public.groups where invite_code = upper(btrim(p_code)) for update;
  if g.id is null then raise exception 'Code ungültig'; end if;
  if exists (select 1 from public.group_members where group_id = g.id and user_id = auth.uid()) then return g; end if;
  if (select count(*) from public.group_members where group_id = g.id) >= 50 then raise exception 'Gruppe ist voll (max. 50)'; end if;
  insert into public.group_members (group_id, user_id) values (g.id, auth.uid());
  return g;
end;
$$;

-- Austreten. Verlässt der Admin die Gruppe, wird das am längsten dabei seiende Mitglied Admin; ist niemand mehr da, wird die Gruppe gelöscht.
create or replace function public.leave_group(p_group uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare next_owner uuid;
begin
  delete from public.group_members where group_id = p_group and user_id = auth.uid();
  if exists (select 1 from public.groups where id = p_group and owner_id = auth.uid()) then
    select user_id into next_owner from public.group_members where group_id = p_group order by joined_at limit 1;
    if next_owner is null then delete from public.groups where id = p_group;
    else update public.groups set owner_id = next_owner where id = p_group; end if;
  end if;
end;
$$;

create or replace function public.remove_member(p_group uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.groups where id = p_group and owner_id = auth.uid()) then raise exception 'Nur der Admin darf Mitglieder entfernen'; end if;
  if p_user = auth.uid() then raise exception 'Zum Verlassen bitte „Gruppe verlassen“ nutzen'; end if;
  delete from public.group_members where group_id = p_group and user_id = p_user;
end;
$$;

create or replace function public.renew_invite_code(p_group uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare code text;
begin
  if not exists (select 1 from public.groups where id = p_group and owner_id = auth.uid()) then raise exception 'Nur der Admin darf den Code erneuern'; end if;
  code := public.new_invite_code();
  update public.groups set invite_code = code where id = p_group;
  return code;
end;
$$;

create or replace function public.delete_group(p_group uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.groups where id = p_group and owner_id = auth.uid()) then raise exception 'Nur der Admin darf die Gruppe löschen'; end if;
  delete from public.groups where id = p_group;
end;
$$;

-- Rangliste einer Gruppe. Wochenwerte aus einer vergangenen Woche zählen als 0.
create or replace function public.group_leaderboard(p_group uuid)
returns table (user_id uuid, display_name text, week_xp integer, week_answers integer, total_xp integer, streak integer, is_me boolean, is_owner boolean, updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select m.user_id,
         coalesce(p.display_name, 'Unbenannt'),
         case when s.week = public.current_week() then s.week_xp else 0 end,
         case when s.week = public.current_week() then s.week_answers else 0 end,
         coalesce(s.total_xp, 0),
         coalesce(s.streak, 0),
         m.user_id = auth.uid(),
         m.user_id = g.owner_id,
         s.updated_at
  from public.group_members m
  join public.groups g on g.id = m.group_id
  left join public.profiles p on p.user_id = m.user_id
  left join public.stats s on s.user_id = m.user_id
  where m.group_id = p_group and public.is_member(p_group);
$$;

revoke all on function public.create_group(text), public.join_group(text), public.leave_group(uuid), public.remove_member(uuid, uuid),
  public.renew_invite_code(uuid), public.delete_group(uuid), public.group_leaderboard(uuid), public.is_groupmate(uuid), public.is_member(uuid),
  public.new_invite_code(), public.current_week(), public.check_stats() from public, anon;
grant execute on function public.create_group(text), public.join_group(text), public.leave_group(uuid), public.remove_member(uuid, uuid),
  public.renew_invite_code(uuid), public.delete_group(uuid), public.group_leaderboard(uuid), public.is_groupmate(uuid), public.is_member(uuid),
  public.current_week() to authenticated;
