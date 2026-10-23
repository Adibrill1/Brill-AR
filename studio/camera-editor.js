/* Local creator-only transform panel. Public remote experiences never call this.
   Editing is a separate mode: no recording or viewer tap actions, no auto-save/upload. */
window.CameraEditor = {
  mount({rec,container,scene,isAR}) {
    const panel=document.createElement('section');panel.id='camera-edit-panel';panel.dir='rtl';
    panel.style.cssText='position:fixed;bottom:12px;left:12px;right:12px;box-sizing:border-box;margin:auto;max-width:520px;padding:12px;background:#fff;color:#17202b;border-radius:14px;z-index:10001;font:14px/1.5 sans-serif;box-shadow:0 3px 22px #0005';
    const title=document.createElement('strong');title.textContent='עריכה מקומית · מוצג הפריט הנבחר בלבד';panel.append(title);
    const status=document.createElement('p');status.id='camera-edit-status';status.style.margin='4px 0 8px';document.querySelectorAll('#seq-dots,#seq-toast,#hint').forEach(n=>n.hidden=true);status.textContent=isAR?'כווני את המצלמה ליצירה. השינויים אינם נשמרים עד לחיצה על שמירה.':'בדיקת בקרי עריכה בלי מצלמה. שינויים נשמרים במכשיר בלבד.';panel.append(status);
    const select=document.createElement('select');select.id='camera-edit-select';select.style.cssText='width:100%;padding:8px;font:inherit';select.setAttribute('aria-label','אלמנט לעריכה');
    const elements=Studio.topLevelElements(rec).filter(el=>container.querySelector('[data-el-id="'+el.id+'"]'));
    for(const el of elements){const option=document.createElement('option');option.value=el.id;option.textContent=el.name||el.type;select.append(option);}panel.append(select);
    const fields=document.createElement('div');fields.style.cssText='display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin:8px 0';panel.append(fields);
    const inputs={},initial=structuredClone(rec),baseWidths=new Map(elements.map(el=>[el.id,el.w||.3]));let dirty=false,tracked=!isAR;
    const range={x:[-2,2,.01],y:[-2,2,.01],w:[.02,4,.01],z:[-.5,2,.01],rot:[-360,360,1]};
    for(const[key,label]of Object.entries({x:'ימינה / שמאלה',y:'למעלה / למטה',w:'רוחב',z:'עומק',rot:'סיבוב'})){
      const l=document.createElement('label');l.textContent=label;l.style.cssText='font-size:12px;min-width:0';const input=document.createElement('input');input.type='number';input.id='camera-edit-'+key;input.min=range[key][0];input.max=range[key][1];input.step=range[key][2];input.style.cssText='width:100%;box-sizing:border-box;min-width:0;padding:7px;direction:ltr;font:inherit';l.append(input);fields.append(l);inputs[key]=input;
      input.onchange=()=>{const el=elements.find(e=>e.id===select.value),n=Number(input.value);if(!el||!Number.isFinite(n))return;const previousWidth=el.w;const value=Math.min(range[key][1],Math.max(range[key][0],n));if(el.type==='group')Studio.transformGroup(rec,el,{[key]:value});else{el[key]=value;if(key==='w'&&previousWidth>0&&el.h!=null)el.h*=el.w/previousWidth;}input.value=el[key];dirty=true;apply(el);status.textContent='שינויים לא נשמרו. לחצי שמירה כדי לשמור רק במכשיר.';};
    }
    const apply=el=>{const old=container.querySelector('[data-el-id="'+el.id+'"]');if(!old)return;const fresh=Studio.buildElementEntity(rec,el,rec.elements.indexOf(el),'preview');[fresh,...fresh.querySelectorAll('[animation__spin],[animation__float],[animation__pulse],[model-clips]')].forEach(n=>{n.removeAttribute('animation__spin');n.removeAttribute('animation__float');n.removeAttribute('animation__pulse');n.removeAttribute('model-clips');});old.replaceWith(fresh);};
    const fill=()=>{for(const item of elements){const n=container.querySelector('[data-el-id="'+item.id+'"]');if(n)n.object3D.visible=item.id===select.value;}const el=elements.find(e=>e.id===select.value);for(const k of Object.keys(inputs))inputs[k].value=el?(el[k]||0):'';};select.onchange=fill;fill();
    const row=document.createElement('div');row.style.cssText='display:flex;gap:8px';panel.append(row);
    const save=document.createElement('button');save.id='camera-edit-save';save.textContent='שמירה במכשיר';
    const reset=document.createElement('button');reset.id='camera-edit-reset';reset.textContent='ביטול שינויים';
    for(const b of [save,reset]){b.style.cssText='flex:1;padding:10px;border:1px solid #777;border-radius:9px;font:inherit;background:#fff;color:#17202b';row.append(b);}
    const gate=()=>{for(const i of Object.values(inputs))i.disabled=!tracked||!elements.length;save.disabled=!tracked||!elements.length;};
    save.onclick=async()=>{save.disabled=true;try{await Studio.save(rec);initial.elements=structuredClone(rec.elements);dirty=false;status.textContent='נשמר במכשיר. לא פורסם ולא נשלח לשרת.';}catch(e){status.textContent='השמירה נכשלה. השינויים עדיין לא נשמרו.';}finally{gate();}};
    reset.onclick=()=>{for(const el of rec.elements){const old=initial.elements.find(e=>e.id===el.id);for(const k of [...Object.keys(inputs),'h'])el[k]=old[k];}for(const el of elements)apply(el);dirty=false;fill();status.textContent='השינויים שלא נשמרו בוטלו.';};
    if(isAR){scene.addEventListener('xrimagefound',()=>{tracked=true;gate();status.textContent=dirty?'שינויים לא נשמרו. לחצי שמירה.':'היצירה מזוהה. בחרי אלמנט וערכי את המספרים.';});scene.addEventListener('xrimagelost',()=>{tracked=false;gate();status.textContent='היצירה לא מזוהה כרגע. כווני אליה שוב כדי להמשיך.';});}
    window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
    document.body.append(panel);gate();return {panel};
  }
};
