const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');
// The pause button on the stage (in place of the old magnet; snapping to the middle is always on): one tap stops the
// creation's motion while she works (a layer's path, an animated GIF, a video, a 3D model's clip) and shows a play
// icon; a second tap goes on from the same moment. It stays in the 3D view. Phone size, touch. Headless Chrome.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
 try{
  const ctx=await b.newContext({viewport:{width:375,height:812},isMobile:true,hasTouch:true});
  const p=await ctx.newPage(),errs=[];p.on('pageerror',e=>errs.push(String(e)));p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await p.goto(base+'/index.html');await p.waitForFunction(()=>typeof Studio!=='undefined'&&typeof App!=='undefined');
  const id=await p.evaluate(async()=>{
    const blob=(w,h,paint)=>{const c=document.createElement('canvas');c.width=w;c.height=h;paint(c.getContext('2d'));return new Promise(r=>c.toBlob(r,'image/png'));};
    const get=async(u)=>(await fetch(u)).blob();
    const a=Studio.blankExperience('עצירה');a.target={artRect:{x:0,y:0,w:300,h:400},natural:{w:300,h:400}};
    a.assets.__artwork=await blob(300,400,g=>{g.fillStyle='#204080';g.fillRect(0,0,300,400);});
    a.assets.glb=await Studio.prepareModelBlob(new File([await get('library/models/fx3d-neon-heart.glb')],'h.glb',{type:'model/gltf-binary'}));
    a.assets.gif=await get('library/pulse.gif');a.assets.vid=await get('assets/demo/art-video.mp4');a.assets.pic=await blob(50,50,g=>{g.fillStyle='#f00';g.fillRect(0,0,50,50);});
    const clips=await Studio.modelClipInfo(a.assets.glb);
    a.elements=[
      {id:'pic',type:'image',name:'תמונה',assetId:'pic',x:-0.3,y:0.3,z:0,w:0.15,h:0.15,aspect:1,rot:0,flush:true,seq:null,opacity:1,
       timeline:{loop:true,ease:'linear',keys:[{t:0,x:-0.3,y:0.3,rot:0,scale:1},{t:2,x:0.3,y:0.3,rot:0,scale:1},{t:4,x:-0.3,y:0.3,rot:0,scale:1}]}},
      {id:'gif',type:'image',name:'GIF',assetId:'gif',x:0.25,y:0.1,z:0,w:0.2,h:0.15,aspect:1,rot:0,flush:true,seq:null,opacity:1},
      {id:'vid',type:'video',name:'סרטון',assetId:'vid',x:-0.25,y:-0.25,z:0,w:0.3,h:0.1688,aspect:4/3,rot:0,flush:true,seq:null,opacity:1,loop:true,volume:1},
      {id:'mod',type:'model',name:'לב',assetId:'glb',x:0.2,y:-0.2,z:0,w:0.3,h:null,aspect:1,rot:0,flush:true,seq:null,opacity:1,seat:'plane',clipDurations:clips.map(c=>c.duration)}];
    await Studio.save(a);return a.id;});
  await p.goto(base+'/index.html#/e/'+id);await p.waitForSelector('#stage-tools:not([hidden])');await p.waitForTimeout(1500);

  assert.equal(await p.locator('#btn-snap').count(),0,'the magnet is gone');
  const btn=p.locator('#btn-pause');assert.ok(await btn.isVisible(),'the pause button is on the stage');
  assert.equal(await btn.getAttribute('aria-label'),'לעצור את התנועה');assert.equal(await btn.getAttribute('aria-pressed'),'false');

  const look=()=>p.evaluate(()=>{const v=App.mediaFor(App.el('vid')),g=App.mediaFor(App.el('gif'));
    return {clock:App.clock(),x:App.sample(App.el('pic')).x,vt:v.currentTime,vp:v.paused,gif:g.getContext('2d').getImageData(0,0,g.width,g.height).data.reduce((n,v,i)=>(n*31+v*(i%7+1))%1000000007,0)};});
  // playing: things move
  let a1=await look();await p.waitForTimeout(800);let a2=await look();
  assert.ok(a2.clock>a1.clock&&a2.x!==a1.x,'the path moves while playing');assert.ok(a2.vt>a1.vt,'the video plays');

  // pause: everything rests
  await btn.click();await p.waitForTimeout(400);
  assert.equal(await btn.getAttribute('aria-pressed'),'true');assert.equal(await btn.getAttribute('aria-label'),'להמשיך את התנועה');
  assert.ok(await btn.locator('svg[fill="currentColor"]').count(),'the play icon shows');
  const parked=await p.evaluate(()=>App.frozen);assert.ok(parked!=null,'the playhead is parked');
  let h1=await look();await p.waitForTimeout(900);let h2=await look();
  assert.equal(h2.clock,h1.clock,'time stands still');assert.equal(h2.x,h1.x,'the path rests');
  assert.ok(h2.vp&&Math.abs(h2.vt-h1.vt)<0.01,'the video is paused');assert.equal(h2.gif,h1.gif,'the GIF holds its frame');

  // the 3D view: the button stays, the model's clip holds while paused
  await p.locator('#btn-3d').click();await p.waitForFunction(()=>document.querySelector('#stage').classList.contains('is-3d'),null,{timeout:20000});
  assert.ok(await btn.isVisible(),'the button stays in 3D');
  await p.waitForFunction(()=>{const n=document.querySelector('#editor-3d-host [model-clips]');return n&&n.components['model-clips'].mixer;},null,{timeout:20000});
  const mix=()=>p.evaluate(()=>document.querySelector('#editor-3d-host [model-clips]').components['model-clips'].mixer.time);
  let m1=await mix();await p.waitForTimeout(800);let m2=await mix();assert.ok(Math.abs(m2-m1)<0.01,'the model clip holds '+[m1,m2]);

  // play: goes on from the same moment
  await btn.click();await p.waitForTimeout(150);
  const c0=await p.evaluate(()=>App.clock());assert.equal(await p.evaluate(()=>App.frozen),null,'playing again');
  assert.ok(c0>=parked&&c0<parked+0.6,'goes on from the parked moment ('+parked+' → '+c0+')');
  await p.waitForTimeout(800);m1=await mix();await p.waitForTimeout(600);m2=await mix();assert.ok(m2>m1,'the model clip runs again');
  await p.locator('#btn-2d').click();await p.waitForTimeout(800);
  h1=await look();await p.waitForTimeout(900);h2=await look();
  assert.ok(h2.x!==h1.x,'the path moves again');assert.ok(!h2.vp&&h2.vt!==h1.vt,'the video plays again');

  assert.equal(errs.filter(e=>!/favicon|404/.test(e)).length,0,'no page errors: '+errs.join(' | '));
  console.log('pause button: all checks pass');
 }finally{await b.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
