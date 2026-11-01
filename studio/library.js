/* Starter library. Selection copies an asset into the current local experience, so export/import does not
   depend on a future catalog fetch. Groups: the original items, CC0 3D models from Poly Haven (packed to
   GLB at 1K textures), animated CC0 models by Quaternius, particle styles and stickers drawn in code
   (tools/make-graphics.cjs), and video loops rendered from the user's own Styles studio (720×720, with music).
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
    ['football','כדור כדורגל ישן'],['armchair_01','כורסה ויקטוריאנית']
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
  ].map(([id,name,clip,w]) => ({id,name,detail:'תלת־ממד בתנועה · חינמי (CC0)',kind:'model',file:'models/'+id+'.glb',thumb:'thumbs/'+id+'.png',clip,w,group:'animated'}));
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
  const entries = [...originals, ...models, ...animated, ...particleStyles, ...stickers, ...loops];
  const groups = [['all','הכול'],['model','תלת־ממד'],['animated','בתנועה'],['particles','חלקיקים'],['sticker','מדבקות'],['loop','לולאות וידאו'],['original','מקוריים']];
  const MIME = {glb:'model/gltf-binary',mp4:'video/mp4',png:'image/png',gif:'image/gif',wav:'audio/wav'};
  async function open(importAsset) {
    const dialog = document.createElement('dialog'); dialog.id='starter-library'; dialog.dir='rtl';
    const head=document.createElement('div');head.className='library-head';
    const title=document.createElement('h2');title.textContent='ספריית התחלה';
    const close=document.createElement('button');close.textContent='סגירה';close.className='ghost';close.onclick=()=>dialog.close();
    head.append(title,close);dialog.append(head);
    const note=document.createElement('p');note.className='hint';note.textContent=entries.length+' פריטים. נגיעה בפריט מוסיפה אותו ליצירה: מודלים חינמיים (CC0), גם בתנועה, חלקיקים, מדבקות, לולאות מהסטודיו שלך ופריטים מקוריים. נשמרים עם היצירה במכשיר, בלי חשבון ובלי תשלום.';dialog.append(note);
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
          const response=await fetch('library/'+item.file);if(!response.ok)throw Error('download');
          const blob=await response.blob(),base=item.file.split('/').pop(),type=MIME[base.split('.').pop()]||blob.type;
          await importAsset(item.kind,new File([blob],base,{type}),{name:item.name,loop:item.kind!=='sound',clip:item.clip,w:item.w,particles:item.particles});
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
