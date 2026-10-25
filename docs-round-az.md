# Round AZ — explicit wait/cut for timed model clips

## What changed
Artivive's Play Animation offers an explicit choice: wait for the previous
animation to finish, or cut it. Until now Brill-AR expressed that only
indirectly via the next action's start time. Model actions now carry
`to.mode`: `'cut'` (default, unchanged behavior - the new clip starts at the
action's start) or `'wait'` (the switch is deferred until the previous clip on
the same layer finishes naturally).

Engine (studio/actions.js, sampleSequence):
- A wait action becomes eligible at max(its start, previous natural end).
- Natural end: a looping previous clip runs until its action's own end; a
  non-looping clip ends at its real duration divided by its speed, capped by
  the action's span. Real durations come from `el.clipDurations`, captured at
  upload and when clip panels open (Studio.modelClipInfo); without recorded
  durations the previous action's span is the fallback.
- The finished action's channel end is capped at the wait action's deferred
  start, so its longer authored span cannot keep a finished clip frozen on
  screen and starve the waiting action under end-precedence.
- Same-sequence only; cross-sequence precedence is unchanged
  (latest-started-wins on changed values).
- Validation accepts `mode` only as 'cut'/'wait'; absent means 'cut'
  (backward compatible with existing experiences and exports).

Editor:
- Model action details gain "אם האנימציה הקודמת עדיין מתנגנת:" with קטיעה
  מיידית / המתנה לסיום הקודמת. Hint text explains the semantics.
- editor.js captures clipDurations at model upload and refreshes them when the
  model panel opens; action-editor refreshes them when the action details open.

## Verification
- tests/actions.test.js: 29/29 (7 new: wait defers to real clip end, cut
  default immediate, wait after loop defers to action end, no-durations
  fallback, wait-first, chained waits, wait supersedes longer authored span,
  mode validation).
- tests/browser/model-clip-wait.cjs NEW: real engine + startActionDriver apply
  path on the multiclip fixture (two 2s clips) - t=1.5 previous clip still
  playing at 1.5s despite the wait action's start at 1s; t=2.5 new clip at
  0.5s (took over at the real 2s end); t=3.75 a cut action at 3.5 interrupts
  immediately (clip clock 0.25s).
- tests/browser/action-model-waitcut-ui.cjs NEW: 390px editor proof - upload
  captures clipDurations [2,2] from the multiclip fixture, the mode selector
  defaults to cut, selecting wait persists to.mode='wait', returning to cut
  removes the key from the export; no horizontal overflow; panel screenshot
  action-model-waitcut-390.png inspected.
- Regression: model-clip-switch, model-multiclip, action-model-authoring,
  action-model-media, action-editor-workflow, creator-branch, creator-piano,
  player-action-gate all pass.

## Still open
- Headless verification only; not exercised on a physical phone.
- Wait eligibility is same-sequence; a wait action does not observe clips
  started by other sequences (cross-sequence latest-started-wins unchanged).
- The runtime apply path is sampled; a tracked phone session with long clips
  is the real-world check.
