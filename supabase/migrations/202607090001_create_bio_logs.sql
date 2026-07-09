create table if not exists public.bio_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null default '',
  substance_type text not null check (substance_type in ('caffeine', 'sugar', 'sodium', 'other')),
  amount_mg numeric not null check (amount_mg >= 0),
  timestamp timestamptz not null default now(),
  note text,
  created_at timestamptz not null default now()
);

alter table public.bio_logs enable row level security;

create policy "bio_logs_select_own"
  on public.bio_logs
  for select
  using (auth.uid() = user_id);

create policy "bio_logs_insert_own"
  on public.bio_logs
  for insert
  with check (auth.uid() = user_id);

create policy "bio_logs_update_own"
  on public.bio_logs
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "bio_logs_delete_own"
  on public.bio_logs
  for delete
  using (auth.uid() = user_id);
