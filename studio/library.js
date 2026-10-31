/* Starter library. Selection copies an asset into the current local experience, so export/import does not
   depend on a future catalog fetch. Three groups: the original items, CC0 3D models from Poly Haven (packed to
   GLB at 1K textures), and video loops rendered from the user's own Styles studio (720×720, with music).
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
  const entries = [...originals, ...models, ...loops];
  const groups = [['all','הכול'],['model','תלת־ממד'],['loop','לולאות וידאו'],['original','מקוריים']];
  const MIME = {glb:'model/gltf-binary',mp4:'video/mp4',png:'image/png',gif:'image/gif',wav:'audio/wav'};
  async function open(importAsset) {
    const dialog = document.createElement('dialog'); dialog.id='starter-library'; dialog.dir='rtl';
    const head=document.createElement('div');head.className='library-head';
    const title=document.createElement('h2');title.textContent='ספריית התחלה';
    const close=document.createElement('button');close.textContent='סגירה';close.className='ghost';close.onclick=()=>dialog.close();
    head.append(title,close);dialog.append(head);
    const note=document.createElement('p');note.className='hint';note.textContent=entries.length+' פריטים לשימוש ולעריכה ביצירה שלך: מודלים חינמיים (CC0), לולאות מהסטודיו שלך ופריטים מקוריים. נשמרים עם היצירה במכשיר, בלי חשבון ובלי תשלום.';dialog.append(note);
    const filters=document.createElement('div');filters.className='library-filters';filters.setAttribute('role','group');filters.setAttribute('aria-label','סוג פריט');dialog.append(filters);
    const grid=document.createElement('div');grid.className='library-grid';dialog.append(grid);
    const status=document.createElement('p');status.setAttribute('role','status');dialog.append(status);
    let busy=false;
    for(const item of entries){
      const card=document.createElement('article');card.className='library-card';card.dataset.group=item.group;
      const visual=document.createElement('div');visual.className='library-thumb';
      if(item.thumb){const im=document.createElement('img');im.src='library/'+item.thumb;im.alt='';im.loading='lazy';visual.append(im);}else visual.textContent=item.icon;
      const name=document.createElement('h3');name.textContent=item.name;const detail=document.createElement('p');detail.className='hint';detail.textContent=item.detail;
      const add=document.createElement('button');add.textContent='הוספה ליצירה';add.setAttribute('aria-label','הוספת '+item.name);add.dataset.libraryId=item.id;
      add.onclick=async()=>{
        if(busy)return;busy=true;grid.querySelectorAll('button').forEach(b=>b.disabled=true);status.textContent='טוען את הפריט…';
        try{
          const response=await fetch('library/'+item.file);if(!response.ok)throw Error('download');
          const blob=await response.blob(),base=item.file.split('/').pop(),type=MIME[base.split('.').pop()]||blob.type;
          await importAsset(item.kind,new File([blob],base,{type}),{name:item.name,loop:item.kind!=='sound'});
          dialog.close();
        }catch(e){status.textContent='הפריט לא נטען. אפשר לנסות שוב.';}
        finally{busy=false;grid.querySelectorAll('button').forEach(b=>b.disabled=false);}
      };
      card.append(visual,name,detail,add);grid.append(card);
    }
    const show=(g)=>{filters.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.group===g)));grid.querySelectorAll('.library-card').forEach(c=>{c.hidden=g!=='all'&&c.dataset.group!==g;});};
    for(const [g,label] of groups){const b=document.createElement('button');b.type='button';b.className='ghost';b.dataset.group=g;b.textContent=label+' ('+(g==='all'?entries.length:entries.filter(e=>e.group===g).length)+')';b.onclick=()=>show(g);filters.append(b);}
    show('all');
    dialog.addEventListener('close',()=>dialog.remove(),{once:true});document.body.append(dialog);dialog.showModal();close.focus();
  }
  return {open,entries};
})();
