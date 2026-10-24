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
