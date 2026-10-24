# Action editor foundation, rc54

Original implementation based on the approved research workflow, not vendor code.

New `actionSequences` alongside unchanged scenes, keyframes and tracks. No implicit migration. A sequence has independent duration, loop/reset/autostart and a list of actions with stable id, target layer, start/duration, per-action easing and target values. Move/rotate/scale/opacity/show/hide/interaction actions. Multiple sequences can target the same layer. Editor bars can move by drag; exact timing and target fields remain editable. Sequence duplication creates fresh action identities. Layer/sequence deletion cleans affected references.

Our explicit behavior choices (not verified Artivive semantics): actions in a sequence interpolate from the value at their start from earlier-starting actions in that sequence; same-property overlap selects latest end, equal end selects later list entry. Latest-started sequence wins only properties it writes. Repeated start restarts, no stacking. Loop wraps. Reset releases influence; without reset final values hold until Stop. Stop releases. Legacy keyframes/presets are preserved but disabled for action-owned layers. Scrub previews one sequence at a fixed time, without advancing. No promise to preserve legacy animation through implicit conversion.

Shared pure evaluator, canvas/group composition, 3D and AR driver. AR clock pauses before target-found and while target-lost. Camera editing does not run action overrides. Public publishing server validates and preserves new schema; server still not deployed.

Tests:14engine cases; action editor responsiveness/export-import/3D engine checks; server publish-readback and atomic rejection;36existing browser fixtures. Synthetic/local browser proof only, not phone/camera/sound proof.

Remaining: timed media/model clip actions, duplicate layer/crop/undo, full integrated3Dmanipulation, particle lifetimes/curves/shapes, audio spheres, whole creator acceptance scenarios and real-device checks. Not Artivive parity.

## Timed media/model follow-up
Added timed model clip selection/speed/loop with the sequence-owned sampled clock, and timed video/sound playback with file offset and duration. Seek is silent; tracking pause holds clocks/media. Clip action duration is explicit, not inferred from a clip: waiting vs interruption is authored by action placement. Preview shows active sequence clocks and per-sequence play/stop controls. Browser tests verify real glTF mesh pose/clip clock, fake audio element timing/gating (not real sound), UI create/edit/duplicate/delete references, and full-player synthetic found/lost pause.39browserfixtures including36legacy cases passed after these changes.

## Sequence management
Action type sequence starts/stops another sequence at the authored time. Scrubbing does not execute commands. Runtime uses bounded event processing; imported/start-action cyclic graphs are rejected with a visible validation error instead of unbounded chaining. This is our safety/design choice.16pure-engine tests include event start/stop and silent scrub.

## Layer copies and bounded undo
Layer/group duplication uses fresh layer and action ids, copies dependent actions and retains shared media assets. Deleting one copy does not delete media used by another. Per-experience undo/redo keeps20snapshots while this editor session is open, with serialized snapshot saves and redo invalidated on a new edit. UI create/edit/duplicate/undo/redo/reference-deletion test passed3consecutive runs, and all39browserfixtures passed. Undo history is not durable across reloads and does not restore deleted entire experiences. No claim of vendor-equivalent undo semantics.

## Timeline authoring ergonomics
Action duration can also be changed by dragging the bar's end handle. Exact duration fields remain. Move action target can be chosen by clicking the artwork; the layer base is unchanged, and Escape cancels. A target marker is shown while choosing. Engine tests17; browser suite39. These are independently designed controls, not proof of vendor behavior.

## Sparse-frame correctness
Timed sequence commands are processed in authored chronological order with original timestamps, not list order or render-arrival time. Child clocks retain the elapsed time when frames are sparse; previous-loop events are not dropped. Bounded512-command batches preserve pending commands rather than discard them. Pause shifts authored command deadlines.20engine tests cover these boundaries. Undo includes same-key/same-size media-only replacements by comparing bytes as well as metadata.

## Non-destructive image crop
Image layers support a normalized source rectangle, including animated GIF image textures, in the editor canvas and shared AR/3Dentity factory. Original embedded media bytes are retained. Crop changes aspect and height while keeping layer width/position, can be independently adjusted on duplicate layers, restored to full source and undone. UI uses exact left/top/width/height percentages. Video crop is not yet implemented. New browser fixture checks original byte equality, export/import region, invalid-region rejection, canvas red/blue source selection, actual3Dplane UVs, full-source restore and mobile overflow. Server publish/readback rejects invalid bounds.40browserfixtures total. Not a phone camera proof.

## Composition-aware 3D placement editor
New local camera-free editing route keeps the whole composition visible, with a live orange selection box, layer selector, numeric placement/depth/width/plane rotation and horizontal/vertical tilt. Pointer drag on the selected mesh works in the artwork plane after orbiting; a toggle separates object dragging from camera orbit. Optional selected-only view. Legacy/keyframe/track/action/model animation and playback triggers are disabled in this edit mode. Explicit Save commits locally; Reset restores the last saved placement. Existing selected-only AR camera editor behavior stays unchanged. Saved rotX/rotY tilt is preserved in import/publish/render but has no action-channel animation yet. Browser fixture verifies route, whole-composition visibility, frozen action clock, no implicit save, Save/Reset, tilt, orbit-vs-drag and actual raycast movement. Actual phone camera remains untested.
