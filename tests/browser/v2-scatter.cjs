const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');
// Scatter along a path ("פיזור על נתיב"): from a picture layer, the action on the selection bar waits for a line drawn
// with the finger (or tap-tap for a straight one), then one layer holds the copies. Count, size and spacing change the
// copies; the depth sliders bring the end out of the artwork; the flat stage, the editor's 3D view and the preview put the
// same copies in the same places; a point dragged on the stage moves the line; break apart gives ordinary layers in a
// group; undo brings the scatter back; a backup carries it. Phone size, touch. Headless Chrome; not an iPhone.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});try{
  const ctx=await b.newContext({viewport:{width:375,height:812},isMobile:true,hasTouch:true});
  const p=await ctx.newPage(),errs=[];p.on('pageerror',e=>errs.push(String(e)));p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await p.goto(base+'/index.html');await p.waitForFunction(()=>typeof Studio!=='undefined'&&typeof App!=='undefined');
  const id=await p.evaluate(async()=>{
    const blob=(w,h,paint)=>{const c=document.createElement('canvas');c.width=w;c.height=h;paint(c.getContext('2d'));return new Promise(r=>c.toBlob(r,'image/png'));};
    const a=Studio.blankExperience('פיזור');a.target={artRect:{x:0,y:0,w:300,h:400},natural:{w:300,h:400}};
    a.assets.__artwork=await blob(300,400,g=>{g.fillStyle='#204080';g.fillRect(0,0,300,400);});
    a.assets.eye=await blob(100,100,g=>{g.fillStyle='#ff0000';g.beginPath();g.arc(50,50,45,0,7);g.fill();});
    a.elements=[{id:'eye',type:'image',name:'עין',assetId:'eye',x:-0.3,y:-0.3,z:0,w:0.12,h:0.09,aspect:1,rot:0,flush:true,seq:null,opacity:1}];
    await Studio.save(a);return a.id;});
  await p.goto(base+'/index.html#/e/'+id);await p.waitForSelector('#stage-tools:not([hidden])');await p.waitForTimeout(800);
  const cdp=await ctx.newCDPSession(p);const touch=(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y,id:1}]});
  const screen=(x,y)=>p.evaluate(([x,y])=>{const v=Stage.view,r=document.getElementById('preview').getBoundingClientRect();return {x:r.left+v.mx+(x+.5)*v.W,y:r.top+v.my+(.5-y)*v.H};},[x,y]);
  const sc=()=>p.evaluate(()=>App.rec.elements.find(e=>e.type==='scatter'));
  const copies=()=>p.evaluate(()=>{const e=App.rec.elements.find(e=>e.type==='scatter');return Studio.scatterCopies(App.rec,e);});
  const setNum=async(label,v)=>{const n=p.locator('input.num[aria-label="'+label+' (מספר)"]');await n.fill(String(v));await n.dispatchEvent('change');await p.waitForTimeout(250);};

  // the action is on the selection bar of a picture; it waits for a line, with a hint and a way out
  await p.evaluate(()=>App.select('eye'));await p.waitForTimeout(300);
  await p.locator('#sel-bar [aria-label="פיזור על נתיב"], [aria-label="פיזור על נתיב"]').first().click();
  await p.waitForSelector('#stage-hint');assert.match(await p.locator('#stage-hint').textContent(),/ציירי/,'a hint asks her to draw the line');
  await p.locator('#stage-hint-cancel').click();await p.waitForTimeout(200);
  assert.equal(await p.evaluate(()=>Stage.drawing),null,'cancel stops waiting');
  // draw an arc with the finger from the picture up and to the right
  await p.locator('[aria-label="פיזור על נתיב"]').first().click();await p.waitForSelector('#stage-hint');
  const arc=[];for(let i=0;i<=24;i++){const u=i/24;arc.push(await screen(-0.3+0.6*u,-0.3+0.6*u+0.25*Math.sin(Math.PI*u)));}
  await touch('touchStart',arc[0].x,arc[0].y);for(const q of arc.slice(1))await touch('touchMove',q.x,q.y);await touch('touchEnd');
  await p.waitForFunction(()=>App.rec.elements.some(e=>e.type==='scatter'),null,{timeout:5000});await p.waitForTimeout(600);
  let s=await sc();
  assert.equal(await p.locator('#stage-hint').count(),0,'the hint goes when the line is drawn');
  assert.deepEqual(await p.evaluate(()=>App.rec.elements.map(e=>e.type)),['image','scatter'],'the scatter comes right after its source');
  assert.equal(await p.evaluate(()=>App.selId),s.id,'and it is selected');
  assert.ok(s.scatter.points.length>=3&&s.scatter.points.length<=8,'the stroke is simplified to a few points ('+s.scatter.points.length+')');
  assert.equal(s.scatter.curved,true,'a drawn line is curved');assert.equal(s.assetId,'eye','the file is shared, not copied');
  assert.equal(await p.evaluate(()=>Object.keys(App.rec.assets).length),2,'no new file');
  let c=await copies();assert.equal(c.length,s.scatter.count,'one copy per count');
  assert.equal(await p.evaluate(id=>(Stage.copyBoxes[id]||[]).length,s.id),c.length,'the flat stage draws every copy');
  // the copies follow the arc: the middle one is above the straight line between the ends
  const mid=c[Math.floor(c.length/2)],fst=c[0],lst=c[c.length-1];
  assert.ok(mid.y>(fst.y+lst.y)/2+0.05,'the copies follow the curve ('+JSON.stringify([fst,mid,lst].map(q=>[q.x,q.y]))+')');

  // the inspector: count, spacing, size, depth
  await p.evaluate(()=>App.setTab('style'));await p.waitForTimeout(300);
  for(const t of ['עומק בהתחלה','עומק בסוף','מספר עותקים','מרווחים','גודל','כיוון'])assert.ok(await p.locator('.ctl-label',{hasText:t}).count(),'control '+t);
  for(const t of ['הוספת נקודה','מחיקת נקודה','לצייר את הקו מחדש','להפריד לשכבות'])assert.ok(await p.locator('button',{hasText:t}).count(),'button '+t);
  await setNum('מספר עותקים',14);c=await copies();assert.equal(c.length,14,'14 copies');
  assert.equal(await p.evaluate(id=>Stage.copyBoxes[id].length,s.id),14,'the stage draws 14');
  const gap=(c)=>{const d=[];for(let i=1;i<c.length;i++)d.push(Math.hypot(c[i].x-c[i-1].x,c[i].y-c[i-1].y,c[i].z-c[i-1].z));return d;};
  let d=gap(c);assert.ok(Math.max(...d)/Math.min(...d)<1.5,'even spacing: the gaps are about the same');
  await p.locator('.chip',{hasText:'הולכים וגדלים'}).click();await p.waitForTimeout(250);
  d=gap(await copies());assert.ok(d[d.length-1]>d[0]*2,'growing spacing: the last gap is much bigger than the first ('+d[0].toFixed(3)+' -> '+d[d.length-1].toFixed(3)+')');
  await p.locator('.chip',{hasText:'שווים'}).click();
  assert.ok((await copies()).every(q=>Math.abs(q.k-1)<1e-6),'constant size');
  await p.locator('.chip',{hasText:'הולך וגדל'}).click();await p.waitForTimeout(300);
  await setNum('כמה',3);c=await copies();
  assert.ok(Math.abs(c[0].k-1)<1e-6&&Math.abs(c[13].k-3)<1e-6,'growing size: from 1x to 3x ('+c[0].k+' -> '+c[13].k+')');
  const bw=await p.evaluate(id=>Stage.copyBoxes[id].map(b=>b.w),s.id);assert.ok(bw[bw.length-1]>bw[0]*2.5,'the stage draws them growing');
  // depth: the end comes toward the viewer, the start stays on the artwork
  await setNum('עומק בסוף',60);c=await copies();
  assert.ok(Math.abs(c[0].z)<1e-6&&c[13].z>0.5,'depth at the end moves the last copy out ('+c[13].z+')');
  assert.ok(c.every((q,i)=>i===0||q.z>=c[i-1].z-1e-9),'and the copies between step out in order');
  await setNum('עומק בהתחלה',10);c=await copies();assert.ok(c[0].z>0.09,'depth at the start too');
  await setNum('עומק בהתחלה',0);

  // drag the first point on the stage: the line moves, the copies follow
  s=await sc();const p0=s.scatter.points[0],before=(await copies())[0];
  const at=await screen(s.x+p0.x,s.y+p0.y);
  await touch('touchStart',at.x,at.y);for(let i=1;i<=6;i++)await touch('touchMove',at.x+i*4,at.y);await touch('touchEnd');await p.waitForTimeout(500);
  const after=(await copies())[0];s=await sc();
  assert.ok(Math.abs((s.x+s.scatter.points[0].x)-(before.x+0.07))<0.03||after.x>before.x+0.04,'dragging a point moves the start of the line ('+before.x+' -> '+after.x+')');
  assert.equal(await p.evaluate(()=>App.rec.elements.length),2,'dragging a point did not add a layer');

  // the editor's 3D view and the preview put the same copies at the same places (relative to the artwork)
  await p.evaluate(()=>App.setMode3d(true));await p.waitForFunction(()=>Editor3D.isActive(),null,{timeout:20000});
  await p.waitForFunction(id=>{const n=Editor3D._test.node(id);let k=0;n&&n.object3D.traverse(o=>{if(o.userData.scatterCopy!=null)k++;});return k===14;},s.id,{timeout:20000});
  const pos3d=await p.evaluate(id=>{const n=Editor3D._test.node(id),rig=document.getElementById('editor-3d-rig').object3D,g=Studio.geom(App.rec),out=[];n.object3D.updateMatrixWorld(true);
    n.object3D.traverse(o=>{if(o.userData.scatterCopy!=null){const v=o.getWorldPosition(new THREE.Vector3());rig.worldToLocal(v);const sc=new THREE.Vector3();o.getWorldScale(sc);out[o.userData.scatterCopy]=[v.x,v.y,v.z,sc.x];}});return out;},s.id);
  assert.equal(pos3d.length,14,'the 3D view shows 14 copies');
  assert.ok(pos3d[13][2]>pos3d[0][2]+0.1,'in the 3D view the last copy stands out of the artwork');
  assert.ok(pos3d[13][3]>pos3d[0][3]*2.5,'and is bigger');
  // a tap on a point in the 3D view selects it; the arrows then move just that point
  assert.ok(await p.evaluate(()=>{const h=Editor3D._test.pathHelper();return !!h;}),'the 3D view draws the path line with its points');
  await p.evaluate(()=>Editor3D.selectPoint(2));await p.waitForTimeout(200);
  assert.equal(await p.evaluate(()=>Editor3D.pointSel),2);
  await p.evaluate(()=>App.setMode3d(false));await p.waitForTimeout(300);

  await p.evaluate(()=>App.flush());
  const pv=await ctx.newPage();pv.on('pageerror',e=>errs.push('preview: '+e));pv.on('console',m=>{if(m.type()==='error')errs.push('preview: '+m.text());});
  await pv.goto(base+'/preview.html#'+id);
  await pv.waitForFunction(id=>{const n=document.querySelector('[data-el-id="'+id+'"]');let k=0;n&&n.object3D.traverse(o=>{if(o.userData.scatterCopy!=null)k++;});return k===14;},s.id,{timeout:20000});
  const posPv=await pv.evaluate(id=>{const n=document.querySelector('[data-el-id="'+id+'"]'),rig=document.getElementById('rig').object3D,out=[];n.object3D.updateMatrixWorld(true);
    n.object3D.traverse(o=>{if(o.userData.scatterCopy!=null){const v=o.getWorldPosition(new THREE.Vector3());rig.worldToLocal(v);const sc=new THREE.Vector3();o.getWorldScale(sc);out[o.userData.scatterCopy]=[v.x,v.y,v.z,sc.x];}});return out;},s.id);
  assert.equal(posPv.length,14,'the preview shows 14 copies');
  const off=Math.max(...pos3d.map((q,i)=>Math.max(...q.map((v,j)=>Math.abs(v-posPv[i][j])))));
  assert.ok(off<1e-3,'the 3D view and the preview match copy for copy (largest difference '+off+')');
  await pv.screenshot({path:require('node:os').tmpdir()+'/v2-scatter-preview.png'});await pv.close();

  // backup round trip
  const rt=await p.evaluate(async()=>{const r=await Studio.load(App.rec.id);const n=await Studio.importJSON(await Studio.exportJSON(r),{save:false});const a=r.elements.find(e=>e.type==='scatter'),b=n.elements.find(e=>e.type==='scatter');
    return {same:JSON.stringify(a.scatter)===JSON.stringify(b.scatter),file:!!n.assets[b.assetId],copies:Studio.scatterCopies(n,b).length};});
  assert.deepEqual(rt,{same:true,file:true,copies:14},'a backup carries the scatter and its file');
  const bad=await p.evaluate(async()=>{const r=await Studio.load(App.rec.id);const o=JSON.parse(await Studio.exportJSON(r));o.elements[1].scatter.points=[];try{await Studio.importJSON(JSON.stringify(o),{save:false});return 'accepted';}catch(e){return e.message;}});
  assert.match(bad,/scatter/,'a broken scatter is refused');

  // break apart: 14 ordinary pictures in a group, at the same places; undo brings the scatter back
  const want=await copies();
  await p.locator('button',{hasText:'להפריד לשכבות'}).click();await p.waitForTimeout(600);
  const parts=await p.evaluate(()=>{const g=App.rec.elements.find(e=>e.type==='group');return App.rec.elements.map(e=>({type:e.type,x:e.x,y:e.y,z:e.z,w:e.w,groupId:g&&g.children.includes(e.id)?g.id:null,assetId:e.assetId}));});
  assert.equal(parts.filter(e=>e.type==='image').length,15,'14 pictures (and the source) after breaking apart');
  assert.equal(parts.filter(e=>e.type==='group').length,1,'in one group');assert.equal(parts.filter(e=>e.type==='scatter').length,0,'the scatter is gone');
  const kids=parts.filter(e=>e.type==='image'&&e.groupId);assert.equal(kids.length,14,'all 14 in the group');
  assert.ok(kids.every(e=>e.assetId==='eye'),'sharing the same file');
  const zs=kids.map(e=>e.z).sort((a,b)=>a-b);assert.ok(Math.abs(zs[13]-want.map(q=>q.z).sort((a,b)=>a-b)[13])<1e-3,'the nearest picture stands where the nearest copy stood');
  await p.evaluate(()=>App.undo());await p.waitForTimeout(500);
  assert.deepEqual(await p.evaluate(()=>App.rec.elements.map(e=>e.type)),['image','scatter'],'undo brings the scatter back');
  assert.equal((await copies()).length,14,'with its 14 copies');
  await p.evaluate(()=>App.redo());await p.waitForTimeout(400);
  assert.equal(await p.evaluate(()=>App.rec.elements.filter(e=>e.type==='group').length),1,'redo breaks it apart again');
  await p.evaluate(()=>App.undo());await p.waitForTimeout(400);

  // duplicate and lock work on the scatter like on any layer
  await p.evaluate(()=>{const e=App.rec.elements.find(e=>e.type==='scatter');App.select(e.id);return App.duplicateLayer(e.id);});await p.waitForTimeout(400);
  assert.equal(await p.evaluate(()=>App.rec.elements.filter(e=>e.type==='scatter').length),2,'duplicate makes a second scatter');
  // the layer list names it with its count
  await p.locator('.tab[data-tab="layers"]').click();await p.waitForTimeout(300);
  assert.ok(await p.locator('.layer-row',{hasText:'14 עותקים'}).count()>=1,'the layer list shows "14 עותקים"');

  // a tap-tap straight line from a fresh start
  await p.evaluate(()=>App.select('eye'));await p.waitForTimeout(200);
  const had=await p.evaluate(()=>App.rec.elements.map(e=>e.id));
  await p.evaluate(()=>App.scatterFrom('eye'));await p.waitForSelector('#stage-hint');
  const t0=await screen(-0.4,0.1),t1=await screen(0.4,0.1);await p.touchscreen.tap(t0.x,t0.y);await p.waitForTimeout(150);await p.touchscreen.tap(t1.x,t1.y);await p.waitForTimeout(500);
  const st=await p.evaluate(had=>App.rec.elements.find(e=>!had.includes(e.id)),had);
  assert.equal(st.scatter.points.length,3,'tap-tap makes a straight line of three points');assert.equal(st.scatter.curved,false,'not curved');
  assert.ok(st.scatter.points.every(q=>Math.abs(q.y)<0.02),'and level');

  // a video and a text can be scattered too; a sound cannot
  const kinds=await p.evaluate(()=>{const r=App.rec,out={};const e={id:'t1',type:'text',text:'שלום',x:0,y:0,z:0,w:0.2,h:0.05,aspect:4,rot:0,flush:true,seq:null,opacity:1};
    const s=Studio.makeScatter(r,e,[{x:-.2,y:0,z:0},{x:.2,y:0,z:0}],{curved:false});out.text=Studio.validScatter(s)&&Studio.scatterCopies(r,s).length;return out;});
  assert.equal(kinds.text,12,'a text scatters with 12 copies');

  assert.deepEqual(errs.filter(e=>!/favicon|404/.test(e)),[],'no console errors');
  await ctx.close();
  console.log('PASS v2-scatter: draw a line (finger and tap-tap), count/spacing/size/depth change the copies, a point drag moves the line, the 3D view and the preview match copy for copy, backup round trip, break apart into a group, undo/redo, duplicate, layer list; phone size');
}finally{await b.close();server.close();}})().catch(e=>{console.error(e&&e.stack||e);process.exit(1)});
