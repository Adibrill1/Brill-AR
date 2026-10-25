# Round BB - data-safety repairs (review-driven)
- Delete no longer resurrects: delExperience waits for the save queue, deletes, tombstones the id for 15s.
- Add guards match import limits (60 layers, 20MB per entry, 60MB total); publish blocked above ~29MB media (40MB JSON cap).
- Sliders debounce 600ms, flushed on change: 30 ticks = 2 undo steps.
- IDB onabort on both write paths; navigator.storage.persist() requested; send-ZIP default on.
- Hebrew import error messages for layer/size limits.
Caveats: headless only. Existing over-limit scenes are not retroactively fixed. Share-sheet ordering, iOS memory and persist/eviction are unmeasured on a phone. Dormant server paths not changed.
Test: tests/browser/data-safety.cjs
