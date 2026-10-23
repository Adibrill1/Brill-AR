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
| Timeline (keyframed motion over time) | Not built | 🔜 planned (round B) |
| Sequences (multi-state artworks, tap to switch) | States per artwork, per-element state assignment, tap-to-advance action, state dots | 🆕 round-B (cloud-verified) |
| 3D models (glTF/GLB) | Not built | 🔜 planned (round C) |
| Particle effects | Not built | 🔜 planned (round C) |
| Chroma-key (green screen) video | Not built | 🔜 planned (round C) |
| Spatial/positional audio | Not built | 🔜 planned (round D) |
| Recognition-quality feedback on target upload | Not built | 🔜 planned (round D) |
| Share link / QR per artwork | play.html?r=N#id link exists; polished per-artwork share page + QR planned | 🔜 planned (round E) |
| AR editing (arrange layers in camera view on device) | Web editor is 2D canvas + 3D preview; in-AR editing is native-app territory | ⛔ limit |
| Headphone-only enforcement | Cannot force output routing from a browser | ⛔ limit |
| Save video to camera roll automatically | iOS blocks programmatic Photos writes; Share > Save Video is the route | ⛔ limit |
| Cloud-hosted projects, accounts, asset library | Local browser storage per device (export/import JSON to move) | 🖥️ server |
| Buyer flow (stable per-artwork link/QR for collectors) | Scoped, needs a server + owner approval before any publication | 🖥️ server |

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
