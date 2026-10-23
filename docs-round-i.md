# Round I design contract: remaining open gaps after Round H

Status of the parity map after Round H (all verified on staging rc15):
- groups, sequence chaining, per-state loop, preview notifications, Change Interaction over time: BUILT.
The rows below are the remaining open gaps. None is user-approved as out of scope.

## 1. Simultaneous overlay sequences (Artivive: multiple overlay sequences playing in parallel)
Current model: exactly one active state (curSeq); element visible if el.seq is null or equals curSeq.
Artivive model: overlays are independent sequences that can each be started/stopped; several can
play at once, layered over the same target.
Proposed model (v1, additive, backward compatible):
- New optional element field `el.track` (string id, default null = belongs to the shared state model).
- A "track" is a named mini-timeline: its own play/stop, its own per-track loop flag.
  Data: `rec.tracks = [{ id, name, loop, autoStart }]`.
- Runtime: each track with autoStart starts when the scene/state starts; tap action gains
  "track:<id>" values to start/stop a track from another element. A track's elements run their
  timelines on the track's own clock (separate driver instance per track).
- Visibility: element with el.track set is visible whenever its track is playing (independent of
  curSeq); el.seq still applies on top (both must allow).
- Editor: track list next to the state tabs; element panel gains a track selector (שיוך למסלול).
- Driver: startTimelineDriver already takes an entity list - instantiate one driver per track plus
  the existing state driver for untracked elements.
Open questions to decide at build time: whether a track can itself chain (probably reuse autoNext
per track), and editor canvas display of multiple simultaneous timelines (scrub affects selected
element's own clock only).
Estimated: the biggest remaining structural change; ~1 full round with verification.

## 2. Custom particle textures/shapes (Artivive: custom particle assets)
Current: 6 built-in presets + count/size/speed/color.
Proposed: preset "custom" uses an uploaded image asset as the particle sprite (PNG w/ alpha).
Data: el.particles.spriteAssetId. Runtime: PointsMaterial map = texture from the blob.
Editor: sprite picker appears when preset=custom. Small, self-contained.

## 3. Broader media formats
Current: mp4 (H.264), png/jpeg/webp/gif images, mpeg/mp4/wav audio, glb/gltf models.
Candidates: webm video (VP8/VP9 - Android-native), mov via transcoding (server-side, heavy),
lottie json animations (new element type or as image), webp already ok.
Proposed v1: accept video/webm upload (runtime probe already gates undecodable files to the gray
fallback), accept audio/ogg. Both are one-line accept-list + validation changes; device support
is probe-verified already.

## Verification plan (per item, cloud on staging)
- Tracks: two tracks auto-starting with different loops; assert both drivers advance and a tap
  stops one without touching the other; state switch leaves tracks running.
- Custom sprite: upload 32x32 PNG, preset custom; screenshot pixel-sample particle color/shape.
- Formats: upload webm (probe passes on Chrome), assert no gray fallback; upload ogg, assert sound plays flag set.
