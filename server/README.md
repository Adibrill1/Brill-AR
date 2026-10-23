# Brill-AR publish server (per-artwork stable links)

Zero-dependency Node.js (>=18) server that gives each published artwork a stable URL
(`/e/<id>`) that plays the experience, plus a JSON API the editor's "publish" button uses.

## Run locally
    PORT=8787 node server/server.js
Then in the editor, set "כתובת שרת הפרסום" to `http://localhost:8787` and press
"פרסום כקישור קבוע + QR".

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
3. A decision on who can publish (open endpoint now; add a shared secret before real use).
4. Backups of `server/data/`.
