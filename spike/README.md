# Peace & Technology — Technical Spike (Phase 0)

Proves the riskiest chain from the spec end-to-end, fully in the browser (WebAR, no app install):

**marker → image tracking → AR content + soundtrack → 10s composite recording (camera + AR + audio) → save to device**

## Result: PASSED ✅

Verified headlessly with a fake camera feeding the marker into Chromium:

- Marker compiled to a MindAR image target in **7.5s** (654KB `.mind` file)
- Marker detected in **0.4s** after camera start
- 3D content (animated torus knot, orbiting spheres, text sprite) anchored to the card
- Soundtrack plays on detection, stops on target lost
- 10s recording captured camera + AR layer + audio into a single **MP4** (9.95s, audio verified)
- Result screen with in-page playback, Save (download) and Share (Web Share API) buttons

Everything runs from local vendored files — **no CDN, works offline** after first load
(important for outdoor exhibitions).

## Structure

```
spike/
  index.html            the visitor AR experience (MindAR + three.js, importmap, no build step)
  compile.html          marker → .mind compiler page (same Compiler API the artist portal will use)
  vendor/               mind-ar 1.2.5 dist + three 0.147 (pinned: mind-ar uses pre-r152 API)
  assets/
    marker.png          generated test card artwork (high-contrast, feature-rich)
    targets.mind        compiled image target
    soundtrack.wav      generated 8s melody
    fake_camera.y4m     (gitignored, ~200MB) fake webcam video for headless testing
  tools/
    make_assets.py      regenerates marker.png / soundtrack.wav / fake_camera.y4m
    compile_marker.js   headless compile via Playwright: marker.png → targets.mind
    e2e_test.js         full-chain test with fake camera; saves screenshots + recorded video
```

## Run it on a real phone

The page needs HTTPS (or localhost) for camera access:

```bash
cd spike && python3 -m http.server 8000
# then expose over HTTPS, e.g.:
npx cloudflared tunnel --url http://localhost:8000   # or ngrok http 8000
```

Open the HTTPS URL on the phone, tap Start, and point the camera at `assets/marker.png`
shown on a second screen or printed.

## Run the headless verification

```bash
pip install pillow
npm install playwright                # browsers are pre-installed in this environment
python3 tools/make_assets.py          # regenerate assets incl. fake_camera.y4m
node tools/compile_marker.js          # marker.png → assets/targets.mind
node tools/e2e_test.js                # full chain; writes tools/e2e-out/
```

## Findings / notes for the MVP

- **three.js must stay pinned ≤0.151** until mind-ar drops `sRGBEncoding` (removed in newer three).
- Chromium records `video/mp4` directly from `canvas.captureStream`; Safari also records MP4 —
  the `pickMime()` fallback chain covers both.
- MindAR's tfjs workers are inlined in the dist bundle — no external worker files, offline-friendly.
- The Compiler API returns per-image feature stats (`trackingPoints`, `matchingKeyframes`) —
  the raw material for the artist-portal upload-time quality score.
- Composite recording draws the camera `<video>` (cover-mapped) + WebGL canvas per frame onto a
  2D canvas inside the render loop — no `preserveDrawingBuffer` needed.
- **Still to validate on real hardware**: detection robustness under outdoor lighting/glare and
  printed (not on-screen) markers, iOS Safari camera + recording quirks, real-device performance.
