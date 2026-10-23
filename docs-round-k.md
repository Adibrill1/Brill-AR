# Round K: animated GIF layers

Own decoder, no new dependency. The editor accepts GIF as an image layer, repaints the editor canvas while an animated layer exists, and uses a canvas texture in the preview and AR player. Frames honor their delay and transparency. Interlaced files fall back to a static image with a visible explanation.

## Verified
- Decoder parses two-frame GIF89a fixture and produces expected red/blue RGBA frames.
- Transparent disposal-2 fixture matches PIL frame-by-frame including alpha in a node canvas harness.
- All prefix truncations of the small fixture terminate (no malformed sub-block infinite loop).
- Decoder bounds: 20MB input, 4MP canvas, 500 frames, 64MB decoded frame data, frame rectangle within canvas, palette indices, LZW code size and exact decoded pixel count.
- Live rc28 on staging: GIF record's original buildElementEntity A-IMAGE has canvas texture; actual scene captureStream pixels alternate red and blue (8190 solid colored pixels each). Texture clamp constant corrected to THREE.ClampToEdgeWrapping = 1001, LinearFilter = 1006, no mipmaps.
- Actual render readback images inspected, saved as GIF-scene evidence. Normal browser screenshots had stale compositor state during this session, so they were not used as proof of animation.

## Not yet verified
Transparent layering in live 3D scene, disposal-3 test fixture, interlaced animated playback (not supported), iPhone/Android AR GIF playback. AR player uses the same media factory/texture pump but that is code coverage, not device proof.

## QA mistakes resolved
IDB test writes initially omitted the out-of-line key; the resulting synchronous DataError inside an event handler left the test promise unresolved. This was not an app storage failure. Test record also initially omitted __artwork. Hash-only navigation does not rerun the preview. With correct keyed writes, artwork and a real navigation, the original entity renders and animates.
