# Test fixture notices

Fixtures here are test inputs only. They are not part of the shipped studio.

## Third-party models

### rigged-simple-draco.glb
- Model: Rigged Simple (glTF-Draco variant), from the Khronos glTF Sample Assets.
- Upstream: https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/RiggedSimple
- Copyright and licence (upstream README, "Legal"): (c) 2017, Cesium, Creative Commons Attribution 4.0 International, https://creativecommons.org/licenses/by/4.0/legalcode ("Cesium for Everything").
- Modification: repacked from glTF + .bin into a single GLB that keeps the Draco-compressed buffer views (commit message of e5121b4 in this history; the file's own asset block says generator COLLADA2GLTF, extension KHR_draco_mesh_compression). Used only to test compressed-model import and the format guard.

### meshopt-cube.glb
- Model: Meshopt Cube Test, from the Khronos glTF Sample Assets.
- Upstream: https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/MeshoptCubeTest
- Copyright and licence (upstream README and LICENSE.md): (c) 2025, Arseny Kapoulkine, Creative Commons Zero v1.0 Universal (CC0-1.0). No attribution is required; credited anyway.
- Modification: textures stripped and repacked glTF + .bin into one GLB with the meshopt-compressed buffer views (commit message of e5121b4; the file's asset block says generator khrmeshopt-gen, extensions KHR_mesh_quantization and KHR_meshopt_compression).

## Project-made fixtures

- Generator scripts exist in tests/ for multiclip, multijoint, rotclip and deformation GLBs (tests/make-*.py). morph.glb and skin.glb are described in docs-round-ag.md as original minimal GLBs generated from a reviewed script, but that script is not in this repository.
- clock-12s.mp4, crop-video.mp4, crop-video.mov, visual-2x1.mp4: ffmpeg-encoded synthetic clips (container tag Lavf58.76.100): test-pattern with burned-in timecode, colour bars, and red/blue halves. The exact ffmpeg commands are not recorded in this repository; provenance is from content inspection and the encoder tag, not from a recorded script.
- crop-animated.gif (2 frames, 40x20) and target-a.png, target-a2.png, target-b.png (generated noise and gradient patterns for duplicate-target tests): synthetic, no recorded generator.
- No fixture here is user artwork or user footage.

## dolphin-anim.fbx
"Dolphin" from the Animated Fish Pack by Quaternius (https://quaternius.com/packs/animatedfish.html), CC0 1.0 per the
pack's License.txt. Binary FBX with a 13-joint skeleton and one clip ("Swim"); used unchanged to test FBX import with
animation.
