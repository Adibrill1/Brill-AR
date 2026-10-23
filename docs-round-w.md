# Round W: rotated parent + child timeline, rendered Show/Hide, camera group persistence

Child timeline driver previously used an additive position offset and absolute rotation. Under a rotated parent this made child authored-world trajectories rotate a second time. Factory now retains its base frame and driver transforms sampled artwork positions into that local frame, subtracting base parent rotation. Parent timeline motion still composes on top. Spin/float preset local baselines use the same frame.

New deterministic browser fixture runs the actual timeline driver at0/1.1/2.1 seconds in a90deg parent. Child world X moves from-.15 to+.15 with zero world Y drift. Rendered A is visible-left, hidden, then visible-right rotated90deg, with blue B unchanged. Red pixel counts assert visible/zero/visible. Sequence mismatch and stopped-track gates independently assert hidden; correct sequence/playing track restores it. Images manually inspected, contact sheet attached to parent. This is software Chrome scene rendering, not camera or phone proof.

Separate camera-group fixture rotates90deg, scales2x, explicitly saves, then alters translation/rotation and resets. Saved child geometry and reconstructed world position/width match after reset; lost-tracking disables save. Existing six browser fixtures pass together.

Remaining group semantics: changing a group's creator base transform when its children ALREADY have authored absolute-world keyframes does not yet rewrite those keyframes, so edits may jump to old key coordinates on playback. This is separate from runtime parent-frame correction. Parent plus child simultaneously animated and group opacity/media need further composition regressions. No zero-gap claim.
