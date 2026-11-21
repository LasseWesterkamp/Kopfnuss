-- Kopfnuss: Gruppenmitglieder direkt herausfordern + Revanche (nach 004_duelle.sql ausführen, mehrfach ausführbar)
--
-- * create_duel nimmt jetzt eine Liste von Eingeladenen. Erlaubt sind Gruppenmitglieder
--   und, bei einer Revanche, alle Mitspieler des Ursprungsduells.
-- * Pro Duell gibt es höchstens eine Revanche: drückt der Gegner zuerst, bekommt man dessen Revanche zurück.
-- * invite_to_duel holt Gruppenmitglieder in ein laufendes Duell.

alter table public.duels add column if not exists rematch_of uuid references public.duels on delete set null;
create unique index if not exists duels_one_rematch on public.duels (rematch_of) where rematch_of is not null;

drop function if exists public.create_duel(text, jsonb, text[], int);
create or replace function public.create_duel(p_label text, p_settings jsonb, p_question_ids text[], p_time_limit int,
  p_invite uuid[] default '{}', p_rematch_of uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare d public.duels; u uuid; existing public.duels;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  if not exists (select 1 from public.profiles where user_id = auth.uid()) then raise exception 'Bitte zuerst einen Anzeigenamen festlegen'; end if;
  if p_rematch_of is not null then
    if not exists (select 1 from public.duel_players where duel_id = p_rematch_of and user_id = auth.uid()) then raise exception 'Duell nicht gefunden'; end if;
    perform 1 from public.duels where id = p_rematch_of for update; -- gleichzeitige Revanche-Klicks nacheinander
    select * into existing from public.duels where rematch_of = p_rematch_of;
    if existing.id is not null then
      insert into public.duel_players (duel_id, user_id) values (existing.id, auth.uid()) on conflict do nothing;
      return jsonb_build_object('id', existing.id, 'code', existing.code, 'existing', true);
    end if;
  end if;
  if (select count(*) from public.duels where creator = auth.uid() and created_at > now() - interval '1 day') >= 30 then
    raise exception 'Höchstens 30 neue Duelle pro Tag'; end if;
  if (select count(distinct x) from unnest(p_question_ids) x) <> cardinality(p_question_ids) then raise exception 'Doppelte Fragen'; end if;
  if (select count(distinct x) from unnest(coalesce(p_invite, '{}')) x where x <> auth.uid()) > 9 then raise exception 'Höchstens 10 Spieler pro Duell'; end if;
  foreach u in array coalesce(p_invite, '{}') loop
    if u <> auth.uid() and not public.is_groupmate(u)
       and not (p_rematch_of is not null and exists (select 1 from public.duel_players where duel_id = p_rematch_of and user_id = u)) then
      raise exception 'Direkt herausfordern geht nur innerhalb deiner Gruppen';
    end if;
  end loop;
  insert into public.duels (code, creator, label, settings, question_ids, time_limit, rematch_of)
    values (public.new_duel_code(), auth.uid(), left(btrim(p_label), 60), coalesce(p_settings, '{}'::jsonb), p_question_ids, p_time_limit, p_rematch_of)
    returning * into d;
  insert into public.duel_players (duel_id, user_id) values (d.id, auth.uid());
  insert into public.duel_players (duel_id, user_id)
    select distinct d.id, x from unnest(coalesce(p_invite, '{}')) x where x <> auth.uid()
    on conflict do nothing;
  return jsonb_build_object('id', d.id, 'code', d.code, 'existing', false);
end;
$$;

-- Gruppenmitglieder in ein bestehendes Duell holen
create or replace function public.invite_to_duel(p_duel uuid, p_users uuid[]) returns int
language plpgsql security definer set search_path = '' as $$
declare d public.duels; u uuid; added int := 0;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  select * into d from public.duels where id = p_duel for update;
  if d.id is null or not exists (select 1 from public.duel_players where duel_id = p_duel and user_id = auth.uid()) then raise exception 'Duell nicht gefunden'; end if;
  if now() > d.expires_at then raise exception 'Dieses Duell ist abgelaufen'; end if;
  foreach u in array coalesce(p_users, '{}') loop
    if not public.is_groupmate(u) then raise exception 'Direkt herausfordern geht nur innerhalb deiner Gruppen'; end if;
    if exists (select 1 from public.duel_players where duel_id = p_duel and user_id = u) then continue; end if;
    if (select count(*) from public.duel_players where duel_id = p_duel) >= 10 then raise exception 'Duell ist voll (max. 10 Spieler)'; end if;
    insert into public.duel_players (duel_id, user_id) values (p_duel, u);
    added := added + 1;
  end loop;
  return added;
end;
$$;

-- Alle Mitglieder meiner Gruppen (ohne mich), für die Auswahl beim Herausfordern
create or replace function public.my_groupmates() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('user_id', x.user_id, 'name', x.name) order by lower(x.name)), '[]'::jsonb) from (
    select distinct b.user_id, coalesce(pr.display_name, 'Unbekannt') as name
    from public.group_members a
    join public.group_members b on a.group_id = b.group_id and b.user_id <> a.user_id
    left join public.profiles pr on pr.user_id = b.user_id
    where a.user_id = auth.uid()
  ) x;
$$;

-- my_duels wie in 004, zusätzlich: Revanche (falls es eine gibt, in der ich bin)
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
      'rematch_of', d.rematch_of,
      'rematch_id', (select r.id from public.duels r where r.rematch_of = d.id),
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

revoke all on function public.create_duel(text, jsonb, text[], int, uuid[], uuid), public.invite_to_duel(uuid, uuid[]), public.my_groupmates() from public, anon;
grant execute on function public.create_duel(text, jsonb, text[], int, uuid[], uuid), public.invite_to_duel(uuid, uuid[]), public.my_groupmates(), public.my_duels() to authenticated;
