-- Peace & Technology — Supabase schema (pilot)
-- Paste this whole file into the Supabase SQL Editor and press Run.
-- Safe to re-run: everything is IF NOT EXISTS / ON CONFLICT.

create table if not exists public.artists (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  country text default '',
  bio text default '',
  created_at timestamptz not null default now()
);

create table if not exists public.trigger_images (
  id uuid primary key,
  artist_id uuid references public.artists(id),
  title text not null,
  description text default '',
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reason text default '',
  quality jsonb,
  content_kind text not null check (content_kind in ('video','model')),
  content_name text default '',
  image_path text not null,
  mind_path text not null,
  content_path text not null,
  audio_path text,
  scan_count integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.artists enable row level security;
alter table public.trigger_images enable row level security;

-- PILOT POLICIES: open access with the publishable (anon) key.
-- To be replaced with per-user policies when artist login is added.
do $$ begin
  create policy "pilot_artists_select" on public.artists for select using (true);
  exception when duplicate_object then null; end $$;
do $$ begin
  create policy "pilot_artists_insert" on public.artists for insert with check (true);
  exception when duplicate_object then null; end $$;
do $$ begin
  create policy "pilot_artists_update" on public.artists for update using (true);
  exception when duplicate_object then null; end $$;

do $$ begin
  create policy "pilot_triggers_select" on public.trigger_images for select using (true);
  exception when duplicate_object then null; end $$;
do $$ begin
  create policy "pilot_triggers_insert" on public.trigger_images for insert with check (true);
  exception when duplicate_object then null; end $$;
do $$ begin
  create policy "pilot_triggers_update" on public.trigger_images for update using (true);
  exception when duplicate_object then null; end $$;
do $$ begin
  create policy "pilot_triggers_delete" on public.trigger_images for delete using (true);
  exception when duplicate_object then null; end $$;

-- public storage bucket for trigger images, .mind targets, AR content and soundtracks
insert into storage.buckets (id, name, public)
  values ('trigger-assets', 'trigger-assets', true)
  on conflict (id) do nothing;

do $$ begin
  create policy "pilot_assets_read" on storage.objects
    for select using (bucket_id = 'trigger-assets');
  exception when duplicate_object then null; end $$;
do $$ begin
  create policy "pilot_assets_insert" on storage.objects
    for insert with check (bucket_id = 'trigger-assets');
  exception when duplicate_object then null; end $$;
do $$ begin
  create policy "pilot_assets_delete" on storage.objects
    for delete using (bucket_id = 'trigger-assets');
  exception when duplicate_object then null; end $$;

select 'schema ready' as result;
