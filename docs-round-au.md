# Round AU — canvas autoNext chain + rendered loop wrap

## What changed
The 2D editor canvas preview now simulates the sequence autoNext chain while playing
live, mirroring the previewer/player `makeSeqRunner` behavior:
- At `autoNext.at` seconds into the active state, the preview advances to `autoNext.to`
  (or the first state when `to` is unset), restarts the state clock, and updates the
  state-tab UI (`curSeq`, `canvasStart`, selected tab).
- Manual parallel-track clocks (`canvasTracks`) are independent and keep running across
  the switch, matching `trackRunner` behavior in the previewer.
- Scrubbing (`tlScrubT != null`) suspends the chain, as before for live clocks.
- `needsAnim` now also holds while the active state has an autoNext configured, so the
  chain advances even in a state with no animated elements.

Previously creators could only see autoNext behavior in the 3D preview page; the 2D
canvas silently stayed on the first state.

## Verification (tests/browser/state-autonext-canvas.cjs)
Rendered-pixel proof in headless Chrome, actual editor UI:
- State First red element visible (x centroid 198.9), blue state-2 element absent.
- autoNext {at:1.5, to:Second} fires on the live canvas: selected tab becomes "Second",
  blue visible (centroid 404.1), red gone.
- Manual track green element keeps advancing across the switch
  (centroids 147.7 -> 184.3 before, 252.1 -> 286.9 after): independent clock continuity.
- Looping state with a one-shot 0.8s timeline wraps on the live canvas: magenta centroid
  rises to peak 462.2 then drops back past peak-40.
- Three canvas screenshots inspected (au-0-before, au-1-after-switch, au-2-loop-wrap).
- Full suite: all 31 browser fixtures + node conversion/server regressions pass together.

## Still open (unchanged)
autoNext with tap-interaction timing on a real phone, interaction between autoNext and
user tap-switches mid-count, and 2D-vs-3D projection equivalence. No device claim.
Round AW extended the fixture to a two-hop chain (First->Second->Loop): the canvas
follows both hops with tab assertions; longer chains share the same mechanism.
