const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');const Mock=require('./portal-mock.cjs');
// The "מזג אוויר ריאליסטי" library group: ten filmed-looking weather loops on black. Every file and thumbnail is there, is
// an H.264 video the browser reads, square, a few seconds long and under 3 MB. One tap in the library adds a looping video
// layer across the artwork with the soft black ("glow") key on; the camera-free preview draws it through the keyed
// material and plays it; an AR-mode build (as play.html and the portal build it) waits for the artwork, then plays it
// keyed; published on the portal (stand-in GitHub, portal-mock.cjs) it reaches view.html with its key. Headless Chrome.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});try{
  const mock=Mock.create();mock.token=Mock.FAKE_TOKEN;
  const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,permissions:['camera']});await mock.attach(ctx);
  const errs=[];const watch=(p)=>{p.on('pageerror',e=>errs.push(String(e)));p.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource|xrextras|camera|getUserMedia|NotFoundError|OverconstrainedError|NotReadable|WebGL|GL_|GPU stall/i.test(m.text()))errs.push(m.text().slice(0,300));});return p;};
  const p=watch(await ctx.newPage());
  await p.goto(base+'/index.html');await p.waitForFunction(()=>typeof Studio!=='undefined'&&typeof App!=='undefined'&&typeof StarterLibrary!=='undefined');

  // the files
  const files=await p.evaluate(async()=>{const out=[];for(const e of StarterLibrary.entries.filter(x=>x.group==='weather-real'&&x.kind==='video')){
    const r=await fetch('library/'+e.file),blob=await r.blob(),t=await fetch('library/'+e.thumb);let info=null;try{info=await Studio.inspectVideo(new File([blob],'x.mp4',{type:'video/mp4'}));}catch(x){}
    const v=document.createElement('video');v.muted=true;v.src=URL.createObjectURL(blob);await new Promise(res=>{v.onloadedmetadata=res;v.onerror=res;});
    out.push({id:e.id,kind:e.kind,ok:r.ok,thumb:t.ok,bytes:blob.size,w:info&&info.width,h:info&&info.height,dur:v.duration,key:e.chroma});}return out;});
  assert.equal(files.length,10,'ten realistic weather entries');
  for(const f of files){
    assert.ok(f.ok&&f.thumb,f.id+': the video and its thumbnail are there');assert.equal(f.kind,'video');
    assert.ok(f.bytes<3e6,f.id+': under 3 MB ('+f.bytes+')');assert.equal(f.w,720,f.id+' width');assert.equal(f.h,720,f.id+' height');
    assert.ok(f.dur>=3.9&&f.dur<=10.1,f.id+': a loop of a few seconds ('+f.dur+')');
    assert.deepEqual([f.key.enabled,f.key.color],[true,'#000000'],f.id+': the soft black key comes with it');
  }
  console.log('PASS files: ten H.264 loops, 720x720, 4-10 s, under 3 MB, thumbnails; sizes',files.map(f=>f.id+' '+(f.bytes/1e6).toFixed(2)+'MB').join(', '));

  // the library adds it
  const id=await p.evaluate(async()=>{const a=Studio.blankExperience('מזג אוויר');a.target={artRect:{x:0,y:0,w:300,h:400},natural:{w:300,h:400}};
    const c=document.createElement('canvas');c.width=300;c.height=400;const g=c.getContext('2d');g.fillStyle='#406080';g.fillRect(0,0,300,400);g.fillStyle='#c08040';g.fillRect(60,200,180,150);
    a.assets.__artwork=await new Promise(r=>c.toBlob(r));a.elements=[];await Studio.save(a);return a.id;});
  await p.goto(base+'/index.html#/e/'+id);await p.waitForSelector('#btn-add');await p.waitForTimeout(500);
  if(await p.locator('.tab[data-tab="layers"]').isVisible())await p.locator('.tab[data-tab="layers"]').click();
  await p.locator('#btn-add').click();await p.locator('dialog[open] .add-tile[data-add="weather"]').click();await p.waitForSelector('dialog[open] .part-tile[data-weather="wr-snow"]');
  assert.equal(await p.locator('dialog[open] .part-tile[data-weather]').count(),18,'the weather sheet: sun, smoke, ten loops and six editable particle styles');
  await p.locator('dialog[open] .part-tile[data-weather="wr-snow"]').click();
  await p.waitForFunction(()=>App.rec&&App.rec.elements.length===1,null,{timeout:30000});await p.waitForTimeout(800);
  const el=await p.evaluate(async(id)=>{const r=await Studio.load(id),e=r.elements[0];return {type:e.type,name:e.name,w:e.w,aspect:e.aspect,loop:e.loop,chroma:e.chroma,mime:r.assets[e.assetId].type,size:r.assets[e.assetId].size};},id);
  assert.equal(el.type,'video');assert.equal(el.name,'שלג רך');assert.equal(el.w,1,'across the artwork');assert.equal(el.aspect,1);assert.equal(el.loop,true,'it loops');
  assert.deepEqual([el.chroma.enabled,el.chroma.color],[true,'#000000'],'the glow key is on');assert.equal(el.mime,'video/mp4');
  console.log('PASS editor: the weather sheet, and one tap adds a looping keyed video layer across the artwork');

  // the camera-free preview
  const q=watch(await ctx.newPage());await q.goto(base+'/preview.html#'+id);
  const pv=await q.waitForFunction(()=>{const e=document.querySelector('a-scene [studio-fx]'),m=e&&e.getObject3D('mesh'),r=document.querySelector('a-scene')?.renderer;if(!m||!m.material||!m.material.map||!r)return false;
    const prog=r.properties.get(m.material).currentProgram,v=m.material.map.image;return prog&&{key:+e.getAttribute('studio-fx').key,runs:prog.diagnostics?prog.diagnostics.runnable:true,t:v&&v.currentTime};},null,{timeout:40000}).then(h=>h.jsonValue());
  await q.waitForTimeout(1200);
  const t2=await q.evaluate(()=>document.querySelector('a-scene [studio-fx]').getObject3D('mesh').material.map.image.currentTime);
  assert.equal(pv.key,2,'the preview draws it with the glow key');assert.equal(pv.runs,true);assert.ok(t2>pv.t,'and the video plays ('+pv.t+' -> '+t2+')');
  await q.close();
  console.log('PASS preview: keyed material, playing');

  // the AR-mode build (play.html and the portal): still until the artwork is found, then playing, keyed
  const ar=watch(await ctx.newPage());await ar.goto(base+'/preview.html#'+id);await ar.waitForFunction(()=>{const sc=document.querySelector('a-scene');return sc&&sc.hasLoaded;},null,{timeout:30000});
  await ar.evaluate(async(id)=>{const a=await Studio.load(id),el=Object.assign({},a.elements[0],{id:'ar1'}); // its own id: the preview has its own copy of the video
    if(!AFRAME.primitives.primitives['xrextras-named-image-target'])AFRAME.registerPrimitive('xrextras-named-image-target',{});
    const v=document.createElement('video');v.id='m-'+el.id;v.src=URL.createObjectURL(a.assets[el.assetId]);v.muted=true;v.loop=true;v.setAttribute('playsinline','');v.preload='auto';document.body.appendChild(v);
    const target=document.createElement('xrextras-named-image-target'),e=Studio.buildElementEntity(a,el,0,'ar',{});target.appendChild(e);document.querySelector('a-scene').appendChild(target);window.__t={target,video:v,e};},id);
  await ar.waitForFunction(()=>__t.e.getAttribute('studio-fx'),null,{timeout:15000});
  assert.equal(await ar.evaluate(()=>__t.video.paused),true,'waits for the artwork');
  await ar.evaluate(()=>__t.target.emit('xrextrasfound',null,false));await ar.waitForTimeout(1500);
  const st=await ar.evaluate(()=>({paused:__t.video.paused,key:+__t.e.getAttribute('studio-fx').key,t:__t.video.currentTime}));
  assert.equal(st.paused,false,'plays when the artwork is found');assert.equal(st.key,2,'keyed in AR');assert.ok(st.t>0);
  await ar.close();
  console.log('PASS AR build: waits, then plays keyed');

  // published on the portal, seen in view.html
  await p.evaluate(async([id,token])=>{localStorage.setItem('brill-portal-token',token);const a=await Studio.load(id);
    const c=document.createElement('canvas');c.width=600;c.height=800;const g=c.getContext('2d');for(let k=0;k<300;k++){g.fillStyle=`hsl(${k*37%360},60%,${20+k*13%60}%)`;g.fillRect((k*97)%600,(k*61)%800,20+k%50,20+k%70);}
    const blob=await new Promise(r=>c.toBlob(r,'image/png')),img=await Studio.loadImageBlob(blob),t=await Studio.makeTarget(img);
    a.target={artRect:t.artRect,natural:{w:600,h:800},fp:Studio.artworkFingerprint(img)};a.assets.__artwork=blob;await Studio.save(a,{noHistory:true});await Portal.publish(a);},[id,Mock.FAKE_TOKEN]);
  const item=mock.catalogue().items.find(i=>i.src===id);assert.ok(item,'published');
  const scene=JSON.parse(mock.read(item.scene).toString('utf8'));
  assert.deepEqual([scene.elements[0].type,scene.elements[0].chroma.enabled,scene.elements[0].chroma.color],['video',true,'#000000'],'the published scene keeps the key');
  assert.ok(item.files.some(f=>f.endsWith('.mp4')),'the video file goes up with it');
  const vw=watch(await ctx.newPage());await vw.goto(base+'/view.html#'+item.id);
  await vw.waitForFunction((id)=>window.__portal&&__portal.mounted().includes(id),item.id,{timeout:60000});
  const vk=await vw.waitForFunction(()=>{const e=document.querySelector('a-scene [studio-fx]');return e&&+e.getAttribute('studio-fx').key;},null,{timeout:30000}).then(h=>h.jsonValue());
  assert.equal(vk,2,'view.html builds it with the glow key');await vw.close();
  console.log('PASS portal: published with its video and key, built keyed in view.html');
  assert.deepEqual(errs,[],'no page errors');
  console.log('PASS library-weather-real');
}finally{await b.close();server.close();}})().catch(e=>{console.error(e&&e.stack||e);process.exit(1)});
