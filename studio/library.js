/* Small original starter library. Selection copies an asset into the current local
   experience, so export/import does not depend on a future catalog fetch. */
window.StarterLibrary = (() => {
  const entries = [
    {id:'star',name:'כוכב זהוב',detail:'תמונה שקופה · PNG',kind:'image',file:'star.png',thumb:'star.png'},
    {id:'ring',name:'טבעת סגולה',detail:'תמונה שקופה · PNG',kind:'image',file:'ring.png',thumb:'ring.png'},
    {id:'pulse',name:'טבעת פועמת',detail:'אנימציה שקופה · GIF',kind:'image',file:'pulse.gif',thumb:'pulse.gif'},
    {id:'bell',name:'פעמון עדין',detail:'צליל מקורי · 1.2 שניות',kind:'sound',file:'bell.wav',icon:'♪'},
    {id:'orbit',name:'מסלול אור',detail:'סרטון מקורי · 2 שניות · ללא צליל',kind:'video',file:'orbit.mp4',thumb:'orbit-poster.png'},
    {id:'gem',name:'אבן סגולה',detail:'תלת-ממד · GLB',kind:'model',file:'gem.glb',icon:'◇'}
  ];
  async function open(importAsset) {
    const dialog = document.createElement('dialog'); dialog.id='starter-library'; dialog.dir='rtl';
    const head=document.createElement('div');head.className='library-head';
    const title=document.createElement('h2');title.textContent='ספריית התחלה';
    const close=document.createElement('button');close.textContent='סגירה';close.className='ghost';close.onclick=()=>dialog.close();
    head.append(title,close);dialog.append(head);
    const note=document.createElement('p');note.className='hint';note.textContent='שישה פריטים מקוריים לשימוש ולעריכה ביצירה שלך. נשמרים עם הניסוי במכשיר, בלי חשבון ובלי תשלום.';dialog.append(note);
    const grid=document.createElement('div');grid.className='library-grid';dialog.append(grid);
    const status=document.createElement('p');status.setAttribute('role','status');dialog.append(status);
    let busy=false;
    for(const item of entries){
      const card=document.createElement('article');card.className='library-card';
      const visual=document.createElement('div');visual.className='library-thumb';
      if(item.thumb){const im=document.createElement('img');im.src='library/'+item.thumb;im.alt='';visual.append(im);}else visual.textContent=item.icon;
      const name=document.createElement('h3');name.textContent=item.name;const detail=document.createElement('p');detail.className='hint';detail.textContent=item.detail;
      const add=document.createElement('button');add.textContent='הוספה ליצירה';add.setAttribute('aria-label','הוספת '+item.name);add.dataset.libraryId=item.id;
      add.onclick=async()=>{
        if(busy)return;busy=true;grid.querySelectorAll('button').forEach(b=>b.disabled=true);status.textContent='טוען את הפריט…';
        try{
          const response=await fetch('library/'+item.file);if(!response.ok)throw Error('download');
          const blob=await response.blob();await importAsset(item.kind,new File([blob],item.file,{type:blob.type}),{name:item.name,loop:item.kind!=='sound'});
          dialog.close();
        }catch(e){status.textContent='הפריט לא נטען. אפשר לנסות שוב.';}
        finally{busy=false;grid.querySelectorAll('button').forEach(b=>b.disabled=false);}
      };
      card.append(visual,name,detail,add);grid.append(card);
    }
    dialog.addEventListener('close',()=>dialog.remove(),{once:true});document.body.append(dialog);dialog.showModal();close.focus();
  }
  return {open,entries};
})();
