/* Local creator-only transform panel. Public remote experiences never call this.
   Editing is a separate mode: no recording or viewer tap actions, no auto-save/upload. */
window.CameraEditor = {
  mount({rec,container,scene,isAR,composition=false,editKeys=null,selectedLayer=null,saveChanges=null,heading=null}) {
    container.setAttribute('data-studio-editing','');
    const panel=document.createElement('section');panel.id='camera-edit-panel';panel.dir='rtl';
    panel.style.cssText='position:fixed;bottom:12px;left:12px;right:12px;box-sizing:border-box;margin:auto;max-width:520px;padding:12px;background:#fff;color:#17202b;border-radius:14px;z-index:10001;font:14px/1.5 sans-serif;box-shadow:0 3px 22px #0005';
    const title=document.createElement('strong');title.textContent=heading||(composition?'עריכת מיקום בתלת־ממד · ההרכב כולו מוצג':'עריכה מקומית · מוצג הפריט הנבחר בלבד');panel.append(title);
    if(composition){const collapse=document.createElement('button');collapse.id='camera-edit-collapse';collapse.textContent='הקטנת לוח הבקרה';collapse.style.cssText='float:left;margin:0 4px 6px;padding:5px;background:white;border:1px solid #aaa;border-radius:6px';panel.append(collapse);let folded=false;collapse.onclick=()=>{folded=!folded;for(const child of panel.children)if(child!==title&&child!==collapse){if(folded){child.dataset.previousDisplay=child.style.display;child.style.display='none';}else child.style.display=child.dataset.previousDisplay||'';}collapse.textContent=folded?'פתיחת לוח הבקרה':'הקטנת לוח הבקרה';};}
    const status=document.createElement('p');status.id='camera-edit-status';status.style.margin='4px 0 8px';document.querySelectorAll('#seq-dots,#seq-toast,#hint').forEach(n=>n.hidden=true);status.textContent=isAR?'כווני את המצלמה ליצירה. השינויים אינם נשמרים עד לחיצה על שמירה.':'בדיקת בקרי עריכה בלי מצלמה. שינויים נשמרים במכשיר בלבד.';panel.append(status);
    const select=document.createElement('select');select.id='camera-edit-select';select.style.cssText='width:100%;padding:8px;font:inherit';select.setAttribute('aria-label','אלמנט לעריכה');
    const elements=Studio.topLevelElements(rec).filter(el=>container.querySelector('[data-el-id="'+el.id+'"]'));
    for(const el of elements){const option=document.createElement('option');option.value=el.id;option.textContent=el.name||el.type;select.append(option);}panel.append(select);
    const fields=document.createElement('div');fields.style.cssText='display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin:8px 0';panel.append(fields);
    const inputs={},initial=structuredClone(rec);let dirty=false,tracked=!isAR;
    let dragEnabled=true,showAll=composition,helper=null,spheres=[];
    if(composition){
      const controls=document.createElement('div');controls.style.cssText='display:flex;gap:14px;flex-wrap:wrap';panel.append(controls);
      for(const [text,value,change]of [['הצגת כל הפריטים',true,v=>{showAll=v;fill();}],['גרירת הפריט (כבוי = סיבוב המבט)',true,v=>dragEnabled=v]]){
        const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.checked=value;input.onchange=()=>change(input.checked);label.append(input,document.createTextNode(text));controls.append(label);
      }
    }
    const highlight=()=>{for(const sphere of spheres){sphere.parent?.remove(sphere);sphere.geometry.dispose();sphere.material.dispose();}spheres=[];if(helper){scene.object3D.remove(helper);helper.geometry.dispose();helper.material.dispose();helper=null;}if(!composition)return;const n=container.querySelector('[data-el-id="'+select.value+'"]');if(n){scene.object3D.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(n.object3D);if(box.isEmpty()){const point=new THREE.Vector3();n.object3D.getWorldPosition(point);box.setFromCenterAndSize(point,new THREE.Vector3(.025,.025,.025));}helper=new THREE.Box3Helper(box,0xff8800);helper.material.depthTest=false;helper.renderOrder=10000;scene.object3D.add(helper);const el=elements.find(e=>e.id===select.value);if(el&&el.type==='sound'&&el.spatial){const d=Studio.audioDistances(el);for(const [radius,color]of [[d.inner,0x00aadd],[d.outer,0xdd00dd]]){const sphere=new THREE.Mesh(new THREE.SphereGeometry(radius,24,12),new THREE.MeshBasicMaterial({color,wireframe:true,transparent:true,opacity:.25,depthWrite:false}));n.object3D.add(sphere);sphere.raycast=()=>{};spheres.push(sphere);}}}};
    const range={x:[-2,2,.01],y:[-2,2,.01],w:[.02,4,.01],z:[-.5,2,.01],rot:[-360,360,1],rotX:[-180,180,1],rotY:[-180,180,1]};
    for(const[key,label]of Object.entries({x:'ימינה / שמאלה',y:'למעלה / למטה',w:'רוחב',z:'עומק',rot:'סיבוב במישור',...(composition?{rotX:'הטיה אופקית',rotY:'הטיה אנכית'}:{})})){
      const l=document.createElement('label');l.textContent=label;l.style.cssText='font-size:12px;min-width:0';const input=document.createElement('input');input.type='number';input.id='camera-edit-'+key;input.min=range[key][0];input.max=range[key][1];input.step=range[key][2];input.style.cssText='width:100%;box-sizing:border-box;min-width:0;padding:7px;direction:ltr;font:inherit';l.append(input);fields.append(l);inputs[key]=input;if(editKeys&&!editKeys.includes(key))l.hidden=true;
      input.onchange=()=>{const el=elements.find(e=>e.id===select.value),n=Number(input.value);if(!el||!Number.isFinite(n))return;const previousWidth=el.w;const value=Math.min(range[key][1],Math.max(range[key][0],n));if(el.type==='group')Studio.transformGroup(rec,el,{[key]:value});else{el[key]=value;if(key==='w'&&previousWidth>0&&el.h!=null)el.h*=el.w/previousWidth;}input.value=el[key];dirty=true;apply(el);highlight();status.textContent='שינויים לא נשמרו. לחצי שמירה כדי לשמור רק במכשיר.';};
    }
    if(composition){const audio=document.createElement('div');audio.id='camera-audio-radii';audio.style.cssText='display:flex;gap:8px;flex-wrap:wrap';panel.append(audio);
      for(const [key,label,min,max]of [['spatialInner','רדיוס פנימי (תכלת)',.05,5],['spatialOuter','רדיוס חיצוני (סגול)',.1,20]]){const l=document.createElement('label'),i=document.createElement('input');l.textContent=label;i.type='number';i.step='.05';i.min=min;i.max=max;i.id='camera-edit-'+key;i.style.width='70px';l.append(i);audio.append(l);i.onchange=()=>{const el=elements.find(e=>e.id===select.value);if(!el||el.type!=='sound')return;el[key]=Math.max(min,Math.min(max,Number(i.value)||min));const d=Studio.audioDistances(el);el.spatialInner=d.inner;el.spatialOuter=d.outer;dirty=true;fill();status.textContent='רדיוס עודכן, עדיין לא נשמר. במצב מעריכי אין השתקה מלאה מחוץ לסגול.';};}
    }
    const apply=el=>{const old=container.querySelector('[data-el-id="'+el.id+'"]');if(!old)return;const fresh=Studio.buildElementEntity(rec,el,rec.elements.indexOf(el),'preview');[fresh,...fresh.querySelectorAll('[animation__spin],[animation__float],[animation__pulse],[model-clips]')].forEach(n=>{n.removeAttribute('animation__spin');n.removeAttribute('animation__float');n.removeAttribute('animation__pulse');n.removeAttribute('model-clips');});old.replaceWith(fresh);[fresh,...fresh.querySelectorAll('[data-el-id]')].forEach(n=>{if(n.dataset.opacity)Studio.applyOpacity(n,Number(n.dataset.opacity));n.object3D.visible=true;});};
    const fill=()=>{for(const item of elements){const n=container.querySelector('[data-el-id="'+item.id+'"]');if(n){n.object3D.visible=showAll||item.id===select.value;if(showAll||item.id===select.value)n.querySelectorAll('[data-el-id]').forEach(ch=>ch.object3D.visible=true);}}const el=elements.find(e=>e.id===select.value);for(const k of Object.keys(inputs))inputs[k].value=el?Math.round((el[k]||0)*10000)/10000:'';if(composition){const a=document.getElementById('camera-audio-radii')||panel.querySelector('#camera-audio-radii');if(a){a.hidden=!el||el.type!=='sound'||!el.spatial;a.style.display=a.hidden?'none':'flex';if(el){const d=Studio.audioDistances(el);panel.querySelector('#camera-edit-spatialInner').value=d.inner;panel.querySelector('#camera-edit-spatialOuter').value=d.outer;}}}highlight();};select.onchange=fill;if(selectedLayer){select.value=selectedLayer;select.disabled=true;}fill();
    const row=document.createElement('div');row.style.cssText='display:flex;gap:8px';panel.append(row);
    const save=document.createElement('button');save.id='camera-edit-save';save.textContent='שמירה במכשיר';
    const reset=document.createElement('button');reset.id='camera-edit-reset';reset.textContent='ביטול שינויים';
    for(const b of [save,reset]){b.style.cssText='flex:1;padding:10px;border:1px solid #777;border-radius:9px;font:inherit;background:#fff;color:#17202b';row.append(b);}
    const gate=()=>{for(const i of Object.values(inputs))i.disabled=!tracked||!elements.length;save.disabled=!tracked||!elements.length;};
    save.onclick=async()=>{save.disabled=true;try{if(saveChanges)await saveChanges(rec);else await Studio.save(rec);initial.elements=structuredClone(rec.elements);dirty=false;status.textContent=saveChanges?'יעד הפעולה נשמר במכשיר. מיקום הבסיס לא השתנה. לא פורסם.':'נשמר במכשיר. לא פורסם ולא נשלח לשרת.';}catch(e){status.textContent='השמירה נכשלה. השינויים עדיין לא נשמרו.';}finally{gate();}};
    reset.onclick=()=>{for(const el of rec.elements){const old=initial.elements.find(e=>e.id===el.id);for(const k of [...Object.keys(inputs),'h','spatialInner','spatialOuter'])el[k]=old[k];if(old.timeline)el.timeline=structuredClone(old.timeline);else delete el.timeline;}for(const el of elements)apply(el);dirty=false;fill();status.textContent='השינויים שלא נשמרו בוטלו.';};
    if(isAR){scene.addEventListener('xrimagefound',()=>{tracked=true;gate();status.textContent=dirty?'שינויים לא נשמרו. לחצי שמירה.':'היצירה מזוהה. בחרי אלמנט וערכי את המספרים.';});scene.addEventListener('xrimagelost',()=>{tracked=false;gate();status.textContent='היצירה לא מזוהה כרגע. כווני אליה שוב כדי להמשיך.';});}
    // Selected-only drag on the target plane. Never starts from panel controls or
    // outside the selected mesh, and freezes/cancels when tracking is lost.
    let drag=null;
    const pointerPoint = e => {
      if(!scene.canvas||!scene.camera)return null;
      const rect=scene.canvas.getBoundingClientRect(),ray=new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),scene.camera);
      return ray;
    };
    const down=e=>{
      if(!tracked||!dragEnabled||panel.contains(e.target))return;
      const el=elements.find(x=>x.id===select.value),node=el&&container.querySelector('[data-el-id="'+el.id+'"]'),ray=pointerPoint(e);
      if(!node||!ray)return;
      scene.object3D.updateMatrixWorld(true);
      if(!ray.intersectObject(node.object3D,true).length)return;
      const normal=new THREE.Vector3(0,0,1).transformDirection(container.object3D.matrixWorld),center=new THREE.Vector3();
      node.object3D.getWorldPosition(center);const plane=new THREE.Plane().setFromNormalAndCoplanarPoint(normal,center),hit=new THREE.Vector3();
      if(!ray.ray.intersectPlane(plane,hit))return;
      container.object3D.worldToLocal(hit);drag={id:e.pointerId,el,plane,start:hit.clone(),x:el.x||0,y:el.y||0};
      if(scene.canvas.setPointerCapture)scene.canvas.setPointerCapture(e.pointerId);e.preventDefault();
    };
    const move=e=>{
      if(!drag||drag.id!==e.pointerId||!tracked)return;
      const ray=pointerPoint(e),hit=new THREE.Vector3();if(!ray||!ray.ray.intersectPlane(drag.plane,hit))return;
      container.object3D.worldToLocal(hit);const g=Studio.geom(rec),x=Math.min(2,Math.max(-2,drag.x+(hit.x-drag.start.x)/g.artW)),y=Math.min(2,Math.max(-2,drag.y+(hit.y-drag.start.y)/g.artH));
      if(drag.el.type==='group')Studio.transformGroup(rec,drag.el,{x,y});else Object.assign(drag.el,{x,y});
      dirty=true;apply(drag.el);fill();status.textContent='שינויים לא נשמרו. לחצי שמירה.';e.preventDefault();
    };
    const end=()=>{drag=null;};
    scene.addEventListener('loaded',highlight);setTimeout(highlight,300);
    if(composition){const frame=()=>{if(!panel.isConnected)return;const n=container.querySelector('[data-el-id="'+select.value+'"]');if(helper&&n&&!spheres.length){scene.object3D.updateMatrixWorld(true);helper.box.setFromObject(n.object3D);}requestAnimationFrame(frame);};requestAnimationFrame(frame);}
    scene.addEventListener('xrimagelost',end);
    // Scene may be mounted before its renderer/canvas exists.
    const bindDrag=()=>{if(!scene.canvas||scene.canvas._cameraEditDrag)return;scene.canvas._cameraEditDrag=true;scene.canvas.style.touchAction='none';scene.canvas.addEventListener('pointerdown',down);scene.canvas.addEventListener('pointermove',move);scene.canvas.addEventListener('pointerup',end);scene.canvas.addEventListener('pointercancel',end);};
    bindDrag();scene.addEventListener('renderstart',bindDrag);scene.addEventListener('loaded',bindDrag);
    window.addEventListener('beforeunload' ,e=>{if(dirty){e.preventDefault();e.returnValue='';}});
    document.body.append(panel);gate();return {panel};
  }
};
