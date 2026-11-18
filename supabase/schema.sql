-- Kopfnuss: Tabelle für den Lernfortschritt (eine Zeile pro Nutzer).
-- Im Supabase-Dashboard unter "SQL Editor" einfügen und ausführen.
create table if not exists public.progress (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.progress enable row level security;

-- Neuere Supabase-Projekte vergeben keine Tabellenrechte mehr automatisch.
-- Nur angemeldete Nutzer bekommen Zugriff; welche Zeile, regeln die Policies unten.
revoke all on public.progress from anon;
revoke all on public.progress from authenticated;
grant select, insert, update on public.progress to authenticated;

-- Jeder darf nur seine eigene Zeile lesen und schreiben.
drop policy if exists "eigener Fortschritt lesen" on public.progress;
drop policy if exists "eigener Fortschritt anlegen" on public.progress;
drop policy if exists "eigener Fortschritt ändern" on public.progress;
create policy "eigener Fortschritt lesen" on public.progress for select using (auth.uid() = user_id);
create policy "eigener Fortschritt anlegen" on public.progress for insert with check (auth.uid() = user_id);
create policy "eigener Fortschritt ändern" on public.progress for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
