const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');const Mock=require('./portal-mock.cjs');
// The viewer portal (view.html) against a stand-in GitHub (portal-mock.cjs). Three creations are published with the
// editor's own code; then: a clean start (straight to the camera, nothing of ours on the screen; on an iPhone without
// the motion permission one wordless full-screen tap); camera frames of one artwork go through the recogniser worker,
// which names it, and only then its media are downloaded and it is mounted under its own image target; the other two
// are made ready in the background; a short loss is held only while the recogniser still sees it; turning to another artwork while one is shown switches in
// place; a blocked camera gets a Hebrew screen with the help page; a direct link (view.html#id) opens its creation;
// "לא מזהה? לבחור מרשימה" (a small icon, after a while);
// a removed creation's link shows a kind message (and keeps working while the public copy still lags); a link to a
// creation published a moment ago opens although the public copy does not list it yet; an in-app browser gets
// "פתחו בדפדפן". The camera itself is not tested here (portal-engine.cjs runs the real engine on a fake camera).
const SHOTS='/Users/adibrill/Desktop/brill-ar-work/wt-portal-shots/';
const ANDROID='Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required']});try{
  require('fs').mkdirSync(SHOTS+'polish',{recursive:true});
  const mock=Mock.create();mock.token=Mock.FAKE_TOKEN;
  const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,userAgent:ANDROID,permissions:['camera']});await mock.attach(ctx);
  // the fake camera has no "back camera" label; a phone does. Test-only: drop that one wish so the engine gets the fake camera.
  const fakeCam=()=>{const md=navigator.mediaDevices;if(!md)return;const o=md.getUserMedia.bind(md);window.__gum=0;md.getUserMedia=(c)=>{window.__gum++;if(c&&c.video&&c.video.facingMode)delete c.video.facingMode;return o(c);};};await ctx.addInitScript(fakeCam);
  const errs=[];const watch=(p)=>{p.on('pageerror',e=>errs.push(String(e)));p.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource|Failed to load image from .\/external\/xrextras-shared|camera|getUserMedia|NotFoundError|OverconstrainedError|NotReadable|WebGL|GL_/i.test(m.text()))errs.push(m.text());});return p;};
  // publish three creations with the editor's code
  const ed=watch(await ctx.newPage());await ed.goto(base+'/index.html');await ed.waitForFunction(()=>typeof Portal!=='undefined'&&typeof App!=='undefined');
  const ids=await ed.evaluate(async(token)=>{
    localStorage.setItem('brill-portal-token',token);
    const rnd=(s)=>()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
    window.__art=(seed)=>{const c=document.createElement('canvas');c.width=600;c.height=800;const g=c.getContext('2d'),r=rnd(seed);g.fillStyle=`hsl(${r()*360},40%,70%)`;g.fillRect(0,0,600,800);
      for(let k=0;k<70;k++){g.fillStyle=`hsl(${r()*360},${40+r()*60}%,${15+r()*70}%)`;g.beginPath();const t=r();if(t<.5)g.arc(r()*600,r()*800,8+r()*70,0,7);else{g.moveTo(r()*600,r()*800);for(let j=0;j<4;j++)g.lineTo(r()*600,r()*800);}g.fill();}
      for(let k=0;k<20;k++){g.strokeStyle=`hsl(${r()*360},80%,${r()*90}%)`;g.lineWidth=3+r()*8;g.beginPath();g.moveTo(r()*600,r()*800);g.bezierCurveTo(r()*600,r()*800,r()*600,r()*800,r()*600,r()*800);g.stroke();}return c;};
    const out=[];
    for(const [name,seed] of [['הדג הכחול',11],['ציפור על גדר',22],['קיר הפרחים',33]]){
      const blob=await new Promise(r=>__art(seed).toBlob(r,'image/png')),img=await Studio.loadImageBlob(blob),t=await Studio.makeTarget(img);
      const a=Studio.blankExperience(name);a.target={artRect:t.artRect,natural:{w:600,h:800},fp:Studio.artworkFingerprint(img)};a.assets.__artwork=blob;
      a.elements=[{id:'txt',type:'text',text:name,x:0,y:0.25,w:0.6,rot:0}];await Studio.save(a,{noHistory:true});
      await Portal.publish(a);out.push(a.id);}
    return out;},Mock.FAKE_TOKEN);
  assert.equal(mock.catalogue().items.length,3,'three published');
  const firstHead=mock.head();

  // 1) the portal, no id: straight into the camera, nothing on the screen; recognition by camera frames
  const p=watch(await ctx.newPage());const raws=[];p.on('request',r=>{if(r.url().startsWith('https://raw.githubusercontent.com/'))raws.push(r.url().split('/published/')[1]);});
  await p.goto(base+'/view.html');
  await p.waitForFunction(()=>window.__portal&&__portal.state()==='looking',null,{timeout:60000});
  // what of OUR page can be seen: nothing (the engine's own record button is the one thing on the camera)
  const ours=()=>p.evaluate(()=>['screen','status','pick','sheet','bar'].filter(id=>{const n=document.getElementById(id);if(!n)return false;const r=n.getBoundingClientRect(),st=getComputedStyle(n);return !n.hidden&&st.display!=='none'&&st.visibility!=='hidden'&&r.width>0&&r.height>0;}));
  assert.deepEqual(await ours(),[],'a clean start: no screen, no words, no buttons of ours');
  assert.equal(await p.evaluate(()=>!!document.getElementById('start')),false,'no start button on Android');
  assert.ok(!(await p.content()).includes('index.html'),'no way into the editor from the viewer page');
  assert.ok(!raws.some(u=>u.startsWith('c/')||(u.startsWith('m/')&&!u.endsWith('.jpg'))),'no creation media before anything is recognised: '+raws.join(' '));
  await p.screenshot({path:SHOTS+'polish/viewer-start-android.png'});
  // "not recognised? choose from a list": a small wordless icon, only after a while
  await p.waitForSelector('#pick',{state:'visible',timeout:12000});
  assert.equal((await p.textContent('#pick')).trim(),'','the list button is an icon, no words');
  assert.ok(/לבחור מרשימה/.test(await p.getAttribute('#pick','aria-label')),'it says what it is to a screen reader');
  const pb=await p.locator('#pick').boundingBox();assert.ok(pb.width<=48&&pb.height<=48,'small: '+JSON.stringify(pb));
  await p.screenshot({path:SHOTS+'polish/viewer-pick-icon.png'});
  // camera-like frames of an artwork (portrait 240x320: turned, slanted, soft, on a wall)
  const frame=async(seed)=>p.evaluate((seed)=>{const rnd=(s)=>()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
    const art=(seed)=>{const c=document.createElement('canvas');c.width=600;c.height=800;const g=c.getContext('2d'),r=rnd(seed);g.fillStyle=`hsl(${r()*360},40%,70%)`;g.fillRect(0,0,600,800);
      for(let k=0;k<70;k++){g.fillStyle=`hsl(${r()*360},${40+r()*60}%,${15+r()*70}%)`;g.beginPath();const t=r();if(t<.5)g.arc(r()*600,r()*800,8+r()*70,0,7);else{g.moveTo(r()*600,r()*800);for(let j=0;j<4;j++)g.lineTo(r()*600,r()*800);}g.fill();}
      for(let k=0;k<20;k++){g.strokeStyle=`hsl(${r()*360},80%,${r()*90}%)`;g.lineWidth=3+r()*8;g.beginPath();g.moveTo(r()*600,r()*800);g.bezierCurveTo(r()*600,r()*800,r()*600,r()*800,r()*600,r()*800);g.stroke();}return c;};
    const W=240,H=320,f=document.createElement('canvas');f.width=W;f.height=H;const g=f.getContext('2d');g.fillStyle='#777';g.fillRect(0,0,W,H);
    g.save();g.translate(W/2,H/2);g.rotate(0.12);g.filter='blur(0.8px) brightness(0.9)';g.drawImage(art(seed),-90,-120,180,240);g.restore();
    const d=g.getImageData(0,0,W,H).data,px=new Uint8Array(W*H);for(let i=0;i<px.length;i++)px[i]=(d[i*4]*77+d[i*4+1]*150+d[i*4+2]*29)>>8;
    __portal.frame(px,W,H);},seed);
  for(let k=0;k<6&&(await p.evaluate(()=>__portal.current()))==null;k++){await frame(22);await p.waitForTimeout(500);}
  await p.waitForFunction((id)=>__portal.mounted().includes(id)&&__portal.state()==='waking',ids[1],{timeout:20000});
  assert.equal(await p.evaluate(()=>__portal.current()),ids[1],'the recogniser named the artwork in front of the camera');
  assert.ok(raws.some(u=>u.startsWith('c/')),'its creation file is downloaded only now');
  assert.equal(await p.evaluate((id)=>[...document.querySelectorAll('xrextras-named-image-target')].some(t=>t.getAttribute('name')===id&&t.querySelector('[data-el-id=txt]')),ids[1]),true,'mounted under its own target');
  await p.evaluate((id)=>document.querySelector('a-scene').emit('xrimagefound',{name:id,position:{x:0,y:0,z:-1},rotation:{x:0,y:0,z:0,w:1},scale:1},false),ids[1]);
  assert.equal(await p.evaluate(()=>__portal.state()),'tracking');assert.deepEqual(await ours(),[],'nothing of ours over the creation while it is shown');
  // the other two (a small catalogue) are fetched and made ready in the background meanwhile
  await p.waitForFunction(()=>__portal.mounted().length===3,null,{timeout:20000});
  // the engine lets go and the recogniser sees nothing: the creation goes after a moment (~0.25 s), never 2 s later
  const vis=(id)=>p.evaluate((id)=>[...document.querySelectorAll('xrextras-named-image-target')].find(t=>t.getAttribute('name')===id).object3D.visible,id);
  // found one metre in front of the camera, facing it (the engine moves the camera, so the pose is the camera's own)
  const found=(id)=>p.evaluate((id)=>{const sc=document.querySelector('a-scene'),c=sc.camera,T=AFRAME.THREE;c.updateMatrixWorld();const pos=c.localToWorld(new T.Vector3(0,0,-1)),q=c.getWorldQuaternion(new T.Quaternion());
    sc.emit('xrimagefound',{name:id,position:{x:pos.x,y:pos.y,z:pos.z},rotation:{x:q.x,y:q.y,z:q.z,w:q.w},scale:1},false);},id);
  await p.evaluate((id)=>document.querySelector('a-scene').emit('xrimagelost',{name:id},false),ids[1]);
  await p.waitForTimeout(500);
  assert.equal(await vis(ids[1]),false,'lost and not seen: the creation goes within half a second');assert.equal(await p.evaluate(()=>__portal.state()),'lost');
  // a reflection: the engine lets go, but the recogniser still sees the same artwork where the creation stands: it stays
  await found(ids[1]);assert.equal(await p.evaluate(()=>__portal.state()),'tracking');
  // (the fake camera's own test picture is paused here: only the frames below reach the recogniser)
  await p.evaluate(()=>XR8.pause());await p.waitForTimeout(300);
  await p.evaluate((id)=>document.querySelector('a-scene').emit('xrimagelost',{name:id},false),ids[1]);
  await p.waitForTimeout(120);assert.equal(await vis(ids[1]),true,'a one-frame flicker is hidden');
  for(let k=0;k<8;k++){await frame(22);await p.waitForTimeout(150);}
  assert.equal(await p.evaluate(()=>__portal.holding()),ids[1],'held while the recogniser sees it');assert.equal(await vis(ids[1]),true,'still shown under the reflection');
  const w=await p.evaluate(()=>__portal.where());assert.ok(w&&w.seen&&Math.abs(w.seen[0]-w.screen[0])<0.1&&Math.abs(w.seen[1]-w.screen[1])<0.1,'seen where it stands: '+JSON.stringify(w));
  // found again within the hold: nothing happened
  await found(ids[1]);await p.waitForTimeout(400);
  assert.equal(await p.evaluate(()=>__portal.state()),'tracking','found again within the moment: still shown');assert.equal(await p.evaluate(()=>__portal.holding()),null);
  // lost again, and a frame taken after it shows something else: the creation goes at once (no waiting out the hold)
  await p.evaluate((id)=>document.querySelector('a-scene').emit('xrimagelost',{name:id},false),ids[1]);await frame(99);
  await p.waitForFunction((id)=>![...document.querySelectorAll('xrextras-named-image-target')].find(t=>t.getAttribute('name')===id).object3D.visible,ids[1],{timeout:400});
  await found(ids[1]);
  // turning to the next artwork while this one is shown: it switches in place, without a new download
  const cBefore=raws.filter(u=>u.startsWith('c/')).length;
  for(let k=0;k<6&&(await p.evaluate(()=>__portal.current()))!==ids[2];k++){await frame(33);await p.waitForTimeout(700);}
  await p.waitForFunction((id)=>__portal.current()===id&&__portal.state()==='waking',ids[2],{timeout:20000});
  assert.equal(raws.filter(u=>u.startsWith('c/')).length,cBefore,'already in memory: nothing downloaded again');
  assert.equal(await p.evaluate((id)=>{const t=[...document.querySelectorAll('xrextras-named-image-target')].find(t=>t.getAttribute('name')===id);return t.object3D.visible;},ids[1]),false,'the creation shown before stepped aside at once');
  assert.equal(raws.filter(u=>u.startsWith('c/')).length,3,'each creation downloaded once: '+raws.filter(u=>u.startsWith('c/')).join(' '));
  // list fallback (the icon shows again after a while without an artwork)
  await p.evaluate((id)=>document.querySelector('a-scene').emit('xrimagefound',{name:id,position:{x:0,y:0,z:-1},rotation:{x:0,y:0,z:0,w:1},scale:1},false),ids[2]);
  await p.evaluate((id)=>document.querySelector('a-scene').emit('xrimagelost',{name:id},false),ids[2]);
  await p.waitForFunction(()=>__portal.state()==='looking',null,{timeout:8000});
  await p.waitForSelector('#pick',{state:'visible',timeout:12000});
  await p.click('#pick');await p.waitForSelector('#sheet .tile img');await p.waitForTimeout(400);
  assert.equal(await p.locator('#sheet .tile').count(),3);
  await p.screenshot({path:SHOTS+'polish/viewer-list.png'});
  await p.locator('#sheet .tile',{hasText:'הדג הכחול'}).click();
  await p.waitForFunction((id)=>__portal.current()===id&&__portal.mounted().includes(id),ids[0],{timeout:20000});
  // a blocked camera: our own Hebrew screen with the way to allow it
  await p.evaluate(()=>document.querySelector('a-scene').emit('camerastatuschange',{status:'failed'},false));
  await p.waitForFunction(()=>document.body.dataset.state==='camera-blocked');
  assert.match(await p.textContent('#screen'),/המצלמה חסומה/);assert.equal(await p.getAttribute('#screen a','href'),'camera-help.html','a link to the help page');
  await p.screenshot({path:SHOTS+'polish/viewer-camera-blocked.png'});
  await p.close();

  // 2) a direct link (the QR beside an artwork): straight to its creation, no screen
  const q=watch(await ctx.newPage());await q.goto(base+'/view.html#'+ids[0]);
  await q.waitForFunction((id)=>window.__portal&&__portal.mounted().includes(id),ids[0],{timeout:60000});
  assert.equal(await q.evaluate(()=>!!document.getElementById('start')),false);
  await q.close();
  const q2=watch(await ctx.newPage());await q2.goto(base+'/view.html?c='+ids[2]);await q2.waitForFunction((id)=>window.__portal&&__portal.mounted().includes(id),ids[2],{timeout:60000});await q2.close();
  // an iPhone, with or without the motion permission: straight to the camera, no tap and no question about motion
  const IPHONE='Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
  for(const allowed of [false,true]){
    const ic=await b.newContext({viewport:{width:375,height:812},isMobile:true,hasTouch:true,userAgent:IPHONE,permissions:['camera']});await mock.attach(ic);await ic.addInitScript(fakeCam);
    await ic.addInitScript((allowed)=>{window.__asked=0;const ask=()=>{window.__asked++;return navigator.userActivation&&navigator.userActivation.isActive||allowed?Promise.resolve('granted'):Promise.reject(new DOMException('needs a gesture','NotAllowedError'));};window.DeviceMotionEvent.requestPermission=ask;window.DeviceOrientationEvent.requestPermission=ask;},allowed);
    const ip=watch(await ic.newPage());await ip.goto(base+'/view.html#'+ids[0]);
    // the motion sensors are never asked for (the engine's own request is answered in ar-mount.js): no tap screen either way
    await ip.waitForFunction((id)=>window.__portal&&__portal.mounted().includes(id),ids[0],{timeout:60000});
    assert.equal(await ip.evaluate(()=>!!document.getElementById('start')),false,'no tap screen (allowed before: '+allowed+')');
    assert.equal(await ip.evaluate(()=>window.__asked),0,'the viewer is not asked for the motion sensors');
    assert.equal(await ip.evaluate(async()=>await DeviceMotionEvent.requestPermission()),'granted','the engine gets its answer without a question');
    assert.equal(await ip.evaluate(()=>window.__asked),0);
    await ic.close();
  }

  // 3) removed: while the public copy still lags it keeps working; then a kind message
  await ed.evaluate(async(id)=>{await Portal.unpublish(id);},ids[2]);
  mock.rawLag=firstHead;
  const r1=watch(await ctx.newPage());await r1.goto(base+'/view.html#'+ids[2]);await r1.waitForFunction((id)=>window.__portal&&__portal.current()===id,ids[2],{timeout:60000});await r1.close();
  mock.rawLag=null;
  const r2=watch(await ctx.newPage());await r2.goto(base+'/view.html#'+ids[2]);await r2.waitForFunction(()=>document.body.dataset.state==='gone');
  assert.match(await r2.textContent('#screen'),/כבר לא מוצגת כאן/);assert.equal(await r2.getAttribute('#screen a','href'),'view.html','a way to the other artworks, not to the editor');
  await r2.screenshot({path:SHOTS+'polish/viewer-removed.png'});await r2.close();
  const r3=watch(await ctx.newPage());await r3.goto(base+'/view.html#not-a-real-id');await r3.waitForFunction(()=>document.body.dataset.state==='gone');await r3.close();
  // 4) published a moment ago: the public copy does not know it yet, GitHub's API does
  const lagHead=mock.head();
  const newId=await ed.evaluate(async()=>{const blob=await new Promise(r=>__art(44).toBlob(r,'image/png')),img=await Studio.loadImageBlob(blob),t=await Studio.makeTarget(img);const a=Studio.blankExperience('חדשה לגמרי');a.target={artRect:t.artRect,natural:{w:600,h:800},fp:Studio.artworkFingerprint(img)};a.assets.__artwork=blob;a.elements=[];await Studio.save(a,{noHistory:true});await Portal.publish(a);return a.id;});
  mock.rawLag=lagHead;
  const n1=watch(await ctx.newPage());await n1.goto(base+'/view.html#'+newId);await n1.waitForFunction((id)=>window.__portal&&__portal.current()===id,newId,{timeout:60000});await n1.close();
  mock.rawLag=null;

  // 5) in-app browsers do not give the camera: "open in the browser"
  for(const [ua,shot] of [['Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0.0','viewer-inapp-iphone.png'],[ANDROID.replace('Mobile Safari','Mobile Safari [FBAN/EMA;FBLC/he_IL;FBAV/400.0]'),'viewer-inapp-android.png']]){
    const c2=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,userAgent:ua});await mock.attach(c2);
    const ip=watch(await c2.newPage());await ip.goto(base+'/view.html#'+ids[0]);await ip.waitForFunction(()=>document.body.dataset.state==='inapp');
    const t=await ip.textContent('#screen');assert.match(t,/לפתוח את הקישור בדפדפן/);
    if(/iPhone/.test(ua))assert.match(t,/Safari/);else assert.ok(await ip.locator('a[href^="intent://"]').count()===1,'Android: a button that opens Chrome');
    await ip.screenshot({path:SHOTS+'polish/'+shot});await c2.close();
  }
  assert.deepEqual(errs,[],'no errors');
  console.log('portal-viewer ok');
}finally{await b.close();server.close();}})().catch(e=>{console.error(e);process.exit(1);});
