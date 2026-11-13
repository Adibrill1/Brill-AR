const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');
// Colour removal ("הסרת צבע") on a picture and a video: the eyedropper takes the colour from the layer's own pixels (not
// from what covers it on screen), waits with a hint and can be cancelled; the picked colour really turns transparent in
// the flat editor canvas, in the editor's 3D view and in the preview; old green-screen videos keep working; a backup
// carries the setting. Phone size, touch. Headless Chrome; not an iPhone.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});try{
  const ctx=await b.newContext({viewport:{width:375,height:812},isMobile:true,hasTouch:true});
  const p=await ctx.newPage(),errs=[];p.on('pageerror',e=>errs.push(String(e)));p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await p.goto(base+'/index.html');await p.waitForFunction(()=>typeof Studio!=='undefined'&&typeof App!=='undefined');
  // artwork: plain blue. Layer 1: a green picture with a red disc. Layer 2 (on top): a yellow square over the picture's corner.
  // Layer 3: a video, green with a red box, recorded here (VP8 webm).
  const id=await p.evaluate(async()=>{
    const blob=(w,h,paint,type)=>{const c=document.createElement('canvas');c.width=w;c.height=h;paint(c.getContext('2d'));return new Promise(r=>c.toBlob(r,type||'image/png'));};
    const a=Studio.blankExperience('צבע');a.target={artRect:{x:0,y:0,w:768,h:1024},natural:{w:300,h:400}};
    a.assets.__artwork=await blob(300,400,g=>{g.fillStyle='#204080';g.fillRect(0,0,300,400);});
    a.assets.pic=await blob(200,200,g=>{g.fillStyle='#00ff00';g.fillRect(0,0,200,200);g.fillStyle='#ff0000';g.beginPath();g.arc(100,100,50,0,7);g.fill();});
    a.assets.top=await blob(50,50,g=>{g.fillStyle='#ffff00';g.fillRect(0,0,50,50);});
    const c=document.createElement('canvas');c.width=160;c.height=120;const g=c.getContext('2d'),rec=new MediaRecorder(c.captureStream(25),{mimeType:'video/webm;codecs=vp8'}),parts=[];
    rec.ondataavailable=e=>parts.push(e.data);rec.start(100);
    for(let i=0;i<30;i++){g.fillStyle='#00ff00';g.fillRect(0,0,160,120);g.fillStyle='#ff0000';g.fillRect(50+i,35,50,50);await new Promise(r=>setTimeout(r,40));}
    await new Promise(r=>{rec.onstop=r;rec.stop();});a.assets.vid=new Blob(parts,{type:'video/webm'});
    a.elements=[{id:'pic',type:'image',name:'עין',assetId:'pic',x:0,y:0.2,z:0,w:0.5,h:0.375,aspect:1,rot:0,flush:true,seq:null,opacity:1},
      {id:'top',type:'image',name:'ריבוע',assetId:'top',x:-0.2,y:0.35,z:0,w:0.08,h:0.06,aspect:1,rot:0,flush:true,seq:null,opacity:1},
      {id:'vid',type:'video',name:'סרטון',assetId:'vid',x:0,y:-0.25,z:0,w:0.6,h:0.3375,aspect:160/120,rot:0,flush:true,seq:null,opacity:1,loop:true,volume:0,chroma:{enabled:true,color:'#00ff00',threshold:0.35}}];
    a.elements[2].h=0.6/(160/120)*0.75;
    await Studio.save(a);return a.id;});
  await p.goto(base+'/index.html#/e/'+id);await p.waitForSelector('#stage-tools:not([hidden])');await p.waitForTimeout(1200);
  // the colour on the flat canvas under an artwork point (x, y in artwork units)
  const flat=(x,y)=>p.evaluate(([x,y])=>{const v=Stage.view,z=Stage.zoom,c=document.getElementById('preview'),k=c.width/v.cw;const px=(v.mx+(x+.5)*v.W),py=(v.my+(.5-y)*v.H);const d=c.getContext('2d').getImageData(Math.round(px*k),Math.round(py*k),1,1).data;return [d[0],d[1],d[2],d[3]];},[x,y]);
  const screen=(x,y)=>p.evaluate(([x,y])=>{const v=Stage.view,r=document.getElementById('preview').getBoundingClientRect();return {x:r.left+v.mx+(x+.5)*v.W,y:r.top+v.my+(.5-y)*v.H};},[x,y]);
  const near=(c,want,tol=40)=>want.every((v,i)=>Math.abs(c[i]-v)<=tol);
  // picture corner (green, under the yellow square) at x=-0.2, y=0.35
  assert.ok(near(await flat(-0.2,0.35),[255,255,0]),'the yellow square covers the picture corner on screen');
  assert.ok(near(await flat(-0.2,0.25),[0,255,0]),'before: the picture is green around the red disc');

  // select the picture, open its style tab: the group, the toggle, the eyedropper
  await p.evaluate(()=>{App.select('pic');App.setTab('style');});await p.waitForTimeout(300);
  assert.ok(await p.locator('.group-title',{hasText:'הסרת צבע'}).count(),'a "הסרת צבע" group on a picture');
  assert.equal(await p.locator('text=את התוצאה רואים בתצוגה המקדימה').count(),0,'the old "only in the preview" note is gone');
  // cancel works
  await p.locator('#btn-pick-color').click();await p.waitForSelector('#stage-hint');
  assert.match(await p.locator('#stage-hint').textContent(),/נגעי בתמונה על הצבע/,'a clear hint while it waits');
  assert.equal(await p.evaluate(()=>Stage.picking),'pic');
  await p.locator('#stage-hint-cancel').click();await p.waitForTimeout(200);
  assert.equal(await p.locator('#stage-hint').count(),0,'cancel removes the hint');
  assert.equal(await p.evaluate(()=>!!(App.sel().chroma&&App.sel().chroma.enabled)),false,'cancel changes nothing');
  // pick: a touch on the corner, where the yellow square covers it on screen -> the picture's own green
  await p.evaluate(()=>App.setTab('style'));await p.waitForTimeout(150);
  await p.locator('#btn-pick-color').click();await p.waitForSelector('#stage-hint');
  const at=await screen(-0.2,0.35);await p.touchscreen.tap(at.x,at.y);await p.waitForTimeout(500);
  const ch=await p.evaluate(()=>App.sel()&&App.sel().chroma);
  assert.ok(ch&&ch.enabled&&ch.color==='#00ff00','the eyedropper took the layer\'s own green, not the yellow on top ('+JSON.stringify(ch)+')');
  assert.equal(await p.locator('#stage-hint').count(),0,'the hint goes after the pick');
  assert.equal(await p.evaluate(()=>App.selId),'pic','the layer stays selected');
  await p.waitForTimeout(400);
  assert.ok(near(await flat(-0.05,0.33),[0x20,0x40,0x80]),'flat canvas: the green is gone, the artwork shows through ('+await flat(-0.05,0.33)+')');
  assert.ok(near(await flat(0,0.2),[255,0,0]),'flat canvas: the red disc stays');
  // the video's old-style setting (no softness field) keys in the flat canvas too
  await p.waitForFunction(()=>{const m=App.media.vid;return m&&m.readyState>=2;},null,{timeout:15000});await p.waitForTimeout(400);
  assert.ok(near(await flat(-0.25,-0.25),[0x20,0x40,0x80]),'flat canvas: the video\'s green is gone ('+await flat(-0.25,-0.25)+')');
  // the controls are there, with softness
  for(const t of ['להעלים צבע','הצבע שנעלם','רגישות','ריכוך קצוות'])assert.ok(await p.locator('.ctl-label',{hasText:t}).count(),'control '+t);
  await p.evaluate(()=>{App.sel().chroma.soft=0.1;App.changed(true);});await p.waitForTimeout(600);

  // 3D view: render once and read the pixel where the picture's green corner is
  const read3d=(sel,pts)=>p.evaluate(([sel,pts])=>{const sc=sel==='editor'?Editor3D._test.scene():document.querySelector('a-scene');const r=sc.renderer,cam=sc.camera;sc.object3D.updateMatrixWorld(true);r.render(sc.object3D,cam);
    const gl=r.getContext(),W=gl.drawingBufferWidth,H=gl.drawingBufferHeight,out=[];const rig=sc.querySelector(sel==='editor'?'#editor-3d-rig':'#rig');
    for(const [x,y] of pts){const rec=sel==='editor'?App.rec:window.__rec;const g=Studio.geom(rec);const ts=Studio.toTargetSpace(rec,{x,y,w:.1,h:.1},1);const v=new THREE.Vector3(ts.x,ts.y,0.0005);rig.object3D.localToWorld(v);v.project(cam);
      const px=Math.round((v.x+1)/2*W),py=Math.round((v.y+1)/2*H),d=new Uint8Array(4);gl.readPixels(px,py,1,1,gl.RGBA,gl.UNSIGNED_BYTE,d);out.push([...d]);}return out;},[sel,pts]);
  await p.evaluate(()=>App.setMode3d(true));await p.waitForFunction(()=>Editor3D.isActive()&&Editor3D._test.scene()&&Editor3D._test.scene().renderer,null,{timeout:20000});await p.waitForTimeout(2500);
  let px=await read3d('editor',[[-0.05,0.33],[0.05,0.14],[-0.25,-0.25]]);
  assert.ok(!near(px[0],[0,255,0],60),'3D view: the green of the picture is gone ('+px[0]+')');
  assert.ok(near(px[1],[255,0,0],60),'3D view: the red disc stays ('+px[1]+')');
  assert.ok(!near(px[2],[0,255,0],60),'3D view: the video\'s green is gone ('+px[2]+')');
  await p.evaluate(()=>App.setMode3d(false));await p.waitForTimeout(300);

  // backup round trip keeps the setting (softness too)
  const back=await p.evaluate(async()=>{await App.flush();const r=await Studio.load(App.rec.id);const j=await Studio.exportJSON(r);const n=await Studio.importJSON(j,{save:false});return n.elements.map(e=>e.chroma||null);});
  assert.deepEqual(back[0],{enabled:true,color:'#00ff00',threshold:0.35,soft:0.1},'backup carries the picture\'s colour removal');
  assert.equal(back[2].enabled,true,'and the video\'s');
  // a bad value is refused on import
  const bad=await p.evaluate(async()=>{const r=await Studio.load(App.rec.id);const o=JSON.parse(await Studio.exportJSON(r));o.elements[0].chroma.threshold='x';try{await Studio.importJSON(JSON.stringify(o),{save:false});return 'accepted';}catch(e){return e.message;}});
  assert.match(bad,/colour removal/,'a broken colour removal is refused');

  // preview page
  const pv=await ctx.newPage();pv.on('pageerror',e=>errs.push('preview: '+e));pv.on('console',m=>{if(m.type()==='error')errs.push('preview: '+m.text());});
  await pv.goto(base+'/preview.html#'+id);await pv.waitForFunction(()=>document.querySelector('a-scene')&&document.querySelector('a-scene').renderer&&document.querySelector('[data-el-id="pic"]'),null,{timeout:20000});
  await pv.evaluate(async()=>{window.__rec=await Studio.load(location.hash.slice(1));});await pv.waitForTimeout(3000);
  const pp=await pv.evaluate(()=>{const sc=document.querySelector('a-scene'),r=sc.renderer,cam=sc.camera;sc.object3D.updateMatrixWorld(true);r.render(sc.object3D,cam);const gl=r.getContext(),W=gl.drawingBufferWidth,H=gl.drawingBufferHeight,rig=document.getElementById('rig');
    return [[-0.05,0.33],[0.05,0.14],[-0.25,-0.25]].map(([x,y])=>{const ts=Studio.toTargetSpace(window.__rec,{x,y,w:.1,h:.1},1),v=new THREE.Vector3(ts.x,ts.y,0.0005);rig.object3D.localToWorld(v);v.project(cam);const d=new Uint8Array(4);gl.readPixels(Math.round((v.x+1)/2*W),Math.round((v.y+1)/2*H),1,1,gl.RGBA,gl.UNSIGNED_BYTE,d);return [...d];});});
  assert.ok(!near(pp[0],[0,255,0],60),'preview: the green of the picture is gone ('+pp[0]+')');
  assert.ok(near(pp[1],[255,0,0],60),'preview: the red disc stays ('+pp[1]+')');
  assert.ok(!near(pp[2],[0,255,0],60),'preview: the video\'s green is gone ('+pp[2]+')');
  const mats=await pv.evaluate(()=>['pic','vid'].map(i=>{const n=document.querySelector('[data-el-id="'+i+'"]');return n.getAttribute('studio-fx');}));
  assert.equal(mats[0].key,1,'the picture keys through its own material');assert.equal(mats[1].key,1,'the video too (no separate green-screen entity)');
  await pv.close();

  assert.deepEqual(errs.filter(e=>!/favicon|404/.test(e)),[],'no console errors');
  await ctx.close();
  console.log('PASS v2-colour-key: eyedropper from the layer\'s own pixels (hint, cancel), transparent in the flat canvas, the 3D view and the preview, for a picture and a video; old video setting works; backup round trip; phone size');
}finally{await b.close();server.close();}})().catch(e=>{console.error(e&&e.stack||e);process.exit(1)});
