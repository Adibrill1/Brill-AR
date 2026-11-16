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
125 models from https://polyhaven.com, all under CC0 (public domain dedication: free for any use, no credit needed;
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

Plants, fruit and a rat, added later (22): potted_plant_01, shrub_sorrel_01, pachira_aquatica_01, flower_stinkkruid,
leipoldtia_schultzei, didelta_spinosa, othonna_cerarioides, quiver_tree_02, jacaranda_tree, island_tree_02,
tree_small_02, fir_sapling, pine_sapling_small, dead_tree_trunk_02, planter_box_01, food_kiwi_01, food_lime_01,
food_lychee_01, food_ginger_01, yellow_onion, sweet_potato, street_rat (listed with the moving animals). Poly Haven
ships several of the plants as a row of variants; one plant is kept from each (`--drop-node` on the rest):
shrub_sorrel_01_d, pachira_aquatica_01_bark_d + _leaves_d, othonna_cerarioides_b, fir_sapling_a, pine_sapling_small_a,
flower_stinkkruid_a_LOD0, didelta_spinosa_small_LOD0, leipoldtia_schultzei_Medium_LOD0; their thumbnails are rendered
from the kept plant. The trees are far too heavy for a phone as they come (the jacaranda has 3.9 million triangles), so
`tools/slim-plants.py` (Blender, outside this repository) cuts each material by the same share: leaves are separate
small pieces, so past a point a random share of whole leaves is removed and the rest grown to keep the crown full;
trunks and branches are only decimated. Kept: jacaranda_tree 104k triangles, tree_small_02 83k, island_tree_02 84k,
fir_sapling and pine_sapling_small 60k, potted_plant_01 80k, leipoldtia_schultzei 60k. The five trees' and saplings'
textures are scaled to 512px by `tools/shrink-images.py` (leaf cut-outs stay PNG, the rest JPEG); the other models keep
their 1K textures.

