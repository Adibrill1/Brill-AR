# Artist Portal — Peace & Technology

Responsive RTL portal for artists to upload **trigger images** (any detectable printed
artwork — card, sticker, poster) with AR content (video in any browser-playable format,
or GLB/GLTF models) and an optional soundtrack, plus an admin moderation panel and a
live AR test page.

## Pages

- `index.html` — artist portal: profile, upload with instant recognition-quality scoring,
  submit for moderation, my-items list
- `admin.html` — moderation: approve / reject (with reason), inline previews
- `test.html?id=<uuid>` — live AR view of one trigger image (also the artist preview)

## Backend modes

`js/store.js` picks the backend at load time:

- **Local demo** (default when no key configured): IndexedDB in the current browser only.
- **Supabase** (shared): rows in Postgres, files in the public `trigger-assets` bucket.

To go live:

1. Run `supabase/schema.sql` in the Supabase SQL Editor (idempotent — safe to re-run).
2. Put the project's **publishable/anon key** in `js/config.js` (`supabaseAnonKey`).

Pilot security note: the schema ships with open RLS policies (anyone with the key can
read/write). Fine for an unlisted pilot; replace with per-user policies when artist
login (Supabase Auth) is added — the policies are named `pilot_*` to make them easy
to find and drop.

## Test

```bash
node tools/e2e_portal_test.js <repoRoot> <assetsDir> <outDir>
```

Drives the whole flow headlessly with a fake camera: weak image blocked by the quality
gate, good image passes, webm video + wav soundtrack validated, submit, admin approve,
AR view detects the trigger and plays the video. Requires `flat.png`, `marker_hd.png`,
`testvideo.webm` in `<assetsDir>` (see `spike/tools/make_assets.py` for generation
patterns) and Playwright with the preinstalled Chromium.
