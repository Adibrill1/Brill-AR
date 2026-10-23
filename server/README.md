# Brill-AR publish server (per-artwork stable links)

Zero-dependency Node.js (>=18) server that gives each published artwork a stable URL
(`/e/<id>`) that plays the experience, plus a JSON API the editor's "publish" button uses.

## Run locally
    PUBLISH_TOKEN=$(openssl rand -hex 24) PORT=8787 node server/server.js
Then in the editor set "כתובת שרת הפרסום" to `http://localhost:8787`, paste the token into
"סיסמת פרסום", and press "פרסום כקישור קבוע + QR".

## Security
- Publishing and deleting require `Authorization: Bearer $PUBLISH_TOKEN` (timing-safe compare).
  With no PUBLISH_TOKEN set the server REFUSES all publishes (fail closed, 503).
- Viewing is public: /e/<id> links are meant to be shared.
- Validation: strict element-type allowlist, numeric field checks, tap links must be https,
  assets must be known media data-URLs (png/jpeg/webp/gif/mp4/mp3/wav/m4a/glb), 15MB per asset,
  40MB per upload, 60 elements max, 500 experiences max, 30 publishes/IP/hour.
- Stored JSON is served with X-Content-Type-Options: nosniff; the player page embeds only the
  server-generated id, never user content.

## API
- `POST /api/experiences` - body: studio export JSON. Returns `{id, url}`.
- `GET /api/experiences/<id>` - the stored export JSON.
- `GET /e/<id>` - the player page wired to load that experience.
- `GET /<file>` - static files from `studio/`.

## Storage
JSON files under `server/data/`. No database.

## What production needs (not done - needs owner's decision + small cost)
1. An always-on host: a small VPS (~$5/mo) or a free-tier worker/serverless equivalent.
2. An HTTPS domain pointed at it (buyers open these links on their phones).
3. Set a strong PUBLISH_TOKEN (auth is implemented; the owner chooses and guards the secret).
4. Backups of `server/data/`.

## Optional MOV conversion (round O)
`POST /api/convert/mov` requires the same bearer token and rate limit as publishing. Body is raw MOV bytes, not a URL. Requires `ffmpeg` and `ffprobe` binaries (current patched versions) on the host. No binaries downloaded or executed from the upload.

20MB input/output, 120s duration, 4096px input sides, max 1920px output, 30fps, H264 yuv420p + AAC stereo. Metadata/chapters stripped, transparency/HDR fidelity not preserved. Temp files cleaned on success/failure. One concurrent conversion per process; child commands time out after90s. External MOV references disabled and network protocols not allowed. Root output-size guard rejects truncated output duration. This is a lossy conversion, not original-format preservation. Editor shows exact destination and fidelity limits before upload; cancel sends nothing. No configured server/token means clear guidance to export MP4 instead.

Test: `node tests/mov-convert.cjs`. This route is locally tested, not deployed by static Surge hosting. Production should run media parsers in a low-privilege isolated process/container with CPU/memory limits and patched ffmpeg. It does not publish the converted clip or retain the upload.
