-- Migration 003: perceptual hash for duplicate trigger-image detection.
-- Paste into the Supabase SQL Editor and Run. Safe to re-run.

alter table public.trigger_images add column if not exists image_hash text;

select 'migration 003 done' as result;
