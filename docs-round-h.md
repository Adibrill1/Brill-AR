# Round H design contract: groups, sequence chaining, per-state loop, preview notifications

Source: Artivive research (/tmp/artivive.txt) + PARITY.md remaining partial/not-built rows.
Goal: close the last buildable code gaps. Verified in cloud per feature before reporting.

## 1. Layer groups (Artivive: group layers, animate whole groups)
Data: new element `type: "group"` with `el.children = [elementIds]`; no asset.
- Editor: multi-select (checkboxes in the element list) + "קבץ" button creates a group element;
  ungroup button on a selected group. List shows group with indented children.
- Transform: moving/scaling/rotating the group applies a delta to every child's stored x/y/rot/w/h.
  z-order: the group occupies the position of its topmost child; children move with it.
- Animation/timeline on the group: buildElementEntity for a group builds an empty a-entity wrapper;
  children are appended INSIDE the wrapper (positions relative to group origin = group x/y).
  Timeline/anim presets target the wrapper; children inherit. Opacity multiplies through.
- Factory change: buildElementEntity(rec, el) for a group looks up child elements by id and
  builds them with toTargetSpace offsets relative to the group's x/y instead of absolute.
- Editor canvas: children drawn at group-offset positions; selecting the group shows one box.
- Sequences: group's seq assignment applies to the wrapper (children keep own assignments inside).
- Export/import: children stay normal elements; group references by id. Server validation: group
  children must be ids of existing elements, no cycles (a group cannot contain a group - v1 rule).

## 2. Sequence chaining (Artivive "Manage Sequence": play/stop another sequence from the timeline)
Data: per-state timeline events on the state itself, not on elements:
  `sequence.autoNext = { at: <seconds>, to: <seqId|null> }` (null = stop/return to first state).
- Runtime: when a state with autoNext is active, a timer from state entry (or from target-found
  in the player) switches to `to` at `at` seconds. Switching state cancels the pending timer.
- Editor: per-state row in the sequence tab bar area: "אחרי X שניות עבור למצב [select]".
- Preview notifications: on any state switch (tap or chained), a small toast
  "מצב: <name>" bottom-center, 1.2s fade - mirrors Artivive's preview notifications.

## 3. Per-state loop
`sequence.loop = true|false` (default false = stay on last frame as now).
- When a state's autoNext is absent and loop is true, its timelines keep looping (existing behavior
  of tl.loop). The per-state setting governs whether a state's timelines REPLAY when their
  duration ends: implement in the driver: on timeline end, if state.loop, reset() and replay.
- Editor: loop checkbox per state tab.

## 4. Change Interaction over time - DEFERRED
Artivive changes a layer's tap behavior mid-sequence. Our equivalent: timeline keyframes already
capture opacity; tap behavior change is a niche on top. Document as the one remaining known gap
after 1-3, with a proposed model (keyframe field `tap` on the element timeline) if she asks.

## Verification plan (cloud, staging rc12+)
- Groups: build group of 2 elements via UI, drag group -> both children move (canvas pixel sample),
  timeline on group moves both in preview (object3D positions), ungroup restores.
- Chaining: state with autoNext at 0.5s -> preview auto-switches states (dots change) and toast shows.
- Per-state loop: driver replays timeline on end only when state.loop.
- Notifications: toast element appears on tap-switch and auto-switch.
- Roundtrip: export/import preserves group membership, autoNext, loop.
