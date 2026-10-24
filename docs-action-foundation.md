# Action editor foundation, rc54

Original implementation based on the approved research workflow, not vendor code.

New `actionSequences` alongside unchanged scenes, keyframes and tracks. No implicit migration. A sequence has independent duration, loop/reset/autostart and a list of actions with stable id, target layer, start/duration, per-action easing and target values. Move/rotate/scale/opacity/show/hide/interaction actions. Multiple sequences can target the same layer. Editor bars can move by drag; exact timing and target fields remain editable. Sequence duplication creates fresh action identities. Layer/sequence deletion cleans affected references.

Our explicit behavior choices (not verified Artivive semantics): actions in a sequence interpolate from the value at their start from earlier-starting actions in that sequence; same-property overlap selects latest end, equal end selects later list entry. Latest-started sequence wins only properties it writes. Repeated start restarts, no stacking. Loop wraps. Reset releases influence; without reset final values hold until Stop. Stop releases. Legacy keyframes/presets are preserved but disabled for action-owned layers. Scrub previews one sequence at a fixed time, without advancing. No promise to preserve legacy animation through implicit conversion.

Shared pure evaluator, canvas/group composition, 3D and AR driver. AR clock pauses before target-found and while target-lost. Camera editing does not run action overrides. Public publishing server validates and preserves new schema; server still not deployed.

Tests:14engine cases; action editor responsiveness/export-import/3D engine checks; server publish-readback and atomic rejection;36existing browser fixtures. Synthetic/local browser proof only, not phone/camera/sound proof.

Remaining: timed media/model clip actions, duplicate layer/crop/undo, full integrated3Dmanipulation, particle lifetimes/curves/shapes, audio spheres, whole creator acceptance scenarios and real-device checks. Not Artivive parity.
