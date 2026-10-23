# Round S: complete-schema integration regression

New browser fixture covers7element types, group membership, states+chaining, parallel tracks, timeline keys/easing/duration/tap, chroma/spatial options, custom particle sprite, all asset bytes. Verifies equality across save/load, export/import, publish/re-publish/readback, plus stable URL and updated name. Synthetic media bytes mean storage/schema proof, not playback. Runs against local authenticated server in clean sandbox Chrome. Command: NODE_PATH=<playwright-core node_modules> node tests/browser/schema-roundtrip.cjs.

Further gaps found and fixed:
1. Export included assetId but omitted particles.spriteAssetId, so custom particle sprite was silently lost. Now dependency exported and byte-equality test catches it.
2. /e/id served play.html with relative script URLs resolved as /e/shared.js and appended remote id after player started. Added root base and marker in head before player scripts. Test proves expected bootstrap order and static dependency paths. Actual deployed buyer flow still pending host and device QA.

Live-camera editing feasibility: existing player has image tracking, target-space element wrappers and shared schema; edit mode can expose explicit element selection, transform controls and local save while camera remains active. No platform impossibility shown. It requires hit testing/pointer isolation from capture/tap behavior, ownership mode gated by local experience rather than public buyer mode, transform persistence and real device camera QA. It remains product scope, not excluded. No automatic public editing or new asset upload is introduced by this round.
