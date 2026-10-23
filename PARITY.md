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
| Multiple layers per artwork (video/image/sound elements) | Unlimited elements, drag + sliders, element list | ✅ device/cloud |
| Standalone audio layer | Sound element with volume/loop | ✅ cloud |
| Play video on the artwork | Video element, muted autoplay + first-tap unmute | ✅ device |
| Opacity per layer | Per-element opacity 0–1 | 🆕 round-A |
| Precise positioning (numeric x/y/scale/rotate/depth) | Numeric transform panel | 🆕 round-A |
| Layer order control (bring forward/back) | z-order up/down buttons | 🆕 round-A |
| Text layer | Text element: content, size, color, bold | 🆕 round-A |
| Animation presets | none / slow spin / float / pulse per element | 🆕 round-A |
| Tap interactions (open link etc.) | Tap action: open URL / mute-unmute sound | 🆕 round-A |
| Preview without the camera | 3D preview page (orbit + zoom, same scene graph) | 🆕 round-A |
| Timeline (keyframed motion over time) | Per-element keyframes (t, position/rotation/opacity), loop, linear interpolation | 🆕 round-B (cloud-verified) |
| Sequences (multi-state artworks, tap to switch) | States per artwork, per-element state assignment, tap-to-advance action, state dots | 🆕 round-B (cloud-verified) |
| 3D models (glTF/GLB) | Upload .glb/.gltf as an element; auto-fit + center on load; works with opacity/anim/timeline/sequences/tap | 🆕 round-C (cloud-verified) |
| Particle effects | Not built | 🔜 planned (round C) |
| Chroma-key (green screen) video | Key color + sensitivity per video element; custom discard shader on the video texture | 🆕 round-C (keying pixel-verified; real footage + performance device-pending) |
| Particle effects | Built-in emitter: rising-sparkle / falling-confetti presets, count (10-500) + color per element | 🆕 round-C (motion verified in cloud; device visuals pending) |
| Per-artwork stable link / QR | Each artwork gets a public link; Artivive shows a QR | 🆕 round-E PREP: zero-dep Node server (publish API + stable player page + static host) written and locally tested with synthetic assets; editor publish button + client-side QR (vendored MIT qrcode-generator); publish AUTH built: Bearer token (fail-closed), strict validation (element allowlist, https-only taps, media-type allowlist, size/count/rate limits), nosniff, 10 local security tests passing; NOT deployed - production needs an always-on host + HTTPS domain + chosen token (owner decision, small cost) |
| Timeline ruler + scrub | (retained gap, now closed) | 🆕 round-F: ruler with second ticks, keyframe markers, draggable red playhead that seeks the live editor canvas; "back to live" button |
| Target quality hint | Artivive rates target images with stars | 🆕 round-D: resolution + gradient-energy heuristic with a plain Hebrew hint on upload (non-blocking) |
| Spatial audio | Sound can play flat | 🆕 round-D: optional per-sound spatial mode (THREE.PositionalAudio at the element's position); default stays flat |
| Spatial/positional audio | Not built | 🔜 planned (round D) |
| Recognition-quality feedback on target upload | Not built | 🔜 planned (round D) |
| Share link / QR per artwork | play.html?r=N#id link exists; polished per-artwork share page + QR planned | 🔜 planned (round E) |
| AR editing (arrange layers in camera view on device) | Web editor is 2D canvas + 3D preview; in-AR editing is native-app territory | ⛔ limit |
| Headphone-only enforcement | Cannot force output routing from a browser | ⛔ limit |
| Save video to camera roll automatically | iOS blocks programmatic Photos writes; Share > Save Video is the route | ⛔ limit |
| Cloud-hosted projects, accounts, asset library | Local browser storage per device (export/import JSON to move) | 🖥️ server |
| Buyer flow (stable per-artwork link/QR for collectors) | Scoped, needs a server + owner approval before any publication | 🖥️ server |

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
