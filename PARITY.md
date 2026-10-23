# Brill-AR Studio — Artivive parity map

Scope note: compiled from Artivive's public documentation (artivive.com resources / discover
pages, fetched 2026-10-23). Artivive's editor was never used hands-on — the list is
documented capabilities, not an exhaustive audit. Statuses reflect what is in this repo
and how it was verified, not marketing claims.

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
| Multiple layers per artwork (video/image/sound) | Unlimited elements, drag + sliders + numeric panel, element list | ✅ device/cloud |
| Layer types: video, image, audio, 3D (glTF/GLB), text, particles | All six built | 🆕 rounds A/C |
| File types: jpg/png/gif images; mp4/mov/gif video; glTF/GLB (+zip, .obj/.fbx) models | jpg/png/webp images; mp4/webm video; mpeg/mp4/wav/m4a/ogg audio; single-file .glb models, plus zip-wrapped GLB: a .zip containing one .glb is extracted at upload with bounded decompression (20MB entry cap, 100-entry cap, no nested-zip recursion, in-memory only) - cloud-verified (uploaded zip lands in IDB with glTF magic; bad zips get clear Hebrew errors) | ⚠️ partial: zip containing .gltf + external .bin/textures NOT supported (clear guidance message), animated gif layers, .mov, .fbx still open. .obj IS supported via editor-side transcode to GLB - PARTIAL FIDELITY: geometry only, materials/textures/UVs/normals are LOST on conversion; the editor detects mtllib/usemtl/vt/vn and shows a styled in-page warning before converting, recommending native glb export instead (cloud-verified both branches: cancel aborts with no import, accept imports geometry-only; plain cube.obj imports with no dialog). Zip extraction bounds: per-entry 20MB, 100 entries, 60MB total uncompressed, no nested-zip recursion; .gltf with external files rejected with a clear export-as-glb message |
| Transform layers (handles + numeric panel) | Drag + sliders + numeric x/y/w/rot/depth panel | 🆕 round-A |
| 2D and 3D editor views | 2D canvas editor + separate 3D preview page (orbit/zoom) | 🆕 round-A |
| Layer order control | z-order up/down buttons | 🆕 round-A |
| Opacity per layer | Per-element opacity 0-1 | 🆕 round-A |
| Text layer | Content, size, color, bold | 🆕 round-A |
| Animation presets | none / spin / float / pulse | 🆕 round-A |
| Timeline: Move/Rotate/Scale/Transform actions | Keyframes capture x/y/z/rot/opacity/scale per element | 🆕 round-B |
| Timeline: Speed Curve (linear/ease/elastic) | Per-element easing: linear / easeIn / easeOut / easeInOut / elastic (overshoot verified: f=0.5 -> 1.0156) | 🆕 round-G |
| Timeline: explicit Duration (loop length independent of last key) | Optional duration field; default = last key time | 🆕 round-G |
| Timeline: Show/Hide action at set times | Via opacity 0/1 keyframes (functionally equivalent, less discoverable) | ⚠️ partial |
| Timeline: animate groups of layers | Layer groups: multi-select + group/ungroup in the editor, group transforms (move/scale/rotate) apply to all children, wrapper entity in the player/previewer so timelines and animation presets run on the whole group; sequence visibility and opacity propagate into groups; publish-server validates group integrity | ✅ round H |
| Sequences: states/chapters per artwork | States with per-element assignment, state tabs, dots | 🆕 round-B |
| Sequences: On Tap -> Trigger a chosen sequence | Tap action per element: next state OR a chosen state | 🆕 round-G |
| Sequences: multiple sequences overlay simultaneously | Parallel tracks: named tracks (loop + autoStart flags) independent of states; elements bind a track via tap toggle action; state driver excludes track-bound elements so tracks keep running across state switches. Cloud-verified on staging: tr1 autoStart+loop runs at boot, tr2 manual tap-toggle starts/stops its element (visibility + motion), autoNext chain and group state-filtering intact while a track runs | ✅ round I (implemented differently: tracks in place of Artivive's parallel overlay sequences; same viewer-facing capability) |
| Sequences: Manage Sequence (chain/stop), Change Interaction over time | Sequence chaining: per-state auto-advance `autoNext {at,to}` with editor controls, runs in previewer and player. Change Interaction over time: keyframes capture the element's tap behavior; the timeline driver switches it live during playback (discrete channel, base onTap before the first key) | ✅ round H |
| Sequences: loop/reset per sequence | Per-state loop setting: when on, the state's one-shot timelines replay together on completion (timeline driver); editor checkbox per state | ✅ round H |
| Preview Mode (simulate viewer, sequence notifications) | 3D preview page + live timeline playback on the editor canvas + ruler/scrub + state-switch toast notifications on tap and chained switches (previewer) | 🆕 rounds A/F/H ✅ |
| Timeline editor: ruler with drag scrub | Ruler with second ticks, keyframe markers, draggable playhead seeking the canvas | 🆕 round-F |
| 3D models: auto-fit, multi-mesh, textures | Auto-fit + center, multi-mesh opacity, textures/MeshStandardMaterial verified | 🆕 round-C |
| Particle effects: presets + speed/direction/size/density, custom assets | Sparkle/confetti presets, count/density 10-500, size 2-60, speed 0.2-3x, color, custom PNG/WebP sprite upload (verified: textured round points), arbitrary direction 0-359deg overriding the preset direction (verified: dir=90 -> purely horizontal velocities) | ✅ round C+G+I |
| 3D Sound: logarithmic mode (never fully muted) | PositionalAudio exponential rolloff, adjustable inner radius | 🆕 round-G |
| 3D Sound: linear mode (silent beyond outer sphere) | PositionalAudio linear model, inner + outer radii | 🆕 round-G |
| Chroma-key (green screen) video: color pick + threshold | Key color + threshold per video; custom discard shader, pixel-verified | 🆕 round-C |
| Transparent GIF upload | Not supported | ❌ not built |
| Tap interactions: open link | Tap -> https URL (validated) | 🆕 round-A |
| Tap interactions: emails/phone links | https + mailto: + tel: (server-validated; javascript: and other schemes rejected) | 🆕 round-G |
| Publish artwork + stable link, QR for WebAR | Publish server written + secured (token auth, validation, limits); editor publish button + client-side QR; NOT deployed | 🆕 round-E 🖥️ needs host + domain + token (owner decision) |
| Update published artwork, QR unchanged | Same id re-publish overwrites; link stable | 🆕 round-E (code-verified, undeployed) |
| Recording the AR experience | 10s in-player recording with tone | ✅ device |
| Headphone-only playback toggle | Cannot force output routing from a browser | ⛔ limit |
| Save video to camera roll automatically | iOS blocks programmatic Photos writes; Share > Save Video | ⛔ limit |
| AR Mode editing on device | Web editor is 2D canvas + 3D preview | ⛔ limit (native-app territory) |
| Element Library (pre-made assets) | None (self-generated test assets only) | ❌ not built (content, not code) |
| Cloud accounts, asset library, multi-device sync | Local IndexedDB per browser + export/import JSON (roundtrip verified for every element type + states) | 🖥️ server (publish server is a first step) |
| Buyer flow: per-artwork link/QR for collectors | Round-E server covers the technical half; commerce/rights need owner decisions | 🖥️ server + owner decision |

## Verification provenance (round C part 1 - 3D models + chroma key, 2026-10-23)
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

## Verification provenance (round B part 2 - timeline, 2026-10-23)
- Cloud browser: keyframed text element moves/rotates/fades over a 2s loop (sampled object3D
  transforms at two times, loop wrap observed), editor panel adds/lists/deletes keys, loop
  persists, base animation preset is disabled while a timeline exists, player boots clean.
- scale keyframes supported in the runtime but not yet exposed in the editor UI.
- Timeline t=0 is scene start in both preview and player (not target-found); device pass pending.

## Verification provenance (round B part 1 - sequences, 2026-10-23)
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
