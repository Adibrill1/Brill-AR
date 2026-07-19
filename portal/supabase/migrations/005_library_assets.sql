-- Migration 005: community-contributed shared library (3D elements + 2D stickers).
-- Paste into the Supabase SQL Editor and Run. Safe to re-run.

create table if not exists public.library_assets (
  id uuid primary key,
  artist_id uuid references public.artists(id),
  name text not null,
  kind text not null check (kind in ('3d','sticker')),
  path text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);

alter table public.library_assets enable row level security;

do $$ begin
  create policy "pilot_lib_select" on public.library_assets for select using (true);
  exception when duplicate_object then null; end $$;
do $$ begin
  create policy "pilot_lib_insert" on public.library_assets for insert with check (true);
  exception when duplicate_object then null; end $$;
do $$ begin
  create policy "pilot_lib_update" on public.library_assets for update using (true);
  exception when duplicate_object then null; end $$;

select 'migration 005 done' as result;
