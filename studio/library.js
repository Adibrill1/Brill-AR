/* Starter library. Selection copies an asset into the current local experience, so export/import does not
   depend on a future catalog fetch. Groups: the original items, CC0 3D models from Poly Haven (packed to
   GLB at 1K textures), animated CC0 models by Quaternius, particle styles and stickers drawn in code
   (tools/make-graphics.cjs), video loops rendered from the user's own Styles studio (720×720, with music), and
   floating light effects drawn in code on black (tools/make-effects.cjs), added with the soft black (glow) key.
   Credits and sources: library/README.md. */
window.StarterLibrary = (() => {
  const originals = [
    {id:'star',name:'כוכב זהוב',detail:'תמונה שקופה · PNG',kind:'image',file:'star.png',thumb:'star.png'},
    {id:'ring',name:'טבעת סגולה',detail:'תמונה שקופה · PNG',kind:'image',file:'ring.png',thumb:'ring.png'},
    {id:'pulse',name:'טבעת פועמת',detail:'אנימציה שקופה · GIF',kind:'image',file:'pulse.gif',thumb:'pulse.gif'},
    {id:'bell',name:'פעמון עדין',detail:'צליל מקורי · 1.2 שניות',kind:'sound',file:'bell.wav',icon:'♪'},
    {id:'orbit',name:'מסלול אור',detail:'סרטון מקורי · 2 שניות · ללא צליל',kind:'video',file:'orbit.mp4',thumb:'orbit-poster.png'},
    {id:'gem',name:'אבן סגולה',detail:'תלת-ממד · GLB',kind:'model',file:'gem.glb',icon:'◇'}
  ].map((e) => ({...e, group:'original'}));
  // Poly Haven (CC0): [file id, Hebrew name]
  const models = [
    ['fancy_picture_frame_01','מסגרת מוזהבת מעוטרת'],['ornate_mirror_01','מראה מעוטרת'],['marble_bust_01','פסל ראש משיש'],
    ['horse_statue_01','פסל סוס'],['concrete_cat_statue','פסל חתול מבטון'],['carved_wooden_elephant','פיל מגולף מעץ'],
    ['garden_gnome','גמד גינה'],['rubber_duck_toy','ברווז גומי'],['lantern_01','פנס ישן'],['wooden_lantern_01','פנס עץ'],
    ['brass_diya_lantern','מנורת שמן מפליז'],['chinese_chandelier','נברשת סינית'],['lightbulb_01','נורה'],
    ['antique_ceramic_vase_01','כד קרמיקה עתיק'],['ceramic_vase_01','כד קרמיקה'],['brass_goblets','גביעי פליז'],
    ['wine_bottles_01','בקבוקי יין'],['potted_plant_04','צמח בעציץ'],['fern_02','שרך'],['anthurium_botany_01','שיח עלים מבריקים'],
    ['flower_gazania','פרח גזניה'],['food_pomegranate_01','רימון'],['food_apple_01','תפוח'],['lemon','לימון'],['croissant','קרואסון'],
    ['carrot_cake','עוגת גזר'],['ukulele_01','יוקללה'],['boombox','רדיו־טייפ'],['cassette_player','ווקמן'],['camera_01','מצלמה ישנה'],
    ['television_01','טלוויזיה ישנה'],['alarm_clock_01','שעון מעורר'],['mantel_clock_01','שעון אח'],['dartboard','לוח חיצים'],
    ['football','כדור כדורגל ישן'],['armchair_01','כורסה ויקטוריאנית'],
    ['treasure_chest','תיבת אוצר'],['vintage_suitcase','מזוודה עתיקה'],['vintage_pocket_watch','שעון כיס'],['seadogs_compass','מצפן'],
    ['filmstrip_projector_8mm','מקרן סרטים'],['vintage_video_camera','מצלמת קולנוע ישנה'],['spinning_wheel_01','גלגל טוויה'],
    ['strawberry_chocolate_cake','עוגת שוקולד ותותים'],['chess_set','לוח שחמט'],['vintage_grandfather_clock_01','שעון סבא'],
    ['wicker_basket_01','סל נצרים'],['book_encyclopedia_set_01','אנציקלופדיה ישנה'],['vintage_binocular','משקפת עתיקה'],
    ['magnifying_glass_01','זכוכית מגדלת'],['vintage_microscope','מיקרוסקופ עתיק'],['lifebuoy','גלגל הצלה'],['dutch_ship_medium','ספינת מפרש']
  ].map(([id,name]) => ({id:'ph-'+id,name,detail:'תלת־ממד · חינמי (CC0)',kind:'model',file:'models/'+id+'.glb',thumb:'thumbs/'+id+'.png',group:'model'}));
  // Rendered from the Styles studio: [style id, Hebrew name, seconds]
  const loops = [
    ['synthwave','סינת׳ווייב',10],['bauhaus','באוהאוס',8],['stained-glass','ויטראז׳',9],['dark-tech','טכנולוגיה על שחור',9],
    ['lowpoly-island','אי לואו־פולי',10],['impasto-oil','צבע שמן עבה',9],['ukiyo-wave','אוקיו־אה',9],['sand-painting','ציור בחול',10]
  ].map(([id,name,sec]) => ({id:'loop-'+id,name,detail:'לולאת וידאו · '+sec+' שניות · עם מוזיקה',kind:'video',file:'loops/'+id+'.mp4',thumb:'thumbs/loop-'+id+'.jpg',group:'loop'}));
  // Animated CC0 models by Quaternius (packed to GLB): [file id, Hebrew name, the move they start on, start width]
  const animated = [
    ['q-alpaca','אלפקה','Idle',.5],['q-bull','שור','Idle',.55],['q-cow','פרה','Eating',.55],['q-deer','איילה','Idle',.5],
    ['q-donkey','חמור','Idle',.5],['q-fox','שועל','Idle',.5],['q-horse','סוס','Idle',.55],['q-horse_white','סוס לבן','Idle',.55],
    ['q-husky','האסקי','Idle',.5],['q-shibainu','כלב שיבה','Idle',.5],['q-stag','אייל','Idle',.55],['q-wolf','זאב','Idle',.5],
    ['qm-alien','חייזר','Dance',.35],['qm-alien_tall','חייזר גבוה','Dance',.35],['qm-bat','עטלף','Flying',.35],['qm-bee','דבורה','Flying',.35],
    ['qm-cactus','קקטוס','Dance',.35],['qm-chicken','אפרוח','Dance',.35],['qm-crab','סרטן','Dance',.35],['qm-cthulhu','תמנון מעופף','Flying',.35],
    ['qm-cyclops','ענק חד־עין','Dance',.35],['qm-deer','אייל קטן','Dance',.35],['qm-demon','שדון אדום','Dance',.35],['qm-ghost','רוח רפאים','Dance',.35],
    ['qm-greendemon','שדון ירוק','Dance',.35],['qm-mushroom','פטרייה','Dance',.35],['qm-panda','פנדה','Dance',.35],['qm-penguin','פינגווין','Dance',.35],
    ['qm-pig','חזיר','Dance',.35],['qm-skull','גולגולת','Dance',.35],['qm-tree','עץ','Dance',.35],['qm-yellowdragon','דרקון צהוב','Flying',.35],['qm-yeti','יטי','Dance',.35]
    ,
    // converted from the packs' FBX with the editor's own converter (AssimpJS): fish, dinosaurs, farm animals, robot
    ['qf-dolphin','דולפין','Armature|Swim',.45],['qf-fish1','דג ים ורוד','Armature|Swim',.4],['qf-fish3','דג פסים כתום','Armature|Swim',.35],
    ['qf-manta_ray','טריגון מנטה','Armature|Swim',.5],['qf-shark','כריש','Armature|Swim',.5],['qf-whale','לווייתן','Armature|Swim',.6],['qf-fish2','דג כחול־צהוב','Armature|Swim.001',.35],
    ['qc-clownfish','דג ליצן','Fish_Armature|Swimming_Normal',.3],['qc-koi','קוי','Fish_Armature|Swimming_Normal',.3],['qc-goldfish','דג זהב','Fish_Armature|Swimming_Normal',.3],
    ['qc-bluetang','דג כחול','Fish_Armature|Swimming_Normal',.3],['qc-puffer','אבו־נפחא','Fish_Armature|Swimming_Normal',.3],['qc-betta','דג קרב','Fish_Armature|Swimming_Normal',.3],
    ['qc-anglerfish','דג פנס','Fish_Armature|Swimming_Normal',.3],['qc-lionfish','דג אריה','Fish_Armature|Swimming_Normal',.3],['qc-mandarinfish','דג מנדרינה','Fish_Armature|Swimming_Normal',.3],
    ['qc-swordfish','דג חרב','Fish_Armature|Swimming_Normal',.35],['qc-sunfish','דג שמש','Fish_Armature|Swimming_Normal',.3],['qc-blobfish','דג טיפה','Fish_Armature|Swimming_Normal',.3],
    ['qd-apatosaurus','אפטוזאורוס','Armature|Apatosaurus_Idle',.6],['qd-parasaurolophus','פראסאורולופוס','Armature|Parasaurolophus_Idle',.55],['qd-stegosaurus','סטגוזאורוס','Armature|Stegosaurus_Idle',.55],
    ['qd-trex','טירנוזאורוס','Armature|TRex_Idle',.55],['qd-triceratops','טריצרטופס','Armature|Triceratops_Idle',.55],['qd-velociraptor','ולוסירפטור','Armature|Velociraptor_Idle',.5],
    ['qa-sheep','כבשה','Armature|Idle',.45],['qa-pig','חזרזיר','Armature|Idle',.45],['qa-pug','כלב פאג','Armature|Idle',.4],['qa-zebra','זברה','Armature|Idle',.5],
    ['qr-robot','רובוט מנופף','RobotArmature|Robot_Wave',.35],
    // Ultimate Monsters pack (glTF + atlas texture, packed to GLB)
    ['qu-bunny','ארנב','Wave',.35],['qu-frog','צפרדע','Wave',.35],['qu-birb','ציפור כחולה','Wave',.35],['qu-mushroomking','מלך הפטריות','Wave',.35],
    ['qu-cactoro','קקטוס בכובע','Wave',.35],['qu-dino','דינו סגול','Wave',.35],['qu-blob_cat','חתול עגול','Dance',.3],['qu-blob_dog','כלב עגול','Dance',.3],
    ['qu-blob_pinkblob','כדור ורוד','Dance',.3],['qu-blob_wizard','קוסם קטן','Dance',.3],['qu-blob_mushnub','פטרייה קטנה','Dance',.3],['qu-dragon','דרקון כתום','Flying_Idle',.35],
    ['qu-glub','עטלפון','Flying_Idle',.35],['qu-ghost','רוח מעופפת','Flying_Idle',.35],['qu-squidle','יצור כנפיים','Flying_Idle',.35],['qu-hywirl','תמנון סגול','Flying_Idle',.35],
    ['qu-pigeon','יונה','Flying_Idle',.35],['qu-alpaking','אלפקה מעופפת','Flying_Idle',.35]
  ].map(([id,name,clip,w]) => ({id,name,detail:'תלת־ממד בתנועה · חינמי (CC0)',kind:'model',file:'models/'+id+'.glb',thumb:'thumbs/'+id+'.png',clip,w,
    group:/^q[fc]-/.test(id)?'sea':/^qd-/.test(id)?'dino':/^q[mur]-/.test(id)?'creature':'animal'}));
  // Ready particle styles: a sprite drawn here (white, tinted by the colours) and the particle settings it starts with
  const particleStyles = [
    ['hearts','לבבות עולים','heart',{count:60,size:22,speed:.8,color:'#ff4d7a',color2:'#ffa3c4',direction:0,lifetime:3,life2:5,fade:true}],
    ['petals','עלי כותרת נושרים','petal',{count:70,size:18,speed:.6,color:'#ffb7c9',color2:'#ffffff',direction:180,lifetime:4,life2:7,fade:true}],
    ['snow','שלג','snowflake',{count:120,size:14,speed:.4,color:'#ffffff',color2:'#cfe8ff',direction:180,lifetime:5,life2:9,fade:true}],
    ['leaves','עלי שלכת','leaf',{count:50,size:22,speed:.5,color:'#e8742a',color2:'#f6c343',direction:180,lifetime:4,life2:7,fade:true}],
    ['gold','אבק זהב','sparkle',{count:140,size:12,speed:.3,color:'#ffd94d',color2:'#fff3b0',direction:-2,lifetime:1.5,life2:3,fade:true,endSize:.3}],
    ['bubbles','בועות','bubble',{count:40,size:24,speed:.5,color:'#bfe9ff',color2:'#ffffff',direction:0,lifetime:3,life2:6,fade:true}],
    ['stars','כוכבים מתפזרים','star',{count:80,size:16,speed:.5,color:'#ffffff',color2:'#ffe680',direction:-3,lifetime:2,life2:4,fade:true,endSize:.2}],
    ['confetti','קונפטי','confetti',{count:150,size:14,speed:.9,color:'#ff4d6d',color2:'#4dc3ff',direction:180,lifetime:3,life2:5}]
  ].map(([id,name,sprite,particles]) => ({id:'p-'+id,name,detail:'חלקיקים · אפשר לשנות צבע וכמות',kind:'particles',file:'particles/'+sprite+'.png',thumb:'thumbs/p-'+id+'.png',particles,group:'particles'}));
  // Stickers drawn here (transparent PNG, die-cut look): [file id, Hebrew name]
  const stickers = [
    ['heart','לב'],['sparkle','ניצוץ'],['speech','בועת דיבור'],['arrow','חץ'],['cloud','ענן'],['rainbow','קשת בענן'],
    ['sun','שמש'],['moon','ירח'],['flower','פרח'],['crown','כתר'],['star','כוכב'],['butterfly','פרפר']
  ].map(([id,name]) => ({id:'st-'+id,name,detail:'מדבקה · תמונה שקופה',kind:'image',file:'stickers/'+id+'.png',thumb:'thumbs/st-'+id+'.png',group:'sticker'}));
  // Original animated models built in code (tools/make-models.mjs): one looping clip "Loop" each
  const made = [
    ['m-solar','מערכת שמש',.75],['m-balloons','בלונים מרחפים',.7],['m-star-mobile','מובייל כוכבים',.7],
    ['m-gems','אבני חן במסלול',.5],['m-dreidel','סביבון מסתובב',.35],['m-flower','פרח נפתח',.35]
  ].map(([id,name,w]) => ({id,name,detail:'תלת־ממד בתנועה · מקורי',kind:'model',file:'models/'+id+'.glb',thumb:'thumbs/'+id+'.png',clip:'Loop',w,group:'made'}));
  // Ready scenes: several layers in one tap, each with its own looping path (timeline keys) and move. Paths are
  // sampled from a function of the loop phase f (0..1); x/y in artwork units (0 = centre), z = depth toward the viewer.
  const path = (dur, n, fn) => ({ loop: true, ease: 'linear', keys: [...Array(n + 1)].map((_, i) => Object.assign({ t: +(dur * i / n).toFixed(3) }, fn(i / n))) });
  const across = (dur, y, z, dir, wave = 0.03) => path(dur, 12, (f) => ({ x: dir * (-0.62 + 1.24 * f), y: y + wave * Math.sin(f * Math.PI * 4), z, opacity: f < 0.08 || f > 0.92 ? 0 : 1 }));
  const M = (file, name, clip, o) => Object.assign({ type: 'model', file: 'models/' + file + '.glb', name, clip }, o);
  const P = (sprite, name, particles, o) => Object.assign({ type: 'particles', file: 'particles/' + sprite + '.png', name, particles }, o);
  const scenes = [
    ['aquarium','אקווריום','מים, דגים שוחים ובועות',[
      M('qc-clownfish','דג ליצן','Fish_Armature|Swimming_Normal',{ w: .2, rotY: 90, timeline: across(8, .18, .05, 1) }),
      M('qc-bluetang','דג כחול','Fish_Armature|Swimming_Normal',{ w: .18, rotY: 90, timeline: across(11, -.12, .14, 1) }),
      M('qc-koi','קוי','Fish_Armature|Swimming_Normal',{ w: .24, rotY: -90, timeline: across(10, .36, .09, -1) }),
      P('bubble','בועות',{ count: 40, size: 24, speed: .5, color: '#bfe9ff', color2: '#ffffff', direction: 0, lifetime: 3, life2: 6, fade: true },{ w: .8, h: .9 })]],
    ['dragon','דרקון מעופף','דרקון בשמונה באוויר, מתקרב ומתרחק',[
      M('qu-dragon','דרקון','Fast_Flying',{ w: .45, timeline: path(8, 24, (f) => ({ x: .32 * Math.sin(f * 2 * Math.PI), y: .05 + .18 * Math.sin(f * 4 * Math.PI), z: .18 + .16 * Math.cos(f * 2 * Math.PI), rot: -14 * Math.cos(f * 2 * Math.PI), scale: 1 + .35 * Math.cos(f * 2 * Math.PI) })) }),
      P('sparkle','אבק זהב',{ count: 90, size: 12, speed: .3, color: '#ffd94d', color2: '#fff3b0', direction: -2, lifetime: 1.5, life2: 3, fade: true, endSize: .3 },{ w: .9, h: .7 })]],
    ['party','מסיבת מפלצונים','שלושה מפלצונים רוקדים וקונפטי',[
      ...[['qu-blob_cat','חתול עגול',-.28],['qu-blob_pinkblob','כדור ורוד',0],['qu-blob_dog','כלב עגול',.28]].map(([f,n,x],i) => M(f,n,'Dance',{ w: .24, x, timeline: path(1.2, 6, (ph) => ({ x, y: -.18 + .06 * Math.abs(Math.sin((ph + i / 3) * Math.PI)) })) })),
      P('confetti','קונפטי',{ count: 150, size: 14, speed: .9, color: '#ff4d6d', color2: '#4dc3ff', direction: 180, lifetime: 3, life2: 5 },{ w: 1, h: .5, y: .25 })]],
    ['winter','ערב חורף','אייל ואיילה בשלג',[
      M('q-stag','אייל','Idle',{ w: .42, x: -.16, y: -.18, rotY: 35 }), M('q-deer','איילה','Eating',{ w: .34, x: .2, y: -.24, rotY: -30 }),
      P('snowflake','שלג',{ count: 120, size: 14, speed: .4, color: '#ffffff', color2: '#cfe8ff', direction: 180, lifetime: 5, life2: 9, fade: true },{ w: 1, h: 1 })]],
    ['dino-walk','טיול דינוזאורים','טירנוזאורוס חוצה, אפטוזאורוס מביט',[
      M('qd-trex','טירנוזאורוס','Armature|TRex_Walk',{ w: .4, rotY: 90, timeline: across(12, -.22, .05, 1, .005) }),
      M('qd-apatosaurus','אפטוזאורוס','Armature|Apatosaurus_Idle',{ w: .5, x: .22, y: -.12, rotY: -40 }),
      P('leaf','עלים',{ count: 40, size: 22, speed: .5, color: '#3bb36a', color2: '#f6c343', direction: 180, lifetime: 4, life2: 7, fade: true },{ w: 1, h: .6, y: .2 })]],
    ['shark','כריש מגיע','כריש ששוחה אל הצופה וחוזר',[
      M('qf-shark','כריש','Armature|Swim',{ w: .45, timeline: path(6, 12, (f) => { const k = .5 - .5 * Math.cos(f * 2 * Math.PI); return { x: .05 * Math.sin(f * 4 * Math.PI), y: -.02, z: .02 + .4 * k, scale: 1 + .5 * k }; }) }),
      P('bubble','בועות',{ count: 30, size: 22, speed: .5, color: '#bfe9ff', color2: '#ffffff', direction: 0, lifetime: 3, life2: 6, fade: true },{ w: .7, h: .8 })]],
    ['space','חלל','מערכת שמש, כוכבים ורובוט שמנופף',[
      M('m-solar','מערכת שמש','Loop',{ w: .75, y: .1, z: .05 }), M('qr-robot','רובוט','RobotArmature|Robot_Wave',{ w: .2, x: .3, y: -.3 }),
      P('star','כוכבים',{ count: 80, size: 16, speed: .5, color: '#ffffff', color2: '#ffe680', direction: -3, lifetime: 2, life2: 4, fade: true, endSize: .2 },{ w: 1, h: 1 })]],
    ['birthday','יום הולדת','בלונים עולים וקונפטי',[
      M('m-balloons','בלונים','Loop',{ w: .7, timeline: path(12, 12, (f) => ({ y: -.7 + 1.4 * f, opacity: f < .06 || f > .94 ? 0 : 1 })) }),
      P('confetti','קונפטי',{ count: 150, size: 14, speed: .9, color: '#ff4d6d', color2: '#ffd23f', direction: 180, lifetime: 3, life2: 5 },{ w: 1, h: .6, y: .2 })]]
  ].map(([id,name,detail,parts]) => ({id:'sc-'+id,name,detail:'סצנה בתנועה · '+detail,kind:'scene',parts,thumb:'thumbs/sc-'+id+'.png',group:'scene'}));
  // Floating light effects: 6 s loops on black, keyed by the soft glow key so only the light floats over the artwork.
  // [file id, Hebrew name, start width]
  const effects = [
    ['neon-love','שלט ניאון: אהבה',.6],['neon-mazal','שלט ניאון: מזל טוב',.7],['neon-heart','לב ניאון פועם',.45],['retro-sun','שמש רטרו',.7],
    ['fireworks','זיקוקים',1],['light-rays','קרני אור צבעוניות',.9],['portal','שער קסם',.7],['aurora','זוהר צפוני',1],['flames','להבות',.5],
    ['enso','מעגל מכחול',.6],['plasma','כדור פלזמה',.55],['bauhaus','צורות באוהאוס',.7],['warp','קפיצה לחלל',1]
  ].map(([id,name,w]) => ({id:'fx-'+id,name,detail:'אפקט מרחף · לולאה · ללא צליל',kind:'video',file:'fx/'+id+'.mp4',thumb:'thumbs/fx-'+id+'.jpg',w,chroma:{enabled:true,color:'#000000',threshold:.35},group:'fx'}));
  // The floating effects as 3D models (tools/make-real-models.py, outside this repository): glow is unlit colour in
  // translucent shells, one looping clip "Loop" each: [file id, Hebrew name, start width]
  const fx3d = [
    ['plasma','כדור פלזמה בתלת־ממד',.35],['neon-love','שלט ניאון: אהבה',.5],['neon-mazal','שלט ניאון: מזל טוב',.6],['neon-heart','לב ניאון פועם',.4],
    ['retro-sun','שמש רטרו ורשת',.6],['fireworks','זיקוקים',.7],['light-rays','קרני אור צבעוניות',.7],['portal','שער קסם מאבן',.5],
    ['aurora','זוהר צפוני',.8],['flames','מדורה',.45],['enso','מעגל מכחול',.5],['bauhaus','צורות באוהאוס',.65],['warp','קפיצה לחלל',.7]
  ].map(([id,name,w]) => ({id:'fx3d-'+id,name,detail:'אפקט בתלת־ממד · לולאה',kind:'model',file:'models/fx3d-'+id+'.glb',thumb:'thumbs/fx3d-'+id+'.png',clip:'Loop',w,group:'fx3d'}));
  // Weather and cosmic effects as 3D models, built the same way (clouds are whole metaball shapes with a soft skin)
  const w3d = [
    ['w-sun','שמש זורחת',.5],['w-partly','שמש ועננים',.55],['w-clouds','עננים נודדים',.8],['w-raincloud','ענן גשם',.5],['w-rain','גשם',.8],
    ['w-storm','סערה וברקים',.7],['w-lightning','ברקים',.6],['w-hail','ברד',.5],['w-snow','שלג',.8],['w-rainbow','קשת בענן',.7],
    ['w-wind','רוח ועלים',.8],['w-fog','ערפל',.8],['w-tornado','טורנדו',.45],['w-night','לילה עם ירח',.7]
  ].map(([id,name,w]) => ({id:'fx3d-'+id,name,detail:'מזג אוויר בתלת־ממד · לולאה',kind:'model',file:'models/fx3d-'+id+'.glb',thumb:'thumbs/fx3d-'+id+'.png',clip:'Loop',w,group:'w3d'}));
  const k3d = [
    ['k-tornado','מערבולת חלקיקים',.5],['k-saturn','שבתאי מחלקיקים',.65],['k-blackhole','חור שחור ודיסקת אור',.6],['k-globe','גלובוס נקודות',.45],
    ['k-galaxy','גלקסיה ספירלית',.7],['k-dna','סליל DNA',.3],['k-gyro','טבעות מסתובבות',.5],['k-sphere','כדור חלקיקים נושם',.45],
    ['k-terrain','נוף קווים',.9],['k-constellation','קבוצת כוכבים',.7],['k-orb','כדור קוסמי',.45],['k-fibres','מנורת סיבים אופטיים',.45]
  ].map(([id,name,w]) => ({id:'fx3d-'+id,name,detail:'חלל בתלת־ממד · לולאה',kind:'model',file:'models/fx3d-'+id+'.glb',thumb:'thumbs/fx3d-'+id+'.png',clip:'Loop',w,group:'k3d'}));
  // Weather, same kind of keyed loop (clouds 15 s, fog 12 s, the rest 6 s): [file id, Hebrew name, start width]
  const weather = [
    ['w-sun','שמש זורחת',.6],['w-partly','שמש ועננים',.7],['w-clouds','עננים נודדים',1],['w-raincloud','ענן גשם',.6],['w-rain','גשם',1],
    ['w-storm','סערה וברקים',1],['w-lightning','ברקים',.9],['w-hail','ברד',1],['w-snow','שלג',1],['w-rainbow','קשת בענן',.8],
    ['w-wind','רוח ועלים',1],['w-fog','ערפל',1],['w-tornado','טורנדו',.6],['w-night','לילה עם ירח',.8]
  ].map(([id,name,w]) => ({id:'fx-'+id,name,detail:'מזג אוויר · לולאה · ללא צליל',kind:'video',file:'fx/'+id+'.mp4',thumb:'thumbs/fx-'+id+'.jpg',w,chroma:{enabled:true,color:'#000000',threshold:.35},group:'weather'}));
  // Cosmic / particle effects, same kind of keyed loop (8-12 s): thousands of points drawn in 3D (tools/cosmic-fx.js)
  const cosmic = [
    ['k-tornado','מערבולת חלקיקים',.6],['k-saturn','שבתאי מחלקיקים',.8],['k-blackhole','חור שחור ודיסקת אור',.8],['k-globe','גלובוס נקודות',.6],
    ['k-galaxy','גלקסיה ספירלית',.8],['k-dna','סליל DNA',.45],['k-gyro','טבעות מסתובבות',.6],['k-sphere','כדור חלקיקים נושם',.55],
    ['k-terrain','נוף קווים',1],['k-constellation','קבוצת כוכבים',.8],['k-orb','כדור קוסמי',.55],['k-fibres','סיבי אור',.8]
  ].map(([id,name,w]) => ({id:'fx-'+id,name,detail:'חלל וחלקיקים · לולאה · ללא צליל',kind:'video',file:'fx/'+id+'.mp4',thumb:'thumbs/fx-'+id+'.jpg',w,chroma:{enabled:true,color:'#000000',threshold:.35},group:'cosmic'}));
  const entries = [...originals, ...scenes, ...effects, ...fx3d, ...weather, ...w3d, ...cosmic, ...k3d, ...made, ...models, ...animated, ...particleStyles, ...stickers, ...loops];
  const groups = [['all','הכול'],['scene','סצנות בתנועה'],['fx','אפקטים מרחפים'],['fx3d','אפקטים בתלת־ממד'],['weather','מזג אוויר'],['w3d','מזג אוויר בתלת־ממד'],['cosmic','חלל וחלקיקים'],['k3d','חלל בתלת־ממד'],['made','מקוריים בתנועה'],['model','תלת־ממד'],['animal','חיות בתנועה'],['sea','ים'],['dino','דינוזאורים'],['creature','דמויות'],['particles','חלקיקים'],['sticker','מדבקות'],['loop','לולאות וידאו'],['original','מקוריים']];
  const MIME = {glb:'model/gltf-binary',mp4:'video/mp4',png:'image/png',gif:'image/gif',wav:'audio/wav'};
  async function open(importAsset) {
    const dialog = document.createElement('dialog'); dialog.id='starter-library'; dialog.dir='rtl';
    const head=document.createElement('div');head.className='library-head';
    const title=document.createElement('h2');title.textContent='ספריית התחלה';
    const close=document.createElement('button');close.textContent='סגירה';close.className='ghost';close.onclick=()=>dialog.close();
    head.append(title,close);dialog.append(head);
    const note=document.createElement('p');note.className='hint';note.textContent=entries.length+' פריטים. נגיעה בפריט מוסיפה אותו ליצירה: מודלים חינמיים (CC0), גם בתנועה, אפקטים מרחפים, מזג אוויר, חלקיקים, מדבקות, לולאות מהסטודיו שלך ופריטים מקוריים. נשמרים עם היצירה במכשיר, בלי חשבון ובלי תשלום.';dialog.append(note);
    const filters=document.createElement('div');filters.className='library-filters';filters.setAttribute('role','group');filters.setAttribute('aria-label','סוג פריט');dialog.append(filters);
    const grid=document.createElement('div');grid.className='library-grid';dialog.append(grid);
    const status=document.createElement('p');status.setAttribute('role','status');dialog.append(status);
    let busy=false;
    // The whole card is the add button: one tap on the picture adds the item.
    for(const item of entries){
      const card=document.createElement('button');card.type='button';card.className='library-card';card.dataset.group=item.group;
      card.setAttribute('aria-label','הוספת '+item.name);card.dataset.libraryId=item.id;
      const visual=document.createElement('span');visual.className='library-thumb';
      if(item.thumb){const im=document.createElement('img');im.src='library/'+item.thumb;im.alt='';im.loading='lazy';visual.append(im);}else visual.textContent=item.icon;
      const name=document.createElement('span');name.className='library-name';name.textContent=item.name;const detail=document.createElement('span');detail.className='hint';detail.textContent=item.detail;
      const add=card;
      add.onclick=async()=>{
        if(busy)return;busy=true;grid.querySelectorAll('button').forEach(b=>b.disabled=true);status.textContent='טוען את הפריט…';
        try{
          if(item.kind==='scene'){
            const parts=await Promise.all(item.parts.map(async(pt)=>{const r=await fetch('library/'+pt.file);if(!r.ok)throw Error('download');const b=await r.blob(),base=pt.file.split('/').pop();return Object.assign({},pt,{blob:new File([b],base,{type:MIME[base.split('.').pop()]||b.type})});}));
            await importAsset('scene',{parts},{name:item.name});dialog.close();return;
          }
          const response=await fetch('library/'+item.file);if(!response.ok)throw Error('download');
          const blob=await response.blob(),base=item.file.split('/').pop(),type=MIME[base.split('.').pop()]||blob.type;
          await importAsset(item.kind,new File([blob],base,{type}),{name:item.name,loop:item.kind!=='sound',clip:item.clip,w:item.w,particles:item.particles,chroma:item.chroma});
          dialog.close();
        }catch(e){status.textContent='הפריט לא נטען. אפשר לנסות שוב.';}
        finally{busy=false;grid.querySelectorAll('button').forEach(b=>b.disabled=false);}
      };
      card.append(visual,name,detail);grid.append(card);
    }
    const show=(g)=>{filters.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.group===g)));grid.querySelectorAll('.library-card').forEach(c=>{c.hidden=g!=='all'&&c.dataset.group!==g;});};
    for(const [g,label] of groups){const b=document.createElement('button');b.type='button';b.className='ghost';b.dataset.group=g;b.textContent=label+' ('+(g==='all'?entries.length:entries.filter(e=>e.group===g).length)+')';b.onclick=()=>show(g);filters.append(b);}
    show('all');
    dialog.addEventListener('close',()=>dialog.remove(),{once:true});document.body.append(dialog);dialog.showModal();close.focus();
  }
  return {open,entries};
})();
