# Round AY — clip-switch residue probe

## What changed
Verification round, no runtime code change. New original fixture `tests/fixtures/rotclip.glb`
(generator `tests/make-rotclip-glb.py`): clip0 animates translation AND a 90-degree z
rotation; clip1 animates only translation. Probes whether selecting a new clip leaves
residue on channels the old clip drove but the new one does not.

## Verification (tests/browser/model-clip-switch.cjs)
Actual GLTFLoader/AnimationMixer through the model-clips component's selectClip path
(the same path the creator's clip dropdown uses):
- clip0@t=0: base pose, identity rotation.
- clip0@t=1: translated +0.5x, quaternion z rotated 90deg (0.7071) - rendered triangle
  visibly points left (model-clipswitch-1.png inspected).
- clip1@t=0 after the switch: translation is clip1's own first key [0,-0.25,0], NOT
  clip0's end pose; rotation returns to exact identity - no residue on the undriven
  rotation channel. stopAllAction + fresh action cleans up correctly.
- clip1@t=1: rises +0.5y, rotation still identity.

## Still open
True crossfade blending between clips (not implemented; remains a compatibility gap), switches
mid-play on a live (unpaused) mixer on device, and residue behavior with skinned+
morphed combinations.
