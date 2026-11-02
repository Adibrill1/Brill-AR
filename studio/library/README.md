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
103 models from https://polyhaven.com, all under CC0 (public domain dedication: free for any use, no credit needed;
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
dartboard, football, ArmChair_01, treasure_chest, vintage_suitcase, vintage_pocket_watch, seadogs_compass,
filmstrip_projector_8mm, vintage_video_camera, spinning_wheel_01, strawberry_chocolate_cake, chess_set,
vintage_grandfather_clock_01, wicker_basket_01, book_encyclopedia_set_01, vintage_binocular, magnifying_glass_01,
vintage_microscope, lifebuoy, dutch_ship_medium. (File names are lower-case.) vintage_suitcase comes as a pair; the second
suitcase's nodes are dropped (`--drop-node vintage_suitcase_02_bottom/_clasp/_handle/_top`) and its thumbnail is
rendered from the edited model.

Added later, packed the same way with no changes (50): american_football, bananas, baseball_01, brass_candleholders,
brass_pot_01, brass_vase_01, brass_vase_03, bronze_shark_statue, bronze_whale_statue, bull_head, cardboard_box_01,
carved_wooden_plate, CashRegister_01, ceramic_vase_02, Chandelier_03, chemistry_set, classic_laptop, CoffeeCart_01,
desk_lamp_arm_01, fishermans_hat, food_avocado_01, food_pears_asian_01, gothic_statue, horse_head, jug_01,
korean_public_payphone_01, lambis_shell, lion_head, Megaphone_01, postcard_set_01, pot_enamel_01, potted_plant_02,
Rockingchair_01, round_spectacles, street_lamp_01, tea_set_01, throw_pillows_01, vintage_cabinet_01,
vintage_electric_kettle, vintage_flashlight, vintage_microwave, retro_multimeter, vintage_stapler,
vintage_telephone_wall_clock, wall_clock, watering_can_metal_01, wine_barrel_01, wooden_bucket_02, wooden_candlestick,
wooden_crate_01. Left out after a look: vintage_wooden_drawer_01 (its geometry breaks apart in three.js) and
vintage_oil_lamp (its glass chimney draws black).

The models are static; motion is added in the editor (spin, float, pulse, timeline).

## Scanned model with a looping move — `models/sk-gramophone.glb`, `thumbs/sk-gramophone.png`
"Gramophone with a wooden sound horn" by Virtual Museums of Małopolska (Wirtualne Muzea Małopolski),
https://sketchfab.com/3d-models/gramophone-with-a-wooden-sound-horn-45e30e0d5d1946b5bda80e336e2435a5, CC0 1.0 per the
license.txt in the download (credit not required; given here as a courtesy). Built with `tools/make-gramophone.py`
(Blender, headless): the ~640k-triangle scan decimated to ~100k, textures shrunk to 2K/1K JPEG, scaled to real size
(the box is ~30 cm wide), and a 7-inch shellac record added on the felt platter (grooves as a normal map, a red label
with gold print, all drawn in the script). The platter, record and spindle turn at 75 rpm in the one looping clip
"Loop" (4 s). It sits in the 3D models filter.

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

## Ready time cubes (`kind: 'timecube'` in library.js) — `thumbs/tc-<id>.png`
Eight time cubes made from the video loops below (no new video files: each entry points at `loops/<id>.mp4`). Adding
one bakes the clip's first 8 s into the time cube's frame atlas on the device, as the "+ קוביית זמן" button does, with
the entry's slice direction, edges on, depth 0.75 and start width 0.5. Loops that open on a blank page (ukiyo-wave,
sand-painting, impasto-oil, bauhaus) are cut from the front so the front face plays the clip; the island is cut from the
top and the stained glass from the right. Thumbnails are the real bake rendered alone, cut part-way, at 160px.

## Video loops: the user's Styles studio — `loops/`, `thumbs/loop-<id>.jpg`
Rendered by the user's own local Styles studio (code-drawn styles with synthesized music; its third-party parts are
MIT, as recorded in that studio's THIRD_PARTY.md) with `engine/render.mjs --style <id> --size 720x720 --fps 30` and a
blank title/subtitle/kicker, then re-encoded to H.264 High, yuv420p, AAC 128k, faststart. Each loop keeps its style's
default length (8–10 s) and music. Posters are a frame at 60% of the loop.

synthwave, bauhaus, stained-glass, dark-tech, lowpoly-island, impasto-oil, ukiyo-wave, sand-painting.
impasto-oil, ukiyo-wave and sand-painting "paint themselves" from blank: they work best as a one-time reveal
(turn the layer's loop off).

## Floating effects, weather and cosmic effects — 3D only
These groups ("אפקטים מרחפים", "מזג אוויר", "חלל וחלקיקים") used to be keyed video loops (`fx/*.mp4`, drawn by
`tools/make-effects.cjs`, `tools/weather-fx.js` and `tools/cosmic-fx.js` outside this repository). They are now 3D models
only: the videos and their thumbnails were removed (they remain in git history). The soft black ("glow") key itself is
still in the app for the user's own videos.

## Floating effects in 3D — `models/fx3d-*.glb`, `thumbs/fx3d-*.png`
The thirteen floating light effects as 3D models, built in Blender by `tools/make-real-models.py` (outside this
repository), each with one looping clip "Loop". Glow is unlit colour (KHR_materials_unlit) wrapped in translucent shells
or drawn from gradient-alpha textures made in the script; solid parts use Poly Haven (CC0) textures (lichen_rock for the
portal and the campfire stones, bark_brown_02 for the logs, plywood as a paint normal map). The neon signs are the words
in Amatic Hebrew (SIL Open Font License 1.1, Copyright 2015 The Amatic SC Project Authors; only the letter shapes are in
the models), turned into tubes on a black acrylic board in a metal foot, like a desk neon sign. plasma (a plasma lamp), neon-love, neon-mazal, neon-heart, retro-sun (a sliced sun over a running neon
grid), fireworks, light-rays, portal (a stone ring with a swirling vortex), aurora, flames (a campfire), enso (an ink
brush circle drawn in the air), bauhaus (painted shapes on a plinth), warp (starlight streaks rushing out of the
picture). Thumbnails are rendered from the GLB (`tools/make-graphics.cjs mthumb`).

## Weather and cosmic effects in 3D — `models/fx3d-w-*.glb`, `models/fx3d-k-*.glb`
The 14 weather and 12 cosmic effects as 3D models, from the same script and in the same way. Clouds are whole shapes
(metaballs, lightly displaced, with a translucent skin a little larger than the body), so nothing is cut at their edges;
rain, hail and snow fall in seamless cycles and fade at the ends of each fall; fog is soft-edged translucent cards; the
moon's surface is drawn in the script. Cosmic effects are clouds of glowing dots (each an octahedron, merged into a few
meshes that turn and breathe as wholes); the line terrain moves by two blended shape keys (glTF morph targets); the
fibre lamp's tips change colour by three overlapping tip sets that grow and shrink in turn.
Everything is built to be seen from any side: light rays and the sun's rays point in every direction, the portal has a
tunnel behind its ring, the aurora's curtains stand on an arc, the rainbow is round tubes, clouds are as deep as they are
tall, rain, hail and snow fall through a deep box, lightning zigzags in depth, fog is crossing soft layers.
