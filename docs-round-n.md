# Round N: original starter library

Mobile-first dialog with five original starter assets: gold star PNG, purple ring PNG, transparent animated pulse GIF, quiet synthesized two-note bell WAV, purple octahedron GLB. One-tap add uses the same importer as uploaded files, keeps a readable name, and copies bytes into the current experience. Bell defaults to no loop. No account, purchase, third-party stock, or Artivive asset copying.

Generator and provenance: tests/make-library.py, studio/library/README.md. Five small assets total about 65KB. Library thumbnails load before visual QA; dialog scrolls to the fifth card at 390px width and closes with native dialog Escape or close button.

Verification on deployed rc32 via clean sandbox Chrome actual UI:
- All five buttons add exactly one element; persisted correct MIME and binary bytes in local experience.
- Export contains all 5 elements and 6 assets including artwork, so existing projects do not need the starter catalog to remain hosted for playback.
- GLB loads 24 vertices with purple material and is visible in actual render readback over cyan artwork.
- Bell HTML audio readyState4, 1.2s; AudioContext decode returns 1.2s and nonzero peak .213. No phone or subjective listening proof claimed.
- 390x844 dialog top and bottom screenshots inspected: thumbnails, readable labels, buttons, scrolling.

This is a useful small starter set, not parity with Artivive's content catalog. Video assets, broader content styles and device playback remain open.
