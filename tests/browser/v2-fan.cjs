const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');
// Fan / rosette ("מניפה"): a sibling of scatter along a path. From a picture, the action on the selection bar opens a fan
// at once (7 copies, 120°) right above it, selected with its controls. Count, angle, radius, direction, size, pivot,
// copy rotation, depth and the order flip change the copies; 360° makes a rosette with no doubled copy; the editor's 3D
// view and the preview put the same copies in the same places; break apart gives ordinary layers in a group; undo,
// duplicate, lock, the layer list and a backup work; a broken fan is refused and a path scatter is still valid; video
// copies inside a fan wait for the artwork in AR and play when it is found. Phone size, touch. Headless Chrome; not an iPhone.
const SHOTS='/Users/adibrill/Desktop/brill-ar-work/wt-tools2-shots/';
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});try{
  const ctx=await b.newContext({viewport:{width:375,height:812},isMobile:true,hasTouch:true});
  const p=await ctx.newPage(),errs=[];p.on('pageerror',e=>errs.push(String(e)));p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await p.goto(base+'/index.html');await p.waitForFunction(()=>typeof Studio!=='undefined'&&typeof App!=='undefined');
  const id=await p.evaluate(async()=>{
    const blob=(w,h,paint)=>{const c=document.createElement('canvas');c.width=w;c.height=h;paint(c.getContext('2d'));return new Promise(r=>c.toBlob(r,'image/png'));};
    const a=Studio.blankExperience('מניפה');a.target={artRect:{x:0,y:0,w:300,h:400},natural:{w:300,h:400}};
    a.assets.__artwork=await blob(300,400,g=>{g.fillStyle='#204080';g.fillRect(0,0,300,400);});
    // a petal: narrow and tall, darker at the bottom so the turn shows
    a.assets.petal=await blob(60,160,g=>{g.fillStyle='#ffb000';g.beginPath();g.ellipse(30,80,28,78,0,0,7);g.fill();g.fillStyle='#c03000';g.fillRect(20,130,20,30);});
    a.elements=[{id:'petal',type:'image',name:'עלה',assetId:'petal',x:0,y:-0.1,z:0,w:0.1,h:0.2,aspect:60/160*(400/300),rot:0,flush:true,seq:null,opacity:1}];
    await Studio.save(a);return a.id;});
  await p.goto(base+'/index.html#/e/'+id);await p.waitForSelector('#stage-tools:not([hidden])');await p.waitForTimeout(800);
  const fan=()=>p.evaluate(()=>App.rec.elements.find(e=>e.type==='scatter'));
  const copies=()=>p.evaluate(()=>{const e=App.rec.elements.find(e=>e.type==='scatter');return Studio.scatterCopies(App.rec,e);});
  const setNum=async(label,v)=>{const n=p.locator('input.num[aria-label="'+label+' (מספר)"]');await n.fill(String(v));await n.dispatchEvent('change');await p.waitForTimeout(250);};
  const chip=async(t)=>{await p.locator('.chip',{hasText:t}).first().click();await p.waitForTimeout(250);};
  const near=(a,b,e=1e-3)=>Math.abs(a-b)<e;
  const turns=(c)=>c.map(q=>((q.rot%360)+360)%360);

  // the action is on the selection bar; the fan comes at once, right after its source, selected, with its controls
  await p.evaluate(()=>App.select('petal'));await p.waitForTimeout(300);
  await p.locator('#sel-bar [aria-label="מניפה"]').first().click();
  await p.waitForFunction(()=>App.rec.elements.some(e=>e.type==='scatter'),null,{timeout:5000});await p.waitForTimeout(500);
  let f=await fan();
  assert.equal(f.scatter.layout,'fan','a fan layout');assert.equal(f.name,'מניפה: עלה','named after its source');
  assert.deepEqual(await p.evaluate(()=>App.rec.elements.map(e=>e.type)),['image','scatter'],'right after its source');
  assert.equal(await p.evaluate(()=>App.selId),f.id,'selected');
  assert.equal(await p.evaluate(()=>App.tab),'style','its controls are open');
  assert.equal(await p.evaluate(()=>Stage.drawing),null,'no line to draw');
  assert.equal(f.scatter.count,7);assert.equal(f.scatter.fan.angle,120,'7 copies over 120°');
  for(const t of ['מספר עותקים','זווית פתיחה','רדיוס','כיוון','סיבוב העותקים','נקודת האחיזה','גודל','עומק בהתחלה','עומק בסוף','הראשון מעל'])assert.ok(await p.locator('.ctl-label',{hasText:t}).count(),'control '+t);
  assert.ok(await p.locator('button',{hasText:'להפריד לשכבות'}).count(),'break apart button');
  let c=await copies();assert.equal(c.length,7);
  assert.equal(await p.evaluate(id=>(Stage.copyBoxes[id]||[]).length,f.id),7,'the flat stage draws every copy');
  assert.ok(near(c[0].rot,-60)&&near(c[3].rot,0)&&near(c[6].rot,60),'like sun rays: -60° .. 0 .. 60° ('+c.map(q=>q.rot.toFixed(0))+')');
  // held by the bottom edge with radius 0: every copy's bottom is the same point (the fan's centre)
  const g=await p.evaluate(()=>Studio.geom(App.rec));
  const bottom=(q,ih)=>{const a=q.rot*Math.PI/180,d=ih*q.k/2;return [q.x*g.artW+Math.sin(a)*d,q.y*g.artH-Math.cos(a)*d];};
  const ih=f.scatter.item.h*g.artH,b0=bottom(c[0],ih);
  assert.ok(c.every(q=>{const bq=bottom(q,ih);return near(bq[0],b0[0])&&near(bq[1],b0[1]);}),'all held at one point at the bottom');
  await p.screenshot({path:SHOTS+'fan-flat.png'});

  // count, angle, radius, direction
  await setNum('מספר עותקים',9);c=await copies();assert.equal(c.length,9,'9 copies');
  await setNum('זווית פתיחה',180);c=await copies();assert.ok(near(c[0].rot,-90)&&near(c[8].rot,90),'180° spreads from -90° to 90°');
  await setNum('רדיוס',30);c=await copies();
  const fc=(await fan()).scatter.fan,dist=(q)=>{const bq=bottom(q,ih);return Math.hypot(bq[0]-fc.cx*g.artW,bq[1]-fc.cy*g.artH);}; // the layer recentres on its copies; the fan's centre moves with it
  assert.ok(c.every(q=>near(dist(q),0.3*g.artW,0.02*g.artW)),'radius 30% moves every copy out from the centre ('+c.map(q=>dist(q).toFixed(2))+')');
  await setNum('כיוון',90);c=await copies();assert.ok(near(c[4].rot,90),'direction 90° turns the whole fan ('+c[4].rot+')');
  await setNum('כיוון',0);await setNum('רדיוס',0);
  // pivot in the middle: radius 0 puts every copy's centre on one point
  await chip('באמצע');c=await copies();assert.ok(c.every(q=>near(q.x,c[0].x)&&near(q.y,c[0].y)),'pivot in the middle: all centres on one point');
  await chip('בתחתית');
  // copy rotation like the source
  await chip('כמו המקור');c=await copies();assert.ok(c.every(q=>near(q.rot,0)),'like the source: no turn');
  await chip('כמו קרני שמש');
  // size grows, depth steps toward her, order flips
  await chip('הולך וגדל');await setNum('כמה',3);c=await copies();assert.ok(near(c[0].k,1)&&near(c[8].k,3),'size grows 1x .. 3x');
  const bw=await p.evaluate(id=>Stage.copyBoxes[id].map(b=>b.w),(await fan()).id);assert.ok(bw[8]>bw[0]*2.5,'the stage draws them growing');
  await chip('קבוע');
  assert.deepEqual(c.map(q=>q.rank),[0,1,2,3,4,5,6,7,8],'the last copy is drawn on top');
  await p.locator('label.ctl-toggle',{hasText:'הראשון מעל'}).locator('.switch').click();await p.waitForTimeout(250);
  c=await copies();assert.deepEqual(c.map(q=>q.rank),[8,7,6,5,4,3,2,1,0],'flipped: the first copy on top');
  await setNum('עומק בסוף',50);c=await copies();assert.ok(near(c[0].z,0)&&near(c[8].z,0.5),'depth steps out from the start to the end');
  assert.deepEqual(c.map(q=>q.rank),[0,1,2,3,4,5,6,7,8],'nearer always on top, even flipped');
  await setNum('עומק בסוף',0);await p.locator('label.ctl-toggle',{hasText:'הראשון מעל'}).locator('.switch').click();await p.waitForTimeout(250);

  // rosette: 360°, no doubled copy
  await chip('רוזטה');f=await fan();assert.equal(f.scatter.fan.angle,360,'the rosette chip sets 360°');
  c=await copies();const tr=turns(c).sort((a,b)=>a-b);
  const steps=tr.map((t,i)=>((i?t-tr[i-1]:t+360-tr[tr.length-1])));
  assert.ok(steps.every(s=>near(s,40)),'9 copies evenly 40° apart, none doubled ('+tr.map(t=>t.toFixed(0))+')');
  await setNum('רדיוס',8);await p.waitForTimeout(300);
  await p.screenshot({path:SHOTS+'rosette-flat.png'});

  // the editor's 3D view and the preview put the same copies at the same places
  f=await fan();
  const grab=(page,rigId,id)=>page.evaluate(([rigId,id])=>{const n=document.querySelector('[data-el-id="'+id+'"]')||Editor3D._test.node(id),rig=document.getElementById(rigId).object3D,out=[];n.object3D.updateMatrixWorld(true);
    n.object3D.traverse(o=>{if(o.userData.scatterCopy!=null){const v=o.getWorldPosition(new THREE.Vector3());rig.worldToLocal(v);const s=new THREE.Vector3();o.getWorldScale(s);out[o.userData.scatterCopy]=[v.x,v.y,v.z,s.x];}});return out;},[rigId,id]);
  const count3=(page,id)=>page.waitForFunction(id=>{const n=document.querySelector('[data-el-id="'+id+'"]')||(window.Editor3D&&Editor3D._test.node(id));let k=0;n&&n.object3D.traverse(o=>{if(o.userData.scatterCopy!=null)k++;});return k===9;},id,{timeout:20000});
  await p.evaluate(()=>App.setMode3d(true));await p.waitForFunction(()=>Editor3D.isActive(),null,{timeout:20000});
  await p.waitForFunction(id=>{const n=Editor3D._test.node(id);let k=0;n&&n.object3D.traverse(o=>{if(o.userData.scatterCopy!=null)k++;});return k===9;},f.id,{timeout:20000});
  const pos3d=await p.evaluate(id=>{const n=Editor3D._test.node(id),rig=document.getElementById('editor-3d-rig').object3D,out=[];n.object3D.updateMatrixWorld(true);
    n.object3D.traverse(o=>{if(o.userData.scatterCopy!=null){const v=o.getWorldPosition(new THREE.Vector3());rig.worldToLocal(v);const s=new THREE.Vector3();o.getWorldScale(s);out[o.userData.scatterCopy]=[v.x,v.y,v.z,s.x];}});return out;},f.id);
  assert.equal(pos3d.length,9,'the 3D view shows 9 copies');
  assert.equal(await p.evaluate(()=>!!Editor3D._test.pathHelper()),false,'no path line for a fan');
  await p.evaluate(()=>App.setMode3d(false));await p.waitForTimeout(300);
  await p.evaluate(()=>App.flush());
  const pv=await ctx.newPage();pv.on('pageerror',e=>errs.push('preview: '+e));pv.on('console',m=>{if(m.type()==='error')errs.push('preview: '+m.text());});
  await pv.goto(base+'/preview.html#'+id);await count3(pv,f.id);await pv.waitForTimeout(500);
  const posPv=await grab(pv,'rig',f.id);
  const off=Math.max(...pos3d.map((q,i)=>Math.max(...q.map((v,j)=>Math.abs(v-posPv[i][j])))));
  assert.ok(off<1e-3,'the 3D view and the preview match copy for copy (largest difference '+off+')');
  await pv.screenshot({path:SHOTS+'rosette-preview.png'});
  // back to a fan for the preview picture
  await chip('מניפה');await p.evaluate(()=>App.flush());await pv.reload();await count3(pv,f.id);await pv.waitForTimeout(500);
  await pv.screenshot({path:SHOTS+'fan-preview.png'});await pv.close();

  // the layer list names it with its icon and count
  await p.locator('.tab[data-tab="layers"]').click();await p.waitForTimeout(300);
  const row=p.locator('.layer-row',{hasText:'מניפה: עלה'});assert.equal(await row.count(),1,'the list shows "מניפה: עלה"');
  assert.match(await row.textContent(),/מניפה.*9 עותקים/,'with its kind and "9 עותקים"');

  // backup round trip; a broken fan is refused; a path scatter is still valid
  const rt=await p.evaluate(async()=>{const r=await Studio.load(App.rec.id);const n=await Studio.importJSON(await Studio.exportJSON(r),{save:false});const a=r.elements.find(e=>e.type==='scatter'),b=n.elements.find(e=>e.type==='scatter');
    return {same:JSON.stringify(a.scatter)===JSON.stringify(b.scatter),file:!!n.assets[b.assetId],copies:Studio.scatterCopies(n,b).length};});
  assert.deepEqual(rt,{same:true,file:true,copies:9},'a backup carries the fan and its file');
  for(const [k,v] of [['angle',500],['pivot','side'],['radius',-1]]){
    const bad=await p.evaluate(async([k,v])=>{const r=await Studio.load(App.rec.id);const o=JSON.parse(await Studio.exportJSON(r));o.elements[1].scatter.fan[k]=v;try{await Studio.importJSON(JSON.stringify(o),{save:false});return 'accepted';}catch(e){return e.message;}},[k,v]);
    assert.match(bad,/scatter/,'a fan with '+k+'='+v+' is refused');}
  assert.equal(await p.evaluate(()=>{const r=App.rec,src=r.elements[0];const s=Studio.makeScatter(r,src,[{x:-.2,y:0,z:0},{x:.2,y:0,z:0}],{curved:false});return Studio.validScatter(s)&&!s.scatter.layout&&Studio.scatterCopies(r,s).length>1;}),true,'a path scatter is still valid');

  // duplicate and lock
  await p.evaluate(()=>{const e=App.rec.elements.find(e=>e.type==='scatter');App.select(e.id);return App.duplicateLayer(e.id);});await p.waitForTimeout(400);
  assert.equal(await p.evaluate(()=>App.rec.elements.filter(e=>e.type==='scatter'&&e.scatter.layout==='fan').length),2,'duplicate makes a second fan');
  await p.evaluate(()=>App.undo());await p.waitForTimeout(400);
  await p.evaluate(()=>App.setLocked(App.rec.elements.find(e=>e.type==='scatter').id,true));await p.waitForTimeout(200);
  assert.equal(await p.evaluate(()=>App.rec.elements.find(e=>e.type==='scatter').locked),true,'it locks');
  await p.evaluate(()=>App.setLocked(App.rec.elements.find(e=>e.type==='scatter').id,false));

  // break apart: 9 pictures in a group at the copies' turns; undo brings the fan back
  const want=await copies();
  await p.evaluate(()=>{App.select(App.rec.elements.find(e=>e.type==='scatter').id);App.setTab('style');});await p.waitForTimeout(300);
  await p.locator('button',{hasText:'להפריד לשכבות'}).click();await p.waitForTimeout(600);
  const parts=await p.evaluate(()=>{const g=App.rec.elements.find(e=>e.type==='group');return {g:g&&g.name,kids:App.rec.elements.filter(e=>g&&g.children.includes(e.id)).map(e=>({type:e.type,rot:e.rot,assetId:e.assetId}))};});
  assert.equal(parts.g,'מניפה: עלה','the group keeps the layer name, as a path scatter does');
  assert.equal(parts.kids.length,9,'9 ordinary layers in the group');assert.ok(parts.kids.every(k=>k.type==='image'&&k.assetId==='petal'),'pictures sharing the file');
  assert.deepEqual(parts.kids.map(k=>Math.round(((k.rot%360)+360)%360)).sort((a,b)=>a-b),want.map(q=>Math.round(((q.rot%360)+360)%360)).sort((a,b)=>a-b),'turned like the copies');
  await p.evaluate(()=>App.undo());await p.waitForTimeout(500);
  assert.deepEqual(await p.evaluate(()=>App.rec.elements.map(e=>e.type)),['image','scatter'],'undo brings the fan back');

  // the layer menu has it too, for a text
  await p.evaluate(()=>App.select('petal'));await p.locator('.tab[data-tab="layers"]').click();await p.waitForTimeout(300);
  await p.locator('[aria-label="עוד פעולות: עלה"]').first().click();await p.waitForTimeout(200);
  const inMenu=await p.locator('.menu-item',{hasText:'מניפה'}).count();
  await p.keyboard.press('Escape');
  assert.ok(inMenu>=1,'the layer menu offers "מניפה"');

  assert.deepEqual(errs.filter(e=>!/favicon|404/.test(e)),[],'no console errors');

  // video copies inside a fan in AR: hidden until found, then they fade in and the video plays
  const q=await ctx.newPage(),aerr=[];q.on('pageerror',e=>aerr.push(String(e)));q.on('console',m=>{if(m.type()==='error')aerr.push(m.text());});
  await q.goto(base+'/preview.html#'+id);await q.waitForFunction(()=>{const sc=document.querySelector('a-scene');return sc&&sc.hasLoaded;},null,{timeout:20000});
  await q.evaluate(async()=>{
    const vid=await (await fetch('/assets/demo/art-video.mp4')).blob();
    const a=Studio.blankExperience('וידאו במניפה');a.target={artRect:{x:0,y:0,w:300,h:400},natural:{w:300,h:400}};a.assets.vid=vid;
    const src={id:'v',type:'video',name:'סרטון',assetId:'vid',x:0,y:0,z:0,w:0.2,h:0.15,aspect:4/3,rot:0,flush:true,seq:null,opacity:1};
    a.elements=[src];const s=Studio.makeFan(a,src);a.elements.push(s);
    if(!AFRAME.primitives.primitives['xrextras-named-image-target'])AFRAME.registerPrimitive('xrextras-named-image-target',{});
    const v=document.createElement('video');v.id='m-'+s.id;v.src=URL.createObjectURL(vid);v.muted=true;v.loop=true;v.setAttribute('playsinline','');v.preload='auto';document.body.appendChild(v);
    const target=document.createElement('xrextras-named-image-target');const e=Studio.buildElementEntity(a,s,0,'ar',{});target.appendChild(e);document.querySelector('a-scene').appendChild(target);
    window.__t={target,video:v,wrap:e};});
  await q.waitForFunction(()=>((__t.wrap.components&&__t.wrap.components['studio-scatter']||{}).copies||[]).length>0,null,{timeout:15000});
  const st=()=>q.evaluate(()=>{const cs=__t.wrap.components['studio-scatter'].copies;return {n:cs.length,op:cs.map(m=>m.material.opacity),paused:__t.video.paused};});
  let s=await st();assert.equal(s.n,7,'seven video copies');assert.ok(s.op.every(o=>o===0)&&s.paused,'hidden and still until the artwork is found');
  await q.evaluate(()=>__t.target.emit('xrextrasfound',null,false));await q.waitForTimeout(1500);
  s=await st();assert.ok(s.op.every(o=>o>0.99),'found: the copies fade in');assert.equal(s.paused,false,'and the video plays');
  await q.evaluate(()=>__t.target.emit('xrextraslost',null,false));await q.waitForTimeout(200);
  s=await st();assert.ok(s.paused&&s.op.every(o=>o===0),'lost: hidden and stopped');
  assert.deepEqual(aerr.filter(e=>!/favicon|404/.test(e)),[],'no AR console errors');

  await ctx.close();
  console.log('PASS v2-fan: opens at once from the bar, count/angle/radius/direction/pivot/rotation/size/depth/order change the copies, rosette with no doubled copy, 3D view = preview, layer list, backup + validation, duplicate, lock, break apart, undo, video fan in AR; phone size');
}finally{await b.close();server.close();}})().catch(e=>{console.error(e&&e.stack||e);process.exit(1)});
