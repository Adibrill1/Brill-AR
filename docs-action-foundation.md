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

## Particle lifetime authoring
Added particle lifetime (0 preserves old wrap behavior), box/disc/spherical-volume spawn shapes, end color, end-size ratio and gradual birth/death alpha. Positive lifetime respawns with bounded buffers; color/size/alpha come from each particle's age in the actual THREE.Points shader. UI preserves export/import and client/server schema bounds. Placement edit modes freeze particle motion. Browser test checks UI roundtrip, age/respawn, color/size/alpha buffers, actual WebGL shader and fully transparent rendered birth, plus inspected purple midlife pixels. This is our design; no Artivive equivalence claim. Curves/gradient stops beyond linear endpoints, editable velocity spread and advanced emission bursts remain gaps.

## Spatial-audio authoring and preview routing
Composition editor shows selected positional-sound inner cyan and outer magenta wire spheres, with exact radius fields and explicit save/reset. Distances use scene units; linear attenuation reaches zero outside the outer radius, exponential does not. Shared WebAudio routing now powers camera-free preview as well as AR, with real PositionalAudio/MediaElementSource/panner/gain/camera listener instead of plain preview audio. Browser test verifies saved radius state, actual sphere geometry and actual WebAudio graph. This is not audible output or real-phone proof. Sound carriers are edited numerically, not by raycasting the decorative sphere.

## Creator scenario checks
Added two end-to-end runtime scenarios with original fixture assets (not vendor assets). Piano: imported/exported two keys each trigger scale, moving note and real WAV media action; concurrent clocks, independent end/reset and five repeated taps leave exactly two audio nodes and no stuck clocks/media. This measures actual media playback clocks, not audible device output. Branch story: opening changes interaction, first tap starts one branch, switches a real model from clip0 to clip1 at an authored boundary, next tap starts the competing branch and stops/releases the previous branch. These fixtures assemble the scenario via schema then execute real runtime taps. They do not yet prove a person can author the entire scenario through the UI without help. Placement editor also has a foldable panel to reveal the whole canvas. Audio source volume is applied once by the media element; WebAudio gain remains1 to avoid unintended squared volume.

## Return-path and invalid-edit safety
Preview and local AR backlinks carry the originating experience id, and editor boot honors that id, so saving placement then returning does not select an unrelated first record. UI layer retargeting rolls back invalid media/model layer types instead of leaving unsaved invalid state in memory. Still missing: action-channel3Dtilt animation and a tilt-projected2Dcanvas representation.

## Independent crop textures and GIF evidence
Each cropped plane now owns a cloned geometry rather than modifying A-Frame's shared cached plane geometry. Duplicate left/right crops remain independent. GPU crop UVs inset half a source pixel to prevent linear-filter bleed at the cut edge, including animated GIF. New generated two-frame GIF fixture verifies actual GPU center pixels alternate red/green from the left half, never right-half blue; edge bleed found in first visual inspection was fixed and re-inspected.46browserfixtures total.

## UI-authored piano and timed clip controls
A new browser acceptance workflow starts a blank experience, uploads artwork, creates two keys and sound assets, creates/times actions, duplicates a sequence, retargets copied actions, wires layer tap actions and opens preview using UI controls only. Both real audio clocks play and stop correctly. Test reads inspect results, never mutate schema to create the piano. Timed model actions now read actual GLB clip names and accessor max-time metadata, show known clip lengths and offer Fit action duration to clip divided by speed; missing duration remains explicitly unknown. Duplicate action after its end supports authored wait-vs-interrupt chains without manual start-time math. No phone/audible output or vendor-parity claim.

## Video crop
The same non-destructive source rectangle now supports video, with canvas, plain video plane, nested chroma-key shader mesh and the shared AR entity path. Original bytes remain embedded and unchanged. New browser UI fixture uploads a generated red/blue H264 sample, crops half, verifies roundtrip byte identity, actual decoded video texture dimensions and crop UVs for both plain and chroma routes. Actual preview pixels show only red. Existing demo video may show the unsupported-codec notice independently of the new decoded sample; no actual iPhone camera/AR video-crop proof.

## Timeline destination in the composition editor
Move actions can open their destination in the camera-free3Dcomposition editor, not only the2Dcanvas. Position/depth edits change a working copy; explicit save writes only action target XYZ, never layer base placement. Reset restores the last saved target, backlink returns to the same experience. Unrelated size/rotation controls are hidden and selected layer is locked in this mode. UI browser test covers timeline button→3DXYZedit→unsaved readback→explicit save/base invariance→reset→editor readback. Not phone/ARproof; rotations/scales remain exact action fields, not3Dtarget manipulation yet.

## Viewport contrast
Placement/target editor offers gray/dark/white work backdrops, separate from artwork or text color. Background is view-only and not saved/exported into the experience. White text outside artwork can be inspected on dark background without silently changing the creator's colors. UI test changes backdrop and still verifies only action target changed, base layer remains unchanged.
