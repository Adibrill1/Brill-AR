# Starter library

Groups shown with filters in the editor (הוספה ← ספריית התחלה); one tap on an item adds it.

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

## Animated 3D models: Quaternius (CC0) — `models/q*-*.glb`, `thumbs/q*-*.png`
81 rigged, animated low-poly models by Quaternius (https://quaternius.com), CC0 1.0 per the License.txt in each pack
(free for any use, no credit needed; credited here as a courtesy). The glTF variants were downloaded from the packs'
public Google Drive folders and packed to one GLB each by `tools/gltf-to-glb.mjs`; geometry, skins, animations and
textures unchanged (first two packs below). Thumbnails are rendered from the GLB, posed 0.3 s into the move the item starts on
(`tools/make-graphics.cjs mthumb`).

- Ultimate Animated Animal Pack (`q-`): alpaca, bull, cow, deer, donkey, fox, horse, horse_white, husky, shibainu,
  stag, wolf. 12–13 moves each (Idle, Walk, Gallop, Eating, Jump, Attack…); the library starts them on Idle (cow: Eating).
- Cute Animated Monsters Pack (`qm-`): alien, alien_tall, bat, bee, cactus, chicken, crab, cthulhu, cyclops, deer,
  demon, ghost, greendemon, mushroom, panda, penguin, pig, skull, tree, yellowdragon, yeti. Moves include Dance, Idle,
  Yes, No, Jump, Walk; the flying ones (bat, bee, cthulhu, yellowdragon) have Flying. Started on Dance or Flying.

- More packs, converted from their FBX files with the editor's own bundled converter (AssimpJS, the same one the
  editor uses for FBX uploads) by `tools/fbx-to-glb.cjs`: Animated Fish Pack (`qf-`: dolphin, fish1, fish2, fish3,
  manta_ray, shark, whale), Cute Fish Pack (`qc-`: clownfish, koi, goldfish, bluetang, puffer, betta, anglerfish,
  lionfish, mandarinfish, swordfish, sunfish, blobfish), Animated Dinosaur Pack (`qd-`: apatosaurus,
  parasaurolophus, stegosaurus, trex, triceratops, velociraptor), Farm Animal Pack (`qa-`: sheep, pig, pug, zebra) and
  Animated Robot (`qr-robot`). These keep the FBX's centimetre units (the editor fits every model to its layer width).
- Ultimate Monsters pack (`qu-`, glTF with a shared texture atlas, packed to GLB): bunny, frog, birb, mushroomking,
  cactoro, dino, blob_cat, blob_dog, blob_pinkblob, blob_wizard, blob_mushnub, dragon, glub, ghost, squidle, hywirl,
  pigeon, alpaking.

All Quaternius packs above are CC0 1.0 per their pack pages and License.txt files. The move is chosen in the editor's
model panel; the library only sets the starting one (swimming, Idle, Wave, Dance or Flying).

## Original animated models — `models/m-*.glb`, `thumbs/m-*.png`
Six models built entirely in code by `tools/make-models.mjs` (outside this repository): geometry generated there
(sphere, torus, lathe, box, bipyramid, star prism), plain glTF PBR materials, and node animation in one looping clip
named "Loop". No external artwork. solar (sun, four orbiting planets, a moon and a ringed planet), balloons (five
bobbing balloons on strings), star-mobile (a turning mobile of spinning stars), gems (three crystals orbiting a
fourth), dreidel (a spinning, wobbling top), flower (petals opening and closing on a swaying stem).

## Ready scenes (`kind: 'scene'` in library.js) — `thumbs/sc-*.png`
Eight scenes, each several layers added in one tap: models from this library starting on a chosen move, looping
paths written as timeline keys (x, y, depth, turn, scale, fade in/out), and a particle style. Each layer stays
editable on its own. aquarium, dragon, party, winter, dino-walk, shark, space, birthday. Thumbnails are captured from
the editor's own 2D view (`tools/scene-thumbs.cjs`).

## Particle styles — `particles/<sprite>.png`, `thumbs/p-<id>.png`
Eight ready particle layers. Each sprite is a 128px white shape drawn in code by `tools/make-graphics.cjs sprites`
(heart, petal, snowflake, leaf, sparkle, bubble, star, confetti), tinted in the experience by the layer's colours; the
style's settings (count, size, speed, direction, lifetime, colour range, fade) are in `library.js` and stay editable.

## Stickers — `stickers/<id>.png` (512px), `thumbs/st-<id>.png`
Twelve transparent PNG stickers drawn in code with a white die-cut edge (`tools/make-graphics.cjs stickers`): heart,
sparkle, speech bubble, arrow, cloud, rainbow, sun, moon, flower, crown, star, butterfly. No external artwork.

## Video loops: the user's Styles studio — `loops/`, `thumbs/loop-<id>.jpg`
Rendered by the user's own local Styles studio (code-drawn styles with synthesized music; its third-party parts are
MIT, as recorded in that studio's THIRD_PARTY.md) with `engine/render.mjs --style <id> --size 720x720 --fps 30` and a
blank title/subtitle/kicker, then re-encoded to H.264 High, yuv420p, AAC 128k, faststart. Each loop keeps its style's
default length (8–10 s) and music. Posters are a frame at 60% of the loop.

synthwave, bauhaus, stained-glass, dark-tech, lowpoly-island, impasto-oil, ukiyo-wave, sand-painting.
impasto-oil, ukiyo-wave and sand-painting "paint themselves" from blank: they work best as a one-time reveal
(turn the layer's loop off).

## Floating light effects — `fx/<id>.mp4`, `thumbs/fx-<id>.jpg`
Drawn in code for Brill-AR (`tools/make-effects.cjs`): 720×720, 30 fps, 6 s seamless loops on pure black, H.264 High,
no audio. The library adds them as video layers keyed with the soft black ("glow") key (chroma colour `#000000`):
alpha follows brightness, so glows stay soft over the artwork. Looks follow the user's Styles studio (neon-sign,
synthwave, stained-glass, ink-brush, bauhaus); no studio file is copied. The Hebrew neon signs are drawn with Amatic SC
Hebrew (SIL Open Font License 1.1, Copyright 2015 The Amatic SC Project Authors), taken from the user's Ai.Brill.Movies
repo; only the rendered letters are in the videos, the font file is not shipped.

neon-love, neon-mazal, neon-heart, retro-sun, fireworks, light-rays, portal, aurora, flames, enso, plasma, bauhaus, warp.
Thumbnails show the effect over a sample backdrop through the same key.

### Weather (same folder, `fx/w-*.mp4`; drawn by `tools/weather-fx.js`)
w-sun, w-partly, w-clouds (15 s loop), w-raincloud, w-rain, w-storm, w-lightning, w-hail, w-snow, w-rainbow, w-wind,
w-fog (12 s loop), w-tornado, w-night. Clouds are drawn light: with the soft black key their shaded undersides read as
thinner cloud rather than dark grey.
