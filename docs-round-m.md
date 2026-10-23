# Round M: transparent GIF verification and honest static fallback

## Verified
- Three-frame transparent disposal-2 and disposal-3 fixtures match PIL's composited RGBA frames, including alpha. Reproducible with `node tests/gifanim.cjs`; fixtures and reference arrays in tests/fixtures.
- Both fixtures imported through the actual editor file inputs against live staging rc31 in clean sandbox Chrome. Scene readbacks alternate red/blue/green patches while cyan artwork remains visible behind transparent portions. Captures inspected as a 2x2 evidence image.
- Interlaced animated fixture is rejected by the custom decoder and freezes to a first-frame canvas. Eight stable scene readbacks after render settling were identical. Editor retains the Hebrew static-fallback warning after saving instead of immediately replacing it with generic success.

## Bugs fixed during verification
- Previous fallback used IMG, which can continue animating in the native decoder. It now uses a frozen canvas in editor, preview and player.
- A-Frame preview artwork material had a blob URL string but a null texture map, silently showing a white plane instead of artwork. Preview now uses a loaded image in the media store and a selector source. Cyan artwork texture loaded (768px) and pixel-verified behind the GIF.

## Limits
Sandbox Chrome is not phone AR. No iPhone/Android GIF-device proof. Interlaced animation remains unsupported; tested static fallback is not parity. GIF loops currently use repeating timeout frames regardless of embedded Netscape loop count. Timing accuracy while hidden/backgrounded is not guaranteed. Unsupported/invalid GIF fallback depends on native browser image decode.
