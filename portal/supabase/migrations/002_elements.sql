-- Migration 002: multi-element support + trigger image dimensions.
-- Paste into the Supabase SQL Editor and Run. Safe to re-run.

alter table public.trigger_images add column if not exists elements jsonb not null default '[]'::jsonb;
alter table public.trigger_images add column if not exists image_w integer;
alter table public.trigger_images add column if not exists image_h integer;

-- legacy single-content columns become optional (new rows use `elements`)
alter table public.trigger_images alter column content_kind drop not null;
alter table public.trigger_images alter column content_path drop not null;

select 'migration 002 done' as result;
