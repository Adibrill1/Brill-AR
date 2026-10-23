# Round X: creator group edits keep existing child keyframes

Group transform now transforms child keyed XY/depth/rotation as well as base geometry. Rotation couples axes, so original curve is sampled at key boundaries before transforming; times, ease, loop, visibility and interaction metadata stay intact. Numeric/slider group X/Y/width/rotation/depth and canvas move/scale all route through the same helper. Removed ad hoc child-only transform branches.

Found and fixed sparse-channel sampler bug: an unrelated Show/Hide key between two X keys previously reset X to base. Numeric interpolation now finds neighboring keys for each property independently. New7-time sparse linear curve fixture proves transformed XY/Z/rotation and retained discrete hide/tap; save/export/import reconstructed base scene still passes. Simultaneous animated parent/child fixture verifies the expected composed world position/rotation.

Bounds: affine bake is tested for linear curves. Resampling sparse axes at every boundary under nonlinear easing can change curve shape, so nonlinear sparse bake fidelity remains open. Group's own authored timeline when base is edited remains a separate gap. Group opacity inheritance/media playback needs independent regression. No phone-camera proof, broad animation parity or zero-gap claim.

Checks: group-key-bake, group-transform, group-timeline (actual rendered Show/Hide pixels plus parent/child composition), camera-editor, camera-group, timeline-visibility and complete-schema roundtrip all pass. Rendered images are the unchanged Round W fixture; no new screenshot claimed for creator input routes.
