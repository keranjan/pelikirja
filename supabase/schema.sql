-- Pelikirjan pilvitallennus: yksi rivi käyttäjää kohden.
-- Aja tämä Supabase-projektin SQL-editorissa kerran.

create table if not exists public.pelikirja (
  user_id    uuid primary key references auth.users on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  rev        bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.pelikirja enable row level security;

-- Jokainen näkee ja muokkaa vain omaa riviään.
drop policy if exists "pelikirja_select_own" on public.pelikirja;
create policy "pelikirja_select_own" on public.pelikirja
  for select using (auth.uid() = user_id);

drop policy if exists "pelikirja_insert_own" on public.pelikirja;
create policy "pelikirja_insert_own" on public.pelikirja
  for insert with check (auth.uid() = user_id);

drop policy if exists "pelikirja_update_own" on public.pelikirja;
create policy "pelikirja_update_own" on public.pelikirja
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "pelikirja_delete_own" on public.pelikirja;
create policy "pelikirja_delete_own" on public.pelikirja
  for delete using (auth.uid() = user_id);
