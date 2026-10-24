# Round AX — multi-joint skinning with inverse bind matrices

## What changed
Verification round, no runtime code change. New original fixture `tests/fixtures/multijoint.glb`
(generator `tests/make-multijoint-glb.py`): two triangles sharing one skin with two joints
in a hierarchy (joint1 child of joint0, bind translation (0,0.2,0)), explicit
inverseBindMatrices, red triangle fully weighted to joint1, blue split 0.5/0.5.
The clip translates joint1 +0.3x over 1s.

## Verification (tests/browser/model-multijoint.cjs)
Actual GLTFLoader/AnimationMixer/render at clip times 0 and 1 (paused, mixer-driven):
- Red (full joint1 weight) centroid moves +35.8px.
- Blue (0.5/0.5 split) moves +17.8px: measured ratio 2.01, the exact 2:1 prediction of
  the linear-blend skinning equation for these weights.
- Motion is horizontal (Y stable within 3px).
Both frames inspected (model-multijoint-0/1.png). This also caught and fixed a fixture
authoring error (first build paired the weight to the wrong JOINTS_0 slot; red stayed
static, proving the test detects non-deformation).

## Still open
Crossfade/blending between clips (the model-clips component plays a single action;
switching stops the previous), more than two joints, rotation/scale channels on joints,
skinned meshes combined with morph targets, and device performance. Not full complex-rig
parity.