Each model (except fancy_picture_frame_01, which holds the user's artwork and stays still) carries one looping clip
"Loop", added by `tools/make-ph-loops.py` (Blender, headless; outside this repository) from the static GLB above: the
rocking chair rocks on its runners, clock second hands tick (once round a minute; clocks without one run their hands
as a time-lapse), the kettle, pot, tea set, croissant and coffee cups steam, candles and lanterns flicker, lamps and
bulbs glow (an old filament flickers now and then), lids, doors and drawers open and close, reels and wheels turn,
the chess set plays 1. e4 e5 2. Nf3 Nc6 and takes it back, darts fly into the dartboard, the TV shows static, plants
sway in a breeze (two morph targets; trees bend by one field of height so trunk, branches and leaves stay joined),
the rat breathes, lifts its head to sniff, looks around and sweeps its tail (morph targets; it is turned three-quarters
so its profile shows), the lime rolls and the other fruit rock, balls bounce, the duck bobs among ripples, and statues, vases with a pattern and
cakes turn slowly as on a display stand. Steam, glows, drops and the like are the script's own meshes with soft
textures it draws; they rest at a tiny scale in the file (the clip scales them up), so the editor's fit to width sees
the model alone. The scan's own geometry, materials and image bytes are kept as they were.

## Scanned model with a looping move — `models/sk-gramophone.glb`, `thumbs/sk-gramophone.png`
"Gramophone with a wooden sound horn" by Virtual Museums of Małopolska (Wirtualne Muzea Małopolski),
https://sketchfab.com/3d-models/gramophone-with-a-wooden-sound-horn-45e30e0d5d1946b5bda80e336e2435a5, CC0 1.0 per the
license.txt in the download (credit not required; given here as a courtesy). Built with `tools/make-gramophone.py`
(Blender, headless): the ~640k-triangle scan decimated to ~100k, textures shrunk to 2K/1K JPEG, scaled to real size
(the box is ~30 cm wide), and a 7-inch shellac record added on the felt platter (grooves as a normal map, a red label
with gold print, all drawn in the script). The platter, record and spindle turn at 75 rpm in the one looping clip
"Loop" (4 s). It sits in the 3D models filter.

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

## Realistic weather — `weather/<id>.mp4`, `thumbs/wr-<id>.png`
The group "מזג אוויר ריאליסטי": ten weather loops made to look filmed rather than drawn, all self-made (no third-party
assets). Each is a 720×720 H.264 video on black (no sound) that arrives as a video layer across the artwork's width with
the soft black ("glow") key on, so only the light of the weather lies over the artwork. Made by scripts outside this
repository (`tools/weather_particles.py`, `tools/weather_volumes.py`, `tools/weather_encode.py`, `tools/weather_flash.py`,
run with Blender 5.2's own Python and Blender itself):
- rain-light, rain-heavy, hail, snow, blizzard, dust (30 fps): particles in 3D in front of a pinhole camera, each drawn
  with real lens optics, a motion streak as long as its speed times the shutter and a depth-of-field blur that grows away
  from the focus (out-of-focus snowflakes and motes become soft bokeh discs); heavy rain, the blizzard and the dust carry
  faint gusts of mist. Every particle travels a path that starts and ends outside the picture a whole number of times per
  loop, so the loop has no seam.
- fog, clouds, rays, storm (rendered at 12 fps in Cycles, blended to 24): real volumes lit by a sun and by a sky only the
  light sees (the camera sees black). Fog is fractal noise thick at the ground; clouds are noise-billowed bodies with flat
  bases riding across and wrapping outside the picture; rays are a warm spotlight through a moving canopy of holes into
  haze; the storm is a bank of cloud bodies lit from inside by flashes, with the bolts (jagged at every scale by midpoint
  displacement, with forks) drawn over them in time with the flashes. Fog, rays and storm close their loop with a short
  cross-fade.
Thumbnails are a frame shown through the key over a quiet dusk gradient.

## Flowers — `models/dandelion_01.glb`, `models/fl-rose.glb`, `models/fl-tulip.glb`, `models/fl-sunflower.glb`
- **Dandelion** (`dandelion_01`): Poly Haven, CC0. Poly Haven ships it as five plants; only variant `dandelion_01_b_LOD0` is
  kept (`--drop-node` on the rest, then `tools/slim-plants.py` keeps only the scene's own meshes, 23k triangles, 1K
  textures unchanged).
- **Rose, tulip and sunflower** (`fl-*`): self-made for this library, so free of any licence. They are modelled at real
  size by `tools/make-flowers.py` (Blender, headless; outside this repository).
  - Every petal, sepal and leaf is a curved sheet. The rose's petals spiral at the golden angle, and each one wraps
    round the flower's axis at its own distance, so they nest without crossing; the outer petals open wider and roll
    back. The tulip has six cupped tepals with stamens and a pistil inside. The sunflower's disc has 1,400 florets on
    Fermat's spiral, with two rings of rays and green bracts behind.
  - Textures are drawn in numpy: colour with veins and mottling, plus a normal map, as 2×2 atlases whose darker tiles go
    to the inner petals that sit in shadow. They are packed as JPEG.
- All four sway in a breeze through the same "Loop" clip as the other plants (`tools/make-ph-loops.py`, two morph
  targets bending by height above the ground).

## Nature backdrops — `backdrops/<id>.mp4`, `thumbs/bg-<id>.png`
Seven opaque video loops (960×960 H.264, 10 s, 24 fps) that fill the artwork as a backdrop. Everything is self-made, so
no licence applies. The generators are outside this repository: `tools/nature_bg.py` (numpy), `tools/nature_field.py`
(Blender) and `tools/nature_compose.py`. Each is computed in linear light at 1.5× size and averaged down.
- **Starry sky** (`stars`): about 2,000 stars with a power-law brightness and star colours, and the Milky Way with dust
  lanes. The brightest stars twinkle on whole-number cycles per loop. There is a line of pines and one meteor.
- **Sea** (`sea`) and **sunset over the sea** (`sunset`):
  - The sea is a Tessendorf FFT ocean whose wave frequencies are rounded to whole cycles per loop, so it repeats
    exactly. It is ray-traced per pixel from 4 m above the water.
  - The normals come from two wave patches, sampled from mip levels by the pixel's footprint. The lost slope variance
    returns as roughness for the sun's glint.
  - The water reflects the same sky by Fresnel, with haze toward the horizon.
- **Drifting clouds** (`clouds`): a cloud layer 1.5 km up made of tileable fbm with domain warp, lit from the sun's side.
  It drifts by the flow-map trick: two copies half a loop apart.
- **Wheat field** (`field`): Blender geometry nodes scatter wheat stalks (stem, leaf, an ear of grains with awns) and
  Eevee renders them. Gust waves cross the field on whole cycles per loop. The result is laid over the cloud sky with the
  same camera, with a hazy treeline at the horizon.
- **Aurora** (`aurora`): a folded curtain with fine rays and a soft glow behind it, over the stars. Mountains stand
  against it, reflected in a lake.
- **Underwater** (`underwater`): a fan of light shafts, the rippling surface lit by caustics from an FFT ocean, and
  drifting particles with depth of field.
