# Core experience operation ordering

Base: reconstructed AS-AY commit093b741 (not original AY history).

Four failures reproduced against093b741 using real file input with350ms model validation delay:
- Import then New put the model on the new record instead of the originating record.
- Import then Delete attached the model to the fallback demo (3 elements became4).
- Import then Export produced an incomplete snapshot (0 rather than1 element).
- One failed selection read poisoned the queue, so later selection never ran.

Fix: shared recoverable experience-operation queue for selection, asset/library imports,
New, confirmed Delete, export, artwork processing and whole-experience JSON import.
New/delete/import/selection clear stale selection, scrub and state-clock context.
Hydration clears artwork before loading a record without artwork.

New browser regression proves the four failures on the old commit and passes on the fix.
All35 browser fixtures pass together. Empty-New full UI screenshot inspected: no stale
artwork/canvas/element controls appear, and the next step is artwork upload.

Bounded scope: does not claim every panel edit, async particle-sprite import, publish
snapshot or navigation action is serialized. Broad arbitrary-edit concurrency remains
open. Artwork/wholeJSON ordering use the shared path but lack dedicated delayed tests.
No device or production backend claim.
