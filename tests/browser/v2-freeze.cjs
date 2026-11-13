const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');
// Freezing motion ("הקפאה"): a 3D model with a clip, an animated GIF and a video each get one switch, on the selection
// bar and on top of the style tab. Frozen means still on one moment ("הרגע שמוצג") in the flat editor, the 3D view, the
// preview and an AR-mode build after the artwork is found (and lost); a static picture has no switch; unfreezing plays
// again. Phone size, touch. Headless Chrome; not an iPhone, no real camera.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});try{
  const ctx=await b.newContext({viewport:{width:375,height:812},isMobile:true,hasTouch:true});
  const p=await ctx.newPage(),errs=[];p.on('pageerror',e=>errs.push(String(e)));p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await p.goto(base+'/index.html');await p.waitForFunction(()=>typeof Studio!=='undefined'&&typeof App!=='undefined');
  const id=await p.evaluate(async()=>{
    const blob=(w,h,paint)=>{const c=document.createElement('canvas');c.width=w;c.height=h;paint(c.getContext('2d'));return new Promise(r=>c.toBlob(r,'image/png'));};
    const get=async(u)=>(await fetch(u)).blob();
    // a 2 s video whose colour changes every frame, recorded from a canvas
    const c=document.createElement('canvas');c.width=64;c.height=48;const g=c.getContext('2d');const st=c.captureStream(30),mr=new MediaRecorder(st,{mimeType:'video/webm'}),parts=[];
    mr.ondataavailable=(e)=>parts.push(e.data);let f=0;const iv=setInterval(()=>{g.fillStyle='hsl('+(f++*12)%360+',80%,50%)';g.fillRect(0,0,64,48);},33);
    mr.start();await new Promise(r=>setTimeout(r,2000));mr.stop();await new Promise(r=>mr.onstop=r);clearInterval(iv);
    const a=Studio.blankExperience('הקפאה');a.target={artRect:{x:0,y:0,w:300,h:400},natural:{w:300,h:400}};
    a.assets.__artwork=await blob(300,400,g=>{g.fillStyle='#204080';g.fillRect(0,0,300,400);});
    a.assets.glb=await Studio.prepareModelBlob(new File([await get('library/models/fx3d-neon-heart.glb')],'h.glb',{type:'model/gltf-binary'}));
    a.assets.gif=await get('library/pulse.gif');a.assets.vid=await get('assets/demo/art-video.mp4');a.assets.pic=await blob(50,50,g=>{g.fillStyle='#f00';g.fillRect(0,0,50,50);});
    const clips=await Studio.modelClipInfo(a.assets.glb);
    a.elements=[
      {id:'pic',type:'image',name:'תמונה',assetId:'pic',x:-0.3,y:0.3,z:0,w:0.15,h:0.1125,aspect:1,rot:0,flush:true,seq:null,opacity:1},
      {id:'gif',type:'image',name:'GIF',assetId:'gif',x:0.25,y:0.3,z:0,w:0.2,h:0.15,aspect:1,rot:0,flush:true,seq:null,opacity:1},
      {id:'vid',type:'video',name:'סרטון',assetId:'vid',x:-0.25,y:-0.25,z:0,w:0.3,h:0.1688,aspect:4/3,rot:0,flush:true,seq:null,opacity:1,loop:true,volume:1},
      {id:'mod',type:'model',name:'לב',assetId:'glb',x:0.2,y:-0.2,z:0,w:0.3,h:null,aspect:1,rot:0,flush:true,seq:null,opacity:1,seat:'plane',clipDurations:clips.map(c=>c.duration)}];
    await Studio.save(a);return a.id;});
  await p.goto(base+'/index.html#/e/'+id);await p.waitForSelector('#stage-tools:not([hidden])');await p.waitForTimeout(1200);
  const bar=(label)=>p.locator('#sel-bar [aria-label="'+label+'"]');
  const setNum=async(label,v)=>{const n=p.locator('input.num[aria-label="'+label+' (מספר)"]');await n.fill(String(v));await n.dispatchEvent('change');await p.waitForTimeout(300);};

  // a static picture has nothing to freeze
  await p.evaluate(()=>App.select('pic'));await p.waitForTimeout(200);
  assert.equal(await bar('להקפיא תנועה').count(),0,'no switch on a still picture');
  await p.evaluate(()=>App.setTab('style'));await p.waitForTimeout(200);
  assert.equal(await p.locator('.ctl-label',{hasText:'להקפיא תנועה'}).count(),0,'nor in its style tab');

  // the GIF: frozen on the selection bar, then the chosen moment; the canvas stays on one frame
  await p.evaluate(()=>App.select('gif'));await p.waitForTimeout(200);
  await bar('להקפיא תנועה').click();await p.waitForTimeout(400);
  assert.equal(await p.evaluate(()=>App.el('gif').still),true,'the GIF is frozen');
  assert.equal(await bar('להפעיל תנועה').count(),1,'the button now offers to play it again');
  const gifPix=()=>p.evaluate(()=>{const m=App.mediaFor(App.el('gif'));return [m.__held,m.getContext('2d').getImageData(0,0,m.width,m.height).data.reduce((n,v,i)=>(n*31+v*(i%7+1))%1000000007,0)];});
  let g1=await gifPix();await p.waitForTimeout(700);let g2=await gifPix();
  assert.equal(g1[0],0,'first frame by default');assert.equal(g1[1],g2[1],'and it does not move');
  await p.evaluate(()=>App.setTab('style'));await p.waitForTimeout(200);
  assert.ok(await p.locator('.ctl-label',{hasText:'להקפיא תנועה'}).count(),'the style tab has the switch on top');
  await setNum('הרגע שמוצג',25);
  g2=await gifPix();assert.equal(g2[0],0.25,'the chosen moment');assert.notEqual(g2[1],g1[1],'shows another frame');
  assert.equal(await p.evaluate(()=>!!App.media['gif']),false,'the shared playing copy is gone when nothing uses it');

  // the video: paused on its moment, nothing plays it
  await p.evaluate(()=>App.select('vid'));await p.waitForTimeout(200);
  await bar('להקפיא תנועה').click();await p.waitForTimeout(800);
  await setNum('הרגע שמוצג',40);await p.waitForTimeout(800);
  const vs=()=>p.evaluate(()=>{const v=App.mediaFor(App.el('vid'));return {paused:v.paused,t:v.currentTime,d:v.duration};});
  let v1=await vs();await p.evaluate(()=>App.mediaFor(App.el('vid')).play());await p.waitForTimeout(600);let v2=await vs();
  assert.ok(v1.paused&&v2.paused,'the frozen video stays paused, also when asked to play '+JSON.stringify([v1,v2]));
  assert.ok(Math.abs(v1.t-v2.t)<0.01,'on one frame');
  assert.ok(Number.isFinite(v1.d),'the test video has a length');assert.ok(Math.abs(v1.t-0.4*v1.d)<0.15,'at 40% of the video ('+v1.t+' of '+v1.d+')');

  // the model: frozen in the 3D view, on the chosen moment of its clip
  await p.evaluate(()=>App.select('mod'));await p.waitForTimeout(200);
  await bar('להקפיא תנועה').click();await p.waitForTimeout(300);
  assert.equal(await p.evaluate(()=>App.el('mod').modelPlaying),false,'the model keeps its field: modelPlaying false');
  assert.equal(await p.locator('.ctl-label',{hasText:'התנועה פועלת'}).count(),0,'the old switch is folded into the new one');
  await setNum('הרגע שמוצג',50);
  await p.evaluate(()=>App.setMode3d(true));
  await p.waitForFunction(()=>{const n=Editor3D._test.node('mod');const m=n&&n.querySelector('[model-clips]');return m&&m.components['model-clips']&&m.components['model-clips'].mixer;},null,{timeout:20000});
  const mix=()=>p.evaluate(()=>{const c=Editor3D._test.node('mod').querySelector('[model-clips]').components['model-clips'];return {t:c.mixer.time,d:c.action.getClip().duration,playing:c.data.playing,at:c.data.at};});
  let m1=await mix();await p.waitForTimeout(600);let m2=await mix();
  assert.equal(m1.playing,false,'the 3D view does not play it');assert.ok(Math.abs(m1.t-m2.t)<1e-6,'it stands still');
  assert.ok(Math.abs(m1.t-0.5*m1.d)<0.02,'at half its clip ('+m1.t+' of '+m1.d+')');
  await setNum('הרגע שמוצג',20);await p.waitForTimeout(400);m1=await mix();
  assert.ok(Math.abs(m1.t-0.2*m1.d)<0.02,'another moment without a rebuild ('+m1.t+')');
  await p.screenshot({path:'/Users/adibrill/Desktop/brill-ar-work/wt-tools2-shots/freeze-3d.png'});
  await p.evaluate(()=>App.setMode3d(false));await p.waitForTimeout(300);
  await p.evaluate(()=>App.setTab('style'));await p.waitForTimeout(300);
  await p.screenshot({path:'/Users/adibrill/Desktop/brill-ar-work/wt-tools2-shots/freeze-model.png'});
  await p.evaluate(()=>App.flush());

  // the preview: all three still, also after a touch (sound on touch) and a while
  const pv=await ctx.newPage();pv.on('pageerror',e=>errs.push(String(e)));
  await pv.goto(base+'/preview.html#'+id);await pv.waitForFunction(()=>{const sc=document.querySelector('a-scene');return sc&&sc.hasLoaded;},null,{timeout:20000});
  await pv.waitForFunction(()=>{const m=document.querySelector('[model-clips]');return m&&m.components['model-clips']&&m.components['model-clips'].mixer;},null,{timeout:20000});
  const pstate=()=>pv.evaluate(()=>{const c=document.querySelector('[model-clips]').components['model-clips'],v=document.getElementById('m-vid'),gc=document.getElementById('m-gif');
    return {mt:c.mixer.time,md:c.action.getClip().duration,vp:v.paused,vt:v.currentTime,vd:v.duration,gh:gc.__held};});
  await pv.waitForTimeout(1500);let s1=await pstate();
  await pv.mouse.click(200,600);await pv.waitForTimeout(1500);let s2=await pstate();
  assert.ok(Math.abs(s1.mt-0.2*s1.md)<0.02&&Math.abs(s1.mt-s2.mt)<1e-6,'preview: the model stands on its moment '+JSON.stringify([s1,s2]));
  assert.ok(s1.vp&&s2.vp&&Math.abs(s1.vt-s2.vt)<0.01,'preview: the video stays on its frame, also after a touch');
  assert.ok(Math.abs(s1.vt-0.4*s1.vd)<0.15,'preview: at the chosen moment');
  assert.equal(s1.gh,0.25,'preview: the GIF on its frame');

  // an AR-mode build (as play.html builds it) under a stand-in target: found and lost do not start or rewind anything
  await pv.evaluate(async(id)=>{
    const rec=await Studio.load(id);rec.elements.forEach(Studio.normEl);
    if(!AFRAME.primitives.primitives['xrextras-named-image-target'])AFRAME.registerPrimitive('xrextras-named-image-target',{});
    const v=document.createElement('video');v.id='m-ar-vid';v.src=URL.createObjectURL(rec.assets.vid);v.muted=true;v.loop=true;v.setAttribute('playsinline','');v.preload='auto';document.body.appendChild(v);
    const el=rec.elements.find(e=>e.id==='vid');if(Studio.isStill(el))Studio.setStill(v,true,Studio.stillAt(el));
    const target=document.createElement('xrextras-named-image-target');
    const ev=Studio.buildElementEntity(rec,el,0,'ar',{mediaId:()=>'m-ar-vid'}),em=Studio.buildElementEntity(rec,rec.elements.find(e=>e.id==='mod'),1,'ar');
    target.appendChild(ev);target.appendChild(em);document.querySelector('a-scene').appendChild(target);window.__t={target,v,em};
  },id);
  await pv.waitForFunction(()=>{const m=__t.em.querySelector('[model-clips]');return m.components['model-clips']&&m.components['model-clips'].mixer;},null,{timeout:20000});await pv.waitForTimeout(800);
  const ar=()=>pv.evaluate(()=>{const c=__t.em.querySelector('[model-clips]').components['model-clips'];return {mt:c.mixer.time,md:c.action.getClip().duration,vp:__t.v.paused,vt:__t.v.currentTime};});
  const a0=await ar();
  await pv.evaluate(()=>__t.target.emit('xrextrasfound',null,false));await pv.evaluate(()=>document.querySelector('a-scene').emit('xrimagefound'));await pv.waitForTimeout(1200);const a1=await ar();
  await pv.evaluate(()=>__t.target.emit('xrextraslost',null,false));await pv.waitForTimeout(300);const a2=await ar();
  assert.ok(a1.vp&&Math.abs(a1.vt-a0.vt)<0.01,'AR: found does not start the frozen video '+JSON.stringify([a0,a1]));
  assert.ok(Math.abs(a2.vt-a0.vt)<0.01,'AR: lost does not rewind it');
  assert.ok(Math.abs(a0.mt-0.2*a0.md)<0.02&&Math.abs(a1.mt-a0.mt)<1e-6,'AR: the model holds its moment after found '+JSON.stringify([a0,a1]));
  await pv.close();

  // unfreeze: plays again
  await p.evaluate(()=>App.select('vid'));await p.waitForTimeout(200);
  await bar('להפעיל תנועה').click();await p.waitForTimeout(1000);
  v1=await vs();assert.equal(v1.paused,false,'unfrozen, the video plays');
  assert.equal(await p.evaluate(()=>App.el('vid').still),undefined,'and the field is gone');
  await p.evaluate(()=>App.select('mod'));await p.waitForTimeout(200);await bar('להפעיל תנועה').click();await p.waitForTimeout(300);
  await p.evaluate(()=>App.setMode3d(true));await p.waitForTimeout(1500);
  m1=await mix();await p.waitForTimeout(500);m2=await mix();
  assert.ok(m1.playing&&m2.t!==m1.t,'unfrozen, the model moves again');
  // undo brings the freeze back
  await p.evaluate(()=>App.undo());await p.waitForTimeout(800);
  assert.equal(await p.evaluate(()=>App.el('mod').modelPlaying),false,'undo freezes it again');
  // a backup keeps the moment
  const back=await p.evaluate(async()=>{const z=await Studio.exportZIP(App.rec);const r=await Studio.importZIP(z,{save:false});return r.elements.map(e=>[e.id,e.still,e.stillAt,e.modelPlaying]);});
  assert.deepEqual(back.find(x=>x[0]==='gif'),['gif',true,0.25,undefined],'backup keeps the frozen GIF and its moment');
  assert.deepEqual(errs.filter(e=>!/favicon|404/.test(e)),[],'no errors');
  console.log('v2-freeze ok');
}finally{await b.close();server.close();}})().catch(e=>{console.error(e);process.exit(1);});
