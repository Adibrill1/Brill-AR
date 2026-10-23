# Round P: original video starter and format checkpoint

Sixth starter asset: original 2s geometric orbital animation, 256x256 H264/yuv420p MP4, no audio, 11KB. Generator extends tests/make-library.py; poster included for the library card.

Actual live-staging rc34 file/UI flow in sandbox Chrome: added all6 library assets and exported all6 elements/7 assets including artwork. Video stored as video/mp4 with2s duration,256x256; decoded canvas frames at .1s and1s differ and selected frame inspected. This proves decoding and library integration, not phone/WebGL video playback. All six catalog items remain original generated content. No catalog size/style parity claim.

Remaining format work: FBX not implemented. An Assimp WASM package is available for exploration, but its conversion scope/fidelity/resource bounds and runtime animation playback must be tested before claiming FBX support. MOV implementation is local-only and needs production service isolation/hosting. See PARITY.md for all earlier rows, including device, account/sync, publishing and content limitations.
