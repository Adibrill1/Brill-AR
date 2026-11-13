const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');
// Scattered videos in the camera: the AR player builds layers in 'ar' mode, where a video waits for the artwork to be
// found before it plays and fades in. Inside a scatter its parent is the scatter's wrapper, not the artwork target, so it
// must still hear "found" and "lost" from the target. Built in 'ar' mode as play.html does, inside the preview page's scene, under a stand-in target that
// fires the same events; the copies must turn visible and the video must play, then stop when the artwork is lost.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});try{
  const ctx=await b.newContext({viewport:{width:375,height:812},isMobile:true,hasTouch:true});
  const p=await ctx.newPage(),errs=[];p.on('pageerror',e=>errs.push(String(e)));p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  // a plain creation only to get the preview page's camera-free scene running; the AR-mode scatter is built into it
  await p.goto(base+'/index.html');await p.waitForFunction(()=>typeof Studio!=='undefined');
  const id=await p.evaluate(async()=>{const c=document.createElement('canvas');c.width=300;c.height=400;const a=Studio.blankExperience('במה');a.target={artRect:{x:0,y:0,w:300,h:400},natural:{w:300,h:400}};
    a.assets.__artwork=await new Promise(r=>c.toBlob(r,'image/png'));a.elements=[];await Studio.save(a);return a.id;});
  await p.goto(base+'/preview.html#'+id);await p.waitForFunction(()=>{const sc=document.querySelector('a-scene');return sc&&sc.hasLoaded;},null,{timeout:20000});
  await p.evaluate(async()=>{
    // a short green video, recorded from a canvas
    const c=document.createElement('canvas');c.width=64;c.height=48;const g=c.getContext('2d');const st=c.captureStream(30),mr=new MediaRecorder(st,{mimeType:'video/webm'}),parts=[];
    mr.ondataavailable=(e)=>parts.push(e.data);let f=0;const iv=setInterval(()=>{g.fillStyle=f++%2?'#00c040':'#00a030';g.fillRect(0,0,64,48);},33);
    mr.start();await new Promise(r=>setTimeout(r,800));mr.stop();await new Promise(r=>mr.onstop=r);clearInterval(iv);
    const vid=new Blob(parts,{type:'video/webm'});
    const a=Studio.blankExperience('וידאו בפיזור');a.target={artRect:{x:0,y:0,w:300,h:400},natural:{w:300,h:400}};a.assets.vid=vid;
    const src={id:'v',type:'video',name:'סרטון',assetId:'vid',x:0,y:0,z:0,w:0.2,h:0.15,aspect:4/3,rot:0,flush:true,seq:null,opacity:1};
    a.elements=[src];const s=Studio.makeScatter(a,src,[{x:-0.3,y:-0.3,z:0},{x:0,y:0,z:0.2},{x:0.3,y:0.3,z:0.4}],{curved:true});s.scatter.count=5;a.elements.push(s);
    if(!AFRAME.primitives.primitives['xrextras-named-image-target'])AFRAME.registerPrimitive('xrextras-named-image-target',{});
    const scene=document.querySelector('a-scene');
    const v=document.createElement('video');v.id='m-'+s.id;v.src=URL.createObjectURL(vid);v.muted=true;v.loop=true;v.setAttribute('playsinline','');v.preload='auto';
    document.body.appendChild(v);
    const target=document.createElement('xrextras-named-image-target');const e=Studio.buildElementEntity(a,s,0,'ar',{});target.appendChild(e);scene.appendChild(target);
    window.__t={target,video:v,wrap:e};
  });
  await p.waitForFunction(()=>((__t.wrap.components&&__t.wrap.components['studio-scatter']||{}).copies||[]).length>0,null,{timeout:15000});
  const state=()=>p.evaluate(()=>{const cs=__t.wrap.components['studio-scatter'].copies;return {n:cs.length,op:cs.map(m=>m.material.opacity),paused:__t.video.paused};});
  let s=await state();
  assert.equal(s.n,5,'five video copies');
  assert.ok(s.op.every(o=>o===0)&&s.paused,'hidden and still until the artwork is found '+JSON.stringify(s));
  await p.evaluate(()=>__t.target.emit('xrextrasfound',null,false));await p.waitForTimeout(1500);
  s=await state();
  assert.ok(s.op.every(o=>o>0.99),'the copies fade in when the artwork is found '+JSON.stringify(s.op));
  assert.equal(s.paused,false,'and the video plays');
  await p.evaluate(()=>__t.target.emit('xrextraslost',null,false));await p.waitForTimeout(200);
  s=await state();
  assert.ok(s.paused&&s.op.every(o=>o===0),'lost: hidden and stopped again');
  assert.deepEqual(errs.filter(e=>!/favicon|404/.test(e)),[],'no errors');
  console.log('v2-scatter-ar ok');
}finally{await b.close();server.close();}})().catch(e=>{console.error(e);process.exit(1);});
