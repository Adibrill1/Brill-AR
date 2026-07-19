-- Migration 004: atomic scan counter for the visitor experience.
-- Paste into the Supabase SQL Editor and Run. Safe to re-run.

create or replace function public.increment_scan(trigger_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.trigger_images
     set scan_count = scan_count + 1
   where id = trigger_id;
$$;

grant execute on function public.increment_scan(uuid) to anon, authenticated;

select 'migration 004 done' as result;
