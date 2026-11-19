-- Kopfnuss: „Frage melden“ mit automatischer E-Mail
-- Im Supabase SQL Editor ausführen (nach schema.sql und 002_gruppen.sql). Kann mehrfach ausgeführt werden.
--
-- Ablauf: App speichert Meldung in public.meldungen -> Trigger schickt per pg_net eine Mail über Resend.
-- API-Key und Empfängeradresse liegen verschlüsselt im Supabase Vault (siehe README „Meldungen per E-Mail“),
-- nie im Code.

create extension if not exists pg_net with schema extensions;

create table if not exists public.meldungen (
  id bigint generated always as identity primary key,
  question_id text not null check (char_length(question_id) between 1 and 100),
  frage text not null check (char_length(frage) <= 500),
  nachricht text not null check (char_length(btrim(nachricht)) between 3 and 1000),
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  mail_gesendet boolean not null default false,
  erledigt boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists meldungen_created_idx on public.meldungen (created_at desc);

alter table public.meldungen enable row level security;
revoke all on public.meldungen from anon, authenticated;
-- Melden darf jede:r (auch ohne Konto). Lesen kann niemand über die App, nur du im Supabase-Dashboard.
grant insert (question_id, frage, nachricht) on public.meldungen to anon, authenticated;
drop policy if exists "melden" on public.meldungen;
create policy "melden" on public.meldungen for insert to anon, authenticated with check (true);

-- ---------- Mail verschicken ----------
create or replace function public.meldung_mail() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  api_key text;
  empfaenger text;
  heute integer;
  doppelt boolean;
  html text;
begin
  -- Spamschutz: max. 30 Mails pro Tag, und pro Frage max. eine Mail pro Stunde
  select count(*) into heute from public.meldungen where mail_gesendet and created_at > now() - interval '1 day';
  select exists (select 1 from public.meldungen where question_id = new.question_id and mail_gesendet and id <> new.id
                 and created_at > now() - interval '1 hour') into doppelt;
  if heute >= 30 or doppelt then return new; end if;

  select decrypted_secret into api_key from vault.decrypted_secrets where name = 'resend_api_key';
  select decrypted_secret into empfaenger from vault.decrypted_secrets where name = 'meldung_empfaenger';
  if api_key is null or empfaenger is null then return new; end if; -- noch nicht eingerichtet: Meldung bleibt gespeichert

  html := '<h2>Neue Meldung in Kopfnuss</h2>'
       || '<p><b>Frage:</b> ' || replace(replace(new.frage, '<', '&lt;'), '>', '&gt;') || '</p>'
       || '<p><b>ID:</b> <code>' || replace(replace(new.question_id, '<', '&lt;'), '>', '&gt;') || '</code></p>'
       || '<p><b>Meldung:</b><br>' || replace(replace(replace(new.nachricht, '<', '&lt;'), '>', '&gt;'), E'\n', '<br>') || '</p>'
       || '<p style="color:#888">Alle Meldungen: Supabase → Table Editor → meldungen</p>';

  perform net.http_post(
    url := 'https://api.resend.com/emails',
    headers := jsonb_build_object('Authorization', 'Bearer ' || api_key, 'Content-Type', 'application/json'),
    body := jsonb_build_object(
      'from', 'Kopfnuss <onboarding@resend.dev>',
      'to', jsonb_build_array(empfaenger),
      'subject', 'Kopfnuss: Frage gemeldet (' || left(new.question_id, 60) || ')',
      'html', html
    )
  );
  update public.meldungen set mail_gesendet = true where id = new.id;
  return new;
end;
$$;

drop trigger if exists meldung_mail on public.meldungen;
create trigger meldung_mail after insert on public.meldungen for each row execute function public.meldung_mail();
revoke all on function public.meldung_mail() from public, anon, authenticated;
