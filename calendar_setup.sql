-- Frankie Calendar setup foundation
-- Run this once in Supabase SQL Editor before using Calendar Setup.

create table if not exists public.calendar_preferences (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  setup_complete boolean not null default false,
  holiday_region text not null default 'US',
  holiday_packs text[] not null default '{}',
  default_event_duration_minutes integer not null default 60,
  default_recurrence_end text not null default 'never',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.calendar_color_rules (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  google_color_id text not null,
  label text not null default '',
  keywords text[] not null default '{}',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, google_color_id)
);

alter table public.calendar_preferences enable row level security;
alter table public.calendar_color_rules enable row level security;

drop policy if exists "calendar_preferences_select_own"
  on public.calendar_preferences;
create policy "calendar_preferences_select_own"
  on public.calendar_preferences
  for select
  using (auth.uid() = owner_id);

drop policy if exists "calendar_preferences_insert_own"
  on public.calendar_preferences;
create policy "calendar_preferences_insert_own"
  on public.calendar_preferences
  for insert
  with check (auth.uid() = owner_id);

drop policy if exists "calendar_preferences_update_own"
  on public.calendar_preferences;
create policy "calendar_preferences_update_own"
  on public.calendar_preferences
  for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "calendar_color_rules_select_own"
  on public.calendar_color_rules;
create policy "calendar_color_rules_select_own"
  on public.calendar_color_rules
  for select
  using (auth.uid() = owner_id);

drop policy if exists "calendar_color_rules_insert_own"
  on public.calendar_color_rules;
create policy "calendar_color_rules_insert_own"
  on public.calendar_color_rules
  for insert
  with check (auth.uid() = owner_id);

drop policy if exists "calendar_color_rules_update_own"
  on public.calendar_color_rules;
create policy "calendar_color_rules_update_own"
  on public.calendar_color_rules
  for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "calendar_color_rules_delete_own"
  on public.calendar_color_rules;
create policy "calendar_color_rules_delete_own"
  on public.calendar_color_rules
  for delete
  using (auth.uid() = owner_id);

create index if not exists calendar_color_rules_owner_idx
  on public.calendar_color_rules(owner_id);