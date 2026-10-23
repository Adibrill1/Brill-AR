# Round AE: embedded model playback controls

Creator model panel adds zero-based clip index, speed.1..4, play/pause and repeat toggle. Runtime model-clips selects/clamps index, resets action, applies repeat/one-shot, scales mixer delta, retains ancestor-hidden/tracking freeze. Static models unchanged. Index is numeric, not imported named-clip list; this is a usable first control, not final catalog UX.

Actual UI at390px edits clip1/speed2/pause and persists/export-imports. Screenshot inspected: labels/fields fit. Complete schema publish/update regression includes all4fields. Runtime loads original animated GLB, verifies mixer delta.2 at2x, pause unchanged, then adds a cloned second clip to the loaded animation array and verifies index1, .5xdelta.05, one-shot config and tracking freeze. This is component-selection proof with synthetic second clip, NOT real authored multi-clip/skeletal/morph fidelity or new rendered animation proof. Prior first-clip red translation rendering remains the visual evidence.

Batch after AD:2local commits beyond mergedPR5, no fresh access/PR request yet.
