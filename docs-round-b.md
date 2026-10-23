# Round B design — Timeline + Sequences (implementation contract)

## Sequences (multi-state artwork, tap to switch)
Data model:
- rec.sequences = [{ id, name }] (default: one "ראשי" state; empty array = single state, back-compat)
- Per element: el.seq = null (shows in every state) or a sequence id (shows only in that state)
- New tap action: onTap: "sequence" → advance to next state (cycles), plays a subtle fade
Runtime (shared.js):
- Studio.applySequence(rig/target, rec, seqId): toggles entity visibility by el.seq; sound elements
  whose seq is hidden get paused, visible ones resume (if already started by user gesture)
- Studio.nextSequence(rec, currentId): returns following id (cycle)
Editor:
- Sequence tabs above the canvas (click to switch the state being edited, + button adds a state,
  long-press/rename later); element panel gets a "state" dropdown (כל המצבים / specific)
- Canvas + preview show the currently edited state
Preview/player: tapping an element with onTap sequence advances; a small state indicator (dots)
shows position when more than one state exists.

## Timeline (keyframed motion)
Data model per element: el.timeline = { loop: bool, keys: [{ t: seconds, x?, y?, z?, rot?, opacity?, scale? }] }
- t=0 at target-found (player) / preview start
- Missing props hold their last value; before the first key they hold the element's base props
Runtime: a-frame component `tl-player` in shared.js: samples keys each frame with linear
interpolation, writes position/rotation/scale/opacity (opacity via applyOpacity path)
Editor (minimal viable): per element, "תנועה מתוזמנת" section — add keyframe (captures current
panel values at chosen t), list keys with delete, loop toggle. No curve editor, no drag-on-timeline.
Export/import: both models are plain JSON on the record - existing export carries them automatically.
Verification: preview page (cloud) drives both without a camera; assert entity position/visibility
over time via execute-js sampling; screenshots at t=0/mid.
