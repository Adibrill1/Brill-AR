# Round AV — transparent layer ordering, rendered proof

## What changed
Verification round, no code change. The "complex transparent ordering" caveat is now
bounded by a rendered test for the flat-layer case.

## Verification (tests/browser/transparent-order.cjs)
Real WebGL scene (swiftshader), actual buildElementEntity output, center-row pixel reads:
- Front-nearer (z 0.05 over 0): the front PNG's transparent left hole shows the blue
  layer behind [0,0,255]; its opaque right half renders red [255,0,0].
- Front-behind (z -0.05): the red layer is fully occluded by the opaque blue layer on
  both halves ([0,0,255] left and right): z-order drives visibility, not DOM order.
- Half opacity (0.5): the overlap blends to [128,0,128] exactly; the hole still shows
  the layer behind.
Three scene screenshots inspected (av-0/1/2).

## Still open
Ordering among THREE.Points particle emitters and chroma-keyed video shaders under
orbiting camera angles (three.js sorts transparent objects by camera distance; the
fixture is a fixed head-on camera). Model-in-front-of-image transparency and device
rendering unverified.
