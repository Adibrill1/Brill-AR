# Round BB - data-safety repairs (review-driven)
- Delete no longer resurrects: delExperience waits for the save queue, deletes, tombstones the id for 15s.
- Add guards match import limits (60 layers, 20MB per entry, 60MB total); publish blocked above ~29MB media (40MB JSON cap).
- Sliders debounce 600ms, flushed on change: 30 ticks = 2 undo steps.
- IDB onabort on both write paths; navigator.storage.persist() requested; send-ZIP default on.
- Hebrew import error messages for layer/size limits.
Caveats: headless only. Existing over-limit scenes are not retroactively fixed. Share-sheet ordering, iOS memory and persist/eviction are unmeasured on a phone. Dormant server paths not changed.
Test: tests/browser/data-safety.cjs

## Follow-up (same round)
- Tombstone is now for the page session (no 15s expiry); tested 60s-late save, pending slider timer + delete, reload.
- One drag = one undo step regardless of duration (first save records history, later saves in the gesture are noHistory); flush on release, project switch, pagehide/hidden. Tested 5 ticks 750ms apart.
- Publish check uses exact serialized bytes (exportJSONSize, equals exportJSON bytes) vs 40MB; the send-to-publish path no longer refuses, it sends and warns.
- Export of over-limit scenes warns and still writes everything (never truncates). Existing over-limit scenes: unresolved, cannot re-import in this version.
- Limits counting = exported assets (layer assets, particle sprites, artwork); orphans excluded. Added 121-file guard. Fixed: exactly-20MiB entry (padding case) was rejected by JSON import; ZIP total counted experience.json against 60MB (now assets only, metadata capped 4MB).
- player.js errors use textContent; /e/ load failure caught.
- storage.persist result recorded in window.__storagePersisted only; UI makes no persistence promise.

## Follow-up 2
- Multi-tab delete: a record this tab loaded/saved that later vanishes from IDB is treated as deleted elsewhere; the save is refused (no resurrection, no sticky error). Two-page test, same origin. Not covered: a tab that never loaded the record (can't resurrect it either).
- Share: first tap that loses Safari activation (NotAllowedError) keeps the built file; the next tap calls navigator.share synchronously. Verified with a stub only; real iOS behavior unverified.
- Recovery import: explicit button, confirm dialog, always imports a COPY, caps 300 layers / 60MB per file / 300MB total / 400 files; normal limits restored after. Tested 80-layer ZIP and JSON. Memory on a phone unmeasured; prefer a computer.
- send-ZIP default is ZIP; publish-send tests updated to cover default ZIP and unchecked JSON.
