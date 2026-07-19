-- Migration 006: allow overwriting storage files (required for editing creations —
-- an edit re-uploads to the same paths, which is an UPDATE on storage.objects).
-- Paste into the Supabase SQL Editor and Run. Safe to re-run.

do $$ begin
  create policy "pilot_assets_update" on storage.objects
    for update
    using (bucket_id = 'trigger-assets')
    with check (bucket_id = 'trigger-assets');
  exception when duplicate_object then null; end $$;

select 'migration 006 done' as result;
