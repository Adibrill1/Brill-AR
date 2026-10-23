# Round V: group base-transform correctness

Shared transformGroup bakes creator translation/scale/rotation/depth into child artwork-space coordinates. Rotation accounts for artwork aspect. Factory inverses group base rotation into child-local position/rotation, so wrapper rotation does not apply twice. Editor rotation and camera panel use the helper. Camera panel rebuilds selected entity after edit instead of temporary scale-only changes, so saved width matches reconstructed geometry. Group selection enabled, but camera UI group save/undo still needs its own test.

Synthetic fixture90deg rotation,2x scale,translation: child world positions and net rotations match artwork-space expectations after save→export→import and scene reconstruction. Complete schema and single-element camera panel regression pass. No rendered group screenshot or phone-camera proof completed in this round. Independent child keyframes under rotated parents remain open; group camera device handling and drag remain open.

This fixes a real base-transform mismatch rather than asserting all grouping behavior from wrapper existence. Existing historical group claims should be read with this current caveat.
