# Starter library

Three groups, shown with filters in the editor (הוספה ← ספריית התחלה).

## Original items
Generated for Brill-AR from geometric shapes, procedural motion, synthesized sine waves and original octahedron
geometry, not copied from stock or Artivive. No external artwork.

- star.png, ring.png: transparent geometric PNG overlays.
- pulse.gif: transparent expanding ring, repeating GIF.
- bell.wav: synthesized two-note bell, 1.2s mono PCM, no recorded audio.
- gem.glb: octahedron with purple PBR material.
- orbit.mp4 / orbit-poster.png: original two-second orbital geometric animation, H264/yuv420p, 256x256, no audio.

## 3D models: Poly Haven (CC0) — `models/`, `thumbs/<id>.png`
36 models from https://polyhaven.com, all under CC0 (public domain dedication: free for any use, no credit needed;
credited here as a courtesy). Downloaded with the 1K glTF variant through the Poly Haven API and packed to a single
GLB per model by `tools/gltf-to-glb.mjs` (outside this repository); geometry, materials and textures unchanged.
One change: `fancy_picture_frame_01` has its inner painting node (`fancy_picture_frame_01_canvas`) removed from the
scene and its back-plane triangles (the backing board, which showed through the double-sided opening) dropped, so the
frame can surround the user's own artwork (`--drop-node ... --drop-back-plane fancy_picture_frame_01`). Thumbnails are
Poly Haven's 256px previews resized to 160px, except the frame's, rendered from the edited model.

fancy_picture_frame_01, ornate_mirror_01, marble_bust_01, horse_statue_01, concrete_cat_statue,
carved_wooden_elephant, garden_gnome, rubber_duck_toy, Lantern_01, wooden_lantern_01, brass_diya_lantern,
chinese_chandelier, lightbulb_01, antique_ceramic_vase_01, ceramic_vase_01, brass_goblets, wine_bottles_01,
potted_plant_04, fern_02, anthurium_botany_01, flower_gazania, food_pomegranate_01, food_apple_01, lemon, croissant,
carrot_cake, Ukulele_01, boombox, cassette_player, Camera_01, Television_01, alarm_clock_01, mantel_clock_01,
dartboard, football, ArmChair_01. (File names are lower-case.)

The models are static; motion is added in the editor (spin, float, pulse, timeline).

## Video loops: the user's Styles studio — `loops/`, `thumbs/loop-<id>.jpg`
Rendered by the user's own local Styles studio (code-drawn styles with synthesized music; its third-party parts are
MIT, as recorded in that studio's THIRD_PARTY.md) with `engine/render.mjs --style <id> --size 720x720 --fps 30` and a
blank title/subtitle/kicker, then re-encoded to H.264 High, yuv420p, AAC 128k, faststart. Each loop keeps its style's
default length (8–10 s) and music. Posters are a frame at 60% of the loop.

synthwave, bauhaus, stained-glass, dark-tech, lowpoly-island, impasto-oil, ukiyo-wave, sand-painting.
impasto-oil, ukiyo-wave and sand-painting "paint themselves" from blank: they work best as a one-time reveal
(turn the layer's loop off).
