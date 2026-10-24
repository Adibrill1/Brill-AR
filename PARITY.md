# Brill-AR Studio — Artivive parity map

Scope note: compiled from Artivive's public documentation (artivive.com resources / discover
pages, fetched 2026-10-23). Artivive's editor was never used hands-on — the list is
documented capabilities, not an exhaustive audit. Statuses reflect what is in this repo
and how it was verified, not marketing claims.

Current-table statuses take precedence over historical round notes below. Historical notes retain earlier limitations for provenance, not the present feature set.

Legend:
- ✅ device  — exists, verified on a real phone
- ✅ cloud   — exists, verified in a cloud browser (recognition/audio/capture need a device)
- 🆕 round-A — built in the editor-depth round, cloud-verified, device check pending
- 🔜 planned — designed, not built yet
- ⛔ limit   — platform/access limit we cannot close from a mobile web page
- 🖥️ server  — needs a backend we don't run yet

| Artivive capability (documented) | Brill-AR Studio | Status |
|---|---|---|
| Image target recognition (upload photo, detect in camera) | 8th Wall engine, per-experience target | ✅ device |
| Trackability feedback on target (0-5 stars in Artivive) | Resolution + gradient-energy heuristic, plain Hebrew hint (non-blocking) | 🆕 round-D (binary-ish hint, not a 5-star scale; thresholds calibrated, not Artivive's algorithm) |
| Multiple layers per artwork (video/image/sound) | Multiple elements, drag + sliders + numeric panel, element list (local UI has no count cap, publish server caps at60) | ✅ device/cloud |
| Layer types: video, image, audio, 3D (glTF/GLB), text, particles | All six built | 🆕 rounds A/C |
| File types: jpg/png/gif images; mp4/mov/gif video; glTF/GLB (+zip, .obj/.fbx) models | jpg/png/webp images + animated non-interlaced GIF image layers; mp4/webm video; mpeg/mp4/wav/m4a/ogg audio; single-file .glb models, plus model ZIP: one .glb, or one .gltf with relative buffer/image dependencies embedded into a self-contained GLB at import, with bounded decompression (20MB entry cap, 100-entry cap, no nested-zip recursion, in-memory only) - browser-verified (uploaded ZIP lands in IDB with glTF magic; bad ZIPs get clear Hebrew errors) | ⚠️ partial: ZIP glTF + external .bin/PNG texture is now browser-verified (real file-input import, stored GLB, 3-vertex mesh, 2px texture, red triangle in actual rendered scene). Core glTF document/materials/meshes preserved, external URIs in extensions rejected rather than fetched; unsupported runtime extensions and complex animated archives remain unverified. MOV conversion is implemented as an optional authenticated ffmpeg server route plus explicit fidelity/upload consent; local integration QA converts ProRes+PCM MOV to H264+AAC MP4 and verifies decoded pixels/duration. Not operational on static staging: needs a configured backend with ffmpeg/ffprobe. FBX static conversion is now experimental via local worker AssimpJS (20MB source/result,30s timeout,256MB WASM heap cap); original triangle positions/normals/purple diffuse material verified in GLB and actual rendered preview. Skin/animation and external texture URIs rejected after conversion, unknown importer losses remain possible; complex/embedded-texture/binary FBX fidelity and phone tests remain open. Not full FBX parity. GIF animation is built and cloud pixel-verified in the camera-free 3D preview (red/blue frames); interlaced GIFs use a tested frozen first-frame fallback with Hebrew notice, not animation parity. AR-on-device GIF testing remains open. .obj IS supported via editor-side transcode to GLB - PARTIAL FIDELITY: geometry only, materials/textures/UVs/normals are LOST on conversion; the editor detects mtllib/usemtl/vt/vn and shows a styled in-page warning before converting, recommending native glb export instead (cloud-verified both branches: cancel aborts with no import, accept imports geometry-only; plain cube.obj imports with no dialog). Zip extraction bounds: per-entry 20MB, 100 entries, 60MB total uncompressed, no nested-zip recursion; one model only, duplicate canonical names and unsafe/missing/network paths rejected, final self-contained GLB capped at 20MB. Bare .gltf with external files still needs ZIP packaging or native GLB export |
| Transform layers (handles + numeric panel) | Drag + sliders + numeric x/y/w/rot/depth panel | 🆕 round-A |
| 2D and 3D editor views | 2D canvas editor + separate 3D preview page (orbit/zoom) | 🆕 round-A |
| Layer order control | z-order up/down buttons | 🆕 round-A |
| Opacity per layer | Per-element opacity 0-1 | 🆕 round-A |
| Text layer | Content, size, color, bold | 🆕 round-A |
| Animation presets | none / spin / float / pulse | 🆕 round-A |
| Timeline: Move/Rotate/Scale/Transform actions | Keyframes capture x/y/z/rot/opacity/scale per element | 🆕 round-B |
| Timeline: Speed Curve (linear/ease/elastic) | Per-element easing: linear / easeIn / easeOut / easeInOut / elastic (overshoot verified: f=0.5 -> 1.0156) | 🆕 round-G |
| Timeline: explicit Duration (loop length independent of last key) | Optional duration field; default = last key time | 🆕 round-G |
| Timeline: Show/Hide action at set times | Explicit Hebrew Show/Hide buttons add discrete visibility keys, list labels/ruler markers, canvas sampler + runtime visibility channel composed with state visibility | ⚠️ rounds U/W/Y/Z: actual UI keys, discrete sampler, rendered red-pixel Show/Hide/Show under rotated parent, combined state/track gates, actual WAV pause/resume under timeline verified. Phone still pending. |
| Timeline: animate groups of layers | Layer groups: multi-select + group/ungroup in the editor, group transforms (move/scale/rotate) apply to all children, wrapper entity in the player/previewer so timelines and animation presets run on the whole group; sequence visibility and opacity propagate into groups; publish-server validates group integrity | ✅ round H |
| Sequences: states/chapters per artwork | States with per-element assignment, state tabs, dots | 🆕 round-B |
| Sequences: On Tap -> Trigger a chosen sequence | Tap action per element: next state OR a chosen state | 🆕 round-G |
| Sequences: multiple sequences overlay simultaneously | Parallel tracks: named tracks (loop + autoStart flags) independent of states; elements bind a track via tap toggle action; state driver excludes track-bound elements so tracks keep running across state switches. Cloud-verified on staging: tr1 autoStart+loop runs at boot, tr2 manual tap-toggle starts/stops its element (visibility + motion), autoNext chain and group state-filtering intact while a track runs | ✅ round I (implemented differently: tracks in place of Artivive's parallel overlay sequences; same viewer-facing capability) |
| Sequences: Manage Sequence (chain/stop), Change Interaction over time | Sequence chaining: per-state auto-advance `autoNext {at,to}` with editor controls, runs in previewer and player. Change Interaction over time: keyframes capture the element's tap behavior; the timeline driver switches it live during playback (discrete channel, base onTap before the first key) | ✅ round H |
| Sequences: loop/reset per sequence | Per-state loop setting: when on, the state's one-shot timelines replay together on completion (timeline driver); editor checkbox per state | ✅ round H |
| Preview Mode (simulate viewer, sequence notifications) | 3D preview page + live timeline playback on the editor canvas + ruler/scrub + state-switch toast notifications on tap and chained switches (previewer) | 🆕 rounds A/F/H ✅ |
| Timeline editor: ruler with drag scrub | Ruler with second ticks, keyframe markers, draggable playhead seeking the canvas | 🆕 round-F |
| 3D models: auto-fit, multi-mesh, textures + embedded clips | Auto-fit + center, multi-mesh opacity, textures/MeshStandardMaterial verified; first embedded glTF clip loops via AnimationMixer, hidden/target-lost freeze | ⚠️ round R: original authored translation clip rendered at two positions (pixel centroids562→685), mixer advances and freezes when hidden; phone/skeletal/morph/multi-clip choice still unverified |
| Particle effects: presets + speed/direction/size/density, custom assets | Sparkle/confetti presets, count/density 10-500, size 2-60, speed 0.2-3x, color, custom PNG/WebP sprite upload (verified: textured round points), arbitrary direction 0-359deg overriding the preset direction (verified: dir=90 -> purely horizontal velocities) | ✅ round C+G+I |
| 3D Sound: logarithmic mode (never fully muted) | PositionalAudio exponential rolloff, adjustable inner radius | 🆕 round-G |
| 3D Sound: linear mode (silent beyond outer sphere) | PositionalAudio linear model, inner + outer radii | 🆕 round-G |
| Chroma-key (green screen) video: color pick + threshold | Key color + threshold per video; custom discard shader, pixel-verified | 🆕 round-C |
| Transparent GIF upload | Own GIF89a decoder + canvas texture; transparency/disposal 0/1/2/3 implemented, per-frame timing; editor repaint + preview/player texture updates | ⚠️ partial verification: opaque animated fixture cloud pixel-verified in actual 3D scene, transparent disposal-2 and disposal-3 three-frame fixtures matched PIL RGBA in node harness, then live staging real UI imports in sandbox Chrome pixel-verified red/blue/green frame changes with cyan artwork visible through transparent regions. Interlaced animated input has a tested frozen first-frame canvas fallback and a persistent Hebrew import notice; interlaced animation is not supported. Phone AR still unverified. Bounds: 20MB input, 4MP canvas, 500 frames, 64MB decoded frame data; malformed/truncated data throws to static fallback. |
| Tap interactions: open link | Tap -> https URL (validated) | 🆕 round-A |
| Tap interactions: emails/phone links | https + mailto: + tel: (server-validated; javascript: and other schemes rejected) | 🆕 round-G |
| Publish artwork + stable link, QR for WebAR | Publish server written + secured (token auth, validation, limits); editor publish button + client-side QR; NOT deployed | ⚠️ round S remote-page bootstrap fixes: root base URL + experience marker before player; prior undeployed route had broken relative script paths/order. Local HTML/bootstrap regression passes. Still needs host/domain/token, actual remote buyer-device playback. |
| Update published artwork, QR unchanged | Exported experience id now reused on publish; same-id re-publish overwrites, link stable | ⚠️ round R regression fix: prior server used only slug and generated a fresh id for editor exports; now local API test proves stable URL + updated content. Still undeployed. |
| Recording the AR experience | 10s in-player recording with tone | ✅ device |
| Headphone-only playback toggle | Cannot force output routing from a browser | ⛔ limit |
| Save video to camera roll automatically | iOS blocks programmatic Photos writes; Share > Save Video | ⛔ limit |
| AR Mode editing on device | Experimental local creator camera-edit mode: explicit top-level visual/group selection, numeric x/y/width/depth/rotation, tracking-found/lost gate, explicit local save/reset; recording/viewer taps disabled | ⚠️ round T: synthetic A-Frame panel integration tests pass including transform, no-auto-save, save/reset, selected-only visibility, tracking gate; mobile panel visually inspected. Real camera/recognition/device workflow NOT verified. Group rotate/scale/translate persistence math now tested through save/export/import and reconstructed world positions; camera group save/reset including timeline maps and rendered group combinations tested synthetically. Selected mesh raycast + target-plane pointer drag now synthetic-tested, not phone-camera validated. Remote/public experiences cannot enable creator panel. |
| Element Library (pre-made assets) | Small original starter catalog: transparent star/ring PNGs, animated ring GIF, synthesized bell WAV, orbital MP4 video, purple gem GLB; mobile dialog, one-tap copy into local experience, editable/exportable | ⚠️ starter scope only: all six imported through real UI on live staging in sandbox Chrome, binary assets stored and exported (6 elements/7 assets incl artwork); GLB 24 vertices/color and rendered scene verified; WAV decoded 1.2s peak .213, ready4 (not phone/audio-listening proof). Mobile 390px thumbnails, scrolling and add controls visually inspected. Not Artivive catalog size/variety parity; video starter imported/exported, decoded2s at256x256, two sought frames differ; WebGL-video/phone playback still separate checks. |
| Cloud accounts, asset library, multi-device sync | Local IndexedDB per browser + export/import JSON; round S complete-schema synthetic-byte regression covers all7types, groups/states/tracks/timelines/tap/chroma/spatial/custom sprite and bytes through save/load/export/import/publish/readback | 🖥️ server (publish server is a first step) |
| Buyer flow: per-artwork link/QR for collectors | Round-E server covers the technical half; commerce/rights need owner decisions | 🖥️ server + owner decision |

## Historical verification provenance (round C part 1 - 3D models + chroma key, 2026-10-23)
- glTF: minimal GLB built in-page, added as an element, model-loaded fired, mesh present,
  auto-fit normalization (inner scale 0.3 for w=0.4) and target-space placement asserted in
  BOTH preview and player; editor shows a dashed 3D placeholder on the 2D canvas. Textures/
  animations inside complex GLBs untested (needs real device + real model files).
- Chroma: editor row persists key color + threshold; player entity builds with the
  chroma-video component (ShaderMaterial on a live VideoTexture). Keying itself is
  pixel-verified: the production shader rendered against a synthetic green-screen frame
  (red square on green) reads back green=[0,0,0,0] keyed out, red=[255,0,0,255] kept.
  Real footage, edges and performance remain a device check.
- Rich model fixture: multi-mesh GLB with an embedded checker texture verifies 2 mesh nodes,
  a real texture map on the textured mesh, MeshStandardMaterial (light-reactive) on both.
- Upload guard: .gltf files referencing external bin/textures are rejected with a clear
  Hebrew message (export as single .glb); non-GLB files rejected. No false format support.
- Precision note: in the cloud browser the 2D canvas decodes mp4 fine; the WebGL video
  texture path is what stalls. Claims about 'the environment can't decode' were wrong.
- Particles: editor button creates a particle element (no asset); panel edits preset/count/color;
  runtime is a THREE.Points emitter component. Verified: 120 points, positions advance over a
  3s window (sparkle rises), visible as sparkles in preview screenshot 140730.
- Round F (ruler/scrub) verified in cloud: ruler renders ticks + purple key markers (ink pixel
  count > 0); pointer scrub to t=0.2s shows the test text at the left sample point (93 dark px,
  0 right) and t=1.2s at the right point (72 px, 0 left) - the playhead seeks the exact sampled
  time on the editor canvas. Screenshot 144020 shows the ruler UI.
- Round D verified in cloud: assessTargetQuality flags a flat solid image (energy 0.0) and a
  small image (150px short side) with warnings, passes a detailed synthetic image (energy 12.1,
  768px). Spatial sound creates exactly one invisible carrier entity at the element's target-space
  position (flat sounds create none); player attaches THREE.PositionalAudio to it - audible
  panning is device-pending.
- Visual readability fixture: 256px 2x2 checker texture + bright standard materials render
  crisp and lit in preview (screenshot 140730, top of frame). The earlier blurry-band quad in
  that shot is the old 2px test texture - kept as contrast, not a defect.
- Regression note: a missing function definition briefly broke shared.js on deploy rc2;
  caught by cloud boot check, fixed in rc3, re-verified editor + player boot clean.

## Verification provenance (round B gap-closures, 2026-10-23)
- Timeline t=0: player starts motion on xrimagefound, freezes on xrimagelost, resumes where it
  stopped (scene-level events; verified with synthetic dispatches + driver state asserts).
  Preview keeps scene-start t=0 by design (no camera there). Sequence switch resets timelines.
- Hidden-state sounds pause and resume on return - deterministic stub test of the transition
  logic; real audio remains a device check.
- Scale keyframes editable in the editor (per-key scale input).
- Editor canvas plays timelines live while editing (same sampler as the runtime driver) -
  two-frame screenshot evidence. No time ruler/scrub yet: creators get live playback + numeric
  key entry, not drag-on-timeline. Closed in round F (ruler + scrub playhead).
- Headless-cloud caveat: rAF runs ~3fps in 3D scenes there, so tight timing asserts mislead;
  2D canvas decodes mp4 while the WebGL video path stalls (environment, handled by watchdog).

## Historical verification provenance (round B part 2 - timeline, 2026-10-23)
- Cloud browser: keyframed text element moves/rotates/fades over a 2s loop (sampled object3D
  transforms at two times, loop wrap observed), editor panel adds/lists/deletes keys, loop
  persists, base animation preset is disabled while a timeline exists, player boots clean.
- scale keyframes supported in the runtime but not yet exposed in the editor UI.
- Timeline t=0 is scene start in both preview and player (not target-found); device pass pending.

## Historical verification provenance (round B part 1 - sequences, 2026-10-23)
- Cloud browser: enabled multi-state from the editor UI, per-element state dropdown, list/canvas
  filter by edited state, add/delete states, preview toggles entity visibility on tap of a
  sequence-wired element, state dots track position, player boots with states honored, 0 console errors.
- Sound pause-on-hidden-state is code-verified only (cloud has no audio); device check pending.

## Verification provenance (round A, 2026-10-23)
- Cloud browser (headless Chrome, no camera): editor boots, demo seeds, legacy `spin` → `anim`
  migration, text add/edit/color, opacity, animation select, tap link + URL, numeric inputs,
  z-order, export JSON contains new fields, persistence across reload, 3D preview renders
  all element types with orbit controls, player boots to camera stage with 0 console errors.
- Device-verified from earlier rounds: recognition, muted autoplay, tap-to-unmute, 10s
  recording with tone. New round-A features still need one iPhone pass.
- Image detection, microphone, camera, and real audio cannot be exercised in the cloud.

## Round R reconciliation (current, 2026-10-23)
- Fixed two gaps found by tracing current code, not trusting earlier parity labels: parallel-track definitions were missing from JSON export/import; server ignored exported id and generated a new publish URL. Track roundtrip2definitions/element binding and stable republish API now tested. Earlier publish-stability assertion was inaccurate.
- AR-mode editing is an unbuilt product/code gap, not automatically native-only. No architectural exclusion accepted without evidence.
- First embedded GLB clip now plays; one original translation fixture only. AnimationMixer is separate from wrapper placement. Hidden ancestor pauses; camera found/lost listeners in shared component. Device/skeletal/morph and clip selection still open.
- Full-table review retains unresolved scope: heuristic vs Artivive target stars; Show/Hide discoverability; format/fidelity limitations described above; phone visual/audio/performance tests; account/sync/cloud library; production publish/conversion host isolation and backups; buyer rights/commercial decisions; catalog content depth; AR editing. Artivive editor never hands-on due access challenge, so this is not an exhaustive equivalence audit.

## Round S complete-schema regression
`tests/browser/schema-roundtrip.cjs` tests all element types + group/state/track references, timeline data, interactions, chroma/spatial fields and custom particle sprite bytes across local save/load, JSON export/import, authenticated publish/re-publish/readback. Fixture media bytes are synthetic and do not prove renderability. Found/fixed missing custom sprite export, and remote player bootstrap base path + marker ordering. Full buyer-device flow remains undeployed/unverified.

## Round V group composition correction
Base group rotation was applied to the wrapper while child world coordinates/rotations were also baked, producing double rotation and editor/runtime mismatch. Child local coordinates now inverse the base group rotation; creator group edits bake position, width, depth and rotation consistently. Synthetic 90deg/2x/translation fixture reconstructs exact child world positions after save/export/import. Independent child timelines under a rotated group remain a separate unresolved composition case; no broad group parity claim from this fixture.

## Round W composition evidence
Child timelines now inverse the base parent rotation/origin for local samples, fixing rotated-group double motion. Deterministic driver fixture verifies world positions and actual rendered Show/Hide red-pixel transitions plus sequence/stopped-track gates. Camera-group explicit save/reset child geometry tested. Software Chrome proof only. Editing a group's base AFTER authoring child absolute-world keys still needs keyframe baking; simultaneous parent/child motion and group opacity/media composition remain open.

## Round X creator edits and sparse channels
Group creator transforms now bake existing child keys and all group numeric/slider/canvas transform routes use the shared helper. Sparse linear XY/Z/rotation curve tested at7times with discrete hide/tap preserved; simultaneous animated parent/child world transform tested. Sampler corrected to interpolate each numeric channel independently across unrelated keys. Still open: sparse nonlinear easing bake can change shape, group's own keys after creator base edits, group opacity/media inheritance regression. Input-route code changed but no new end-to-end creator UI recording asserted.

## Round Y accumulated group checkpoint
Supersedes X's open sparse-easing/own-group-key gaps: exact affine sampled-output map, all5 easing modes ×201times for child/group, new world-key inverse entry, map included in whole-schema publish/update/readback. Group opacity descendant multiplication rendered at expected.4 intensity. Actual WAV group+child state/visibility/track pause/resume tested. Creator numeric group rotation/width/X/depth and key-entry UI tested/inspected. New canvas-pointer regression and phone audio/camera/capture validation remain open; no broad device claim.

## Round Z follow-through
Creator2D canvas actual pointer move/corner-scale regression passes with inspected selection screenshot. Camera group reset now restores affine timeline map as well as geometry; reset→save roundtrip fixture added. Actual WAV currentTime advances and actual parent timeline Show/Hide pauses/resumes playback. Live-camera drag, device audio/capture and complex transparent-model ordering still unverified.

## Round AB
Tilted-target group drag and track-only full-player found/lost startup gate fixtures pass synthetically. AutoStart tracks now wait for first target-found. Creator selected group bounds enclose rotated children. Physical camera/phone still unverified.

## Round AC import integrity
JSON import rejects nonembedded asset URLs before fetch, unsafe/duplicate ids, malformed timeline keys/maps and group references; supported embedded media bounded20MB each/60MB total. Six malformed fixtures rejected by import and authenticated server, external fetch count0. All14browser and importer/conversion/stable-publish regressions green. Server remains undeployed.

## Round AD canvas consistency
2D creator now composes parent group timeline into children for move/rotation/scale/opacity/visibility at scrub/live time. Actual ruler-pointer0/1/2.1s red pixels235→59→0 with fixed blue B, contact sheet inspected; existing runtime group and whole-schema regression pass. Parent preset/independent-clock preview and3D-on2D limitations remain separate, no full preview-equivalence claim.

## Round AE model controls
Zero-based embedded clip/speed/play/repeat creator controls persist across whole-schema publish/update.390px UI inspected. Runtime original GLB plus synthetic cloned second clip verifies index selection/speed/pause/one-shot config/tracking freeze. Real authored multi-clip/skeletal/morph fidelity and named selector remain open; no new rendered/device proof claimed.

## Round AF named multi-clips
Named GLB clip dropdown from bounded metadata now available. Actual original two-authored-clip GLB renders index0horizontal X357.5→441.3 and index1vertical Y352.8→268.8; four frames inspected. Supersedes AE's cloned-second-clip-only limit for simple translation. Skeletal/morph/blending/phone still unverified.

## Round AG deformation evidence
Original one-morph triangle renders area199→967pixels; original one-joint weighted triangle renders centroidX357.5→441.3. Same-scale crops inspected. Confirms minimal morph/skinning through existing loader/mixer; complex rigs/inverse binds/multijoint/blending and phone remain open. No broad model-fidelity claim.

## Round AH presets
Canvas group/child spin/float/pulse now sampled at scrub/live time with runtime preset periods. Actual AFrame seek world-position comparison all3start/mid/end within.002; actual canvas parent-spin pixels move/rotate with fixedblueB and inspected sheet. Independent track clocks and device timing remain open.

## Round AI zero-time boundary
Single t=0timeline now gets runtime driver and suppresses presets consistently with canvas; actual driver hide/opacity/rotation fixture passes. Previously duration0caused omission. No device claim.

## Round AJ local preview clocks
Canvas now uses experience/state-relative time and session-only manual track preview play/stop clocks; state switch retains track state. Composition accepts independent element clocks, global scrub unchanged. Actual controls and clock routing tested, not full runtime/pixel equivalence. Local-only pending restored deployment access.

## Round AK readability
Inactive state-tab text and track/sequence label contrast fixed;390px image inspected, manual preview fixture passes. Local-only pending deployment recovery, stagingrc51 unchanged.

## Round AL canvas track pixels
Manual track actual canvas pixels absent→movingX194→248→277 across state switch→absent after stop; sheet inspected. Extends AJ controls to bounded live-clock visual proof. State-loop/auto-next and broad clock combinations remain open.

## Round AM state loop
Canvas live state-loop clock uses max nontrack one-shot duration; boundary samples pass and all26browser fixtures rerun green. Rendered loop timing/autoNext creator simulation remains unverified. Local-only.

## Round AN publish durability
Full experience-count store now permits existing-id stable updates; atomic private-temp rename avoids partial JSON replacement. One-slot isolated fixture200/507/200 and readback/private-file/no-temp passes, plus stable URL/schema. Backend still undeployed, backups/multiuser/sync remain open.

## Round AO auth evidence
Isolated server regression confirms disabled-without-token, wrong-token no write, public read and authenticated-only deletion with final404.26browser fixtures rerun green. Undeployed, no production change.

## Round AP bare embedded glTF
Bare.gltf with embedded buffer/image URIs now converts via bounded dependency validator to self-contained GLB. Actual file-input stored magic/type proof; missing external dependency rejects with ZIP guidance/no element addition. No new rendered/complex-extension fidelity claim. Local-only.

## Round AQ model input boundary
GLB file input final check validates size/header/chunks/JSON and rejects external core/extension URIs before storing. Four malformed file fixtures reject, valid authored GLB imports. Not full mesh/extension semantics; whole-experience JSON embedded model bytes not deeply validated. Local-only.

## Round AR whole-import model boundary
Whole JSON imports validate model container/dependencies before local save; bad embedded model/URI reject without new records or external fetch. Valid model imports. Schema regression uses actual model bytes.29browser fixtures green on full rerun after one intermittent embedded-glTF fixture read failure. Local-only.
