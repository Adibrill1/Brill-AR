# Round Y: accumulated group composition checkpoint

## Exact curves and editor round-trip
Replaced X's resampling with affine output-map composition. Sparse per-axis curves retain their original times/easing, and the map transforms sampled output. Includes group's own authored keys. All5 easing modes tested at201times for child and group curves; new key entry inverses world XY into curve coordinates. Map survives save/export/import plus authenticated publish/update/readback in whole-schema regression. Missing child widths stay missing instead of becoming NaN during group scale.

Actual creator numeric rotation90/width2x/X/depth edits, persisted children/map and new group-key UI tested. Depth controls now exposed for groups. UI screenshot inspected: group selected and numeric fields readable. Canvas drag uses same helper but a new pointer-event regression remains open.

## Group opacity
Opacity now traverses descendant meshes, multiplies base material opacity by each unique entity ancestor's own opacity and preserves child opacity. Group.5 × child.5=.25; group.8 × child.5=.4. Actual renderer captured over black shows red channel102, matching.4×255; inspected image shows dim red A and brighter blue B. Async object/model events reapply. Transparent ordering across overlapping 3D models remains a separate device/rendering check.

## Group media
Visibility monitor includes visual ancestors and nonspatial-sound parent group. State/track gates apply together. Actual browser WAV plays, pauses on group state mismatch, stays paused on child mismatch, resumes correct combined state, pauses/resumes with parent visibility, and pauses stopped parent track. Autoplay retries and pointer-start skip blocked nodes. Waveform/audio output/capture mix and real phone autoplay still need device tests; WAV proof is actual HTMLMediaElement clock/play/pause, not hearing a speaker.

## Validation
Nine browser fixtures green: group-key-bake, group-transform, group-timeline, group-composition, group-editor, camera-group, camera-editor, timeline-visibility, schema-roundtrip. Earlier importer and video/device limits remain unchanged. No zero-gap or phone-camera claim.
