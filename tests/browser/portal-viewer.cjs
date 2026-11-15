const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');const Mock=require('./portal-mock.cjs');
// The viewer portal (view.html) against a stand-in GitHub (portal-mock.cjs). Three creations are published with the
// editor's own code; then: the start screen; camera frames of one artwork go through the recogniser worker, which names
// it, and only then its media are downloaded and it is mounted under its own image target (found / lost move it; out of
// sight a few seconds -> looking again); a direct link (view.html#id) opens its creation; "לא מזהה? לבחור מרשימה";
// a removed creation's link shows a kind message (and keeps working while the public copy still lags); a link to a
// creation published a moment ago opens although the public copy does not list it yet; an in-app browser gets
// "פתחו בדפדפן". The camera itself is not tested here (portal-engine.cjs runs the real engine on a fake camera).
const SHOTS='/Users/adibrill/Desktop/brill-ar-work/wt-portal-shots/';
const ANDROID='Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required']});try{
  require('fs').mkdirSync(SHOTS,{recursive:true});
  const mock=Mock.create();mock.token=Mock.FAKE_TOKEN;
  const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,userAgent:ANDROID,permissions:['camera']});await mock.attach(ctx);
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

  // 1) the portal, no id: start screen, then recognition by camera frames
  const p=watch(await ctx.newPage());const raws=[];p.on('request',r=>{if(r.url().startsWith('https://raw.githubusercontent.com/'))raws.push(r.url().split('/published/')[1]);});
  await p.goto(base+'/view.html');await p.waitForSelector('#start');
  assert.match(await p.textContent('#screen'),/יצירות שמתעוררות/);
  await p.screenshot({path:SHOTS+'viewer-start.png'});
  assert.ok(!(await p.content()).includes('index.html'),'no way into the editor from the viewer page');
  await p.click('#start');await p.waitForFunction(()=>window.__portal&&__portal.state()==='looking',null,{timeout:60000});
  assert.equal(await p.isVisible('#pick'),true,'"choose from a list" is there');
  assert.match(await p.textContent('#status'),/מכוונים את המצלמה/);
  assert.ok(!raws.some(u=>u.startsWith('c/')||(u.startsWith('m/')&&!u.endsWith('.jpg'))),'no creation media before anything is recognised: '+raws.join(' '));
  // camera-like frames of the second artwork (portrait 240x320: turned, slanted, soft, on a wall)
  const frame=async(seed)=>p.evaluate((seed)=>{const rnd=(s)=>()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
    const art=(seed)=>{const c=document.createElement('canvas');c.width=600;c.height=800;const g=c.getContext('2d'),r=rnd(seed);g.fillStyle=`hsl(${r()*360},40%,70%)`;g.fillRect(0,0,600,800);
      for(let k=0;k<70;k++){g.fillStyle=`hsl(${r()*360},${40+r()*60}%,${15+r()*70}%)`;g.beginPath();const t=r();if(t<.5)g.arc(r()*600,r()*800,8+r()*70,0,7);else{g.moveTo(r()*600,r()*800);for(let j=0;j<4;j++)g.lineTo(r()*600,r()*800);}g.fill();}
      for(let k=0;k<20;k++){g.strokeStyle=`hsl(${r()*360},80%,${r()*90}%)`;g.lineWidth=3+r()*8;g.beginPath();g.moveTo(r()*600,r()*800);g.bezierCurveTo(r()*600,r()*800,r()*600,r()*800,r()*600,r()*800);g.stroke();}return c;};
    const W=240,H=320,f=document.createElement('canvas');f.width=W;f.height=H;const g=f.getContext('2d');g.fillStyle='#777';g.fillRect(0,0,W,H);
    g.save();g.translate(W/2,H/2);g.rotate(0.12);g.filter='blur(0.8px) brightness(0.9)';g.drawImage(art(seed),-90,-120,180,240);g.restore();
    const d=g.getImageData(0,0,W,H).data,px=new Uint8Array(W*H);for(let i=0;i<px.length;i++)px[i]=(d[i*4]*77+d[i*4+1]*150+d[i*4+2]*29)>>8;
    __portal.frame(px,W,H);},seed);
  for(let k=0;k<4&&!(await p.evaluate(()=>__portal.state()!=='looking'));k++){await frame(22);await p.waitForTimeout(700);}
  await p.waitForFunction(()=>__portal.mounted().length===1,null,{timeout:20000});
  assert.equal(await p.evaluate(()=>__portal.current()),ids[1],'the recogniser named the artwork in front of the camera');
  assert.equal(await p.evaluate(()=>__portal.state()),'waking','its creation is mounted and the engine is told about it');
  assert.ok(raws.some(u=>u.startsWith('c/')),'its creation file is downloaded only now');
  assert.equal(await p.evaluate((id)=>document.querySelector('xrextras-named-image-target').getAttribute('name')===id&&!!document.querySelector('[data-el-id=txt]'),ids[1]),true,'mounted under its own target');
  await p.evaluate((id)=>document.querySelector('a-scene').emit('xrimagefound',{name:id,position:{x:0,y:0,z:-1},rotation:{x:0,y:0,z:0,w:1},scale:1},false),ids[1]);
  assert.equal(await p.evaluate(()=>__portal.state()),'tracking');assert.equal(await p.isVisible('#status'),false,'nothing over the creation while it is shown');
  await p.evaluate((id)=>document.querySelector('a-scene').emit('xrimagelost',{name:id},false),ids[1]);
  await p.waitForFunction(()=>__portal.state()==='looking',null,{timeout:6000});
  // walking on to the next artwork, no reload
  for(let k=0;k<4&&(await p.evaluate(()=>__portal.mounted().length))<2;k++){await frame(33);await p.waitForTimeout(700);}
  await p.waitForFunction(()=>__portal.mounted().length===2,null,{timeout:20000});
  assert.equal(await p.evaluate(()=>__portal.current()),ids[2],'the next artwork, without reloading the page');
  // list fallback
  await p.click('#pick');await p.waitForSelector('#sheet .tile img');await p.waitForTimeout(400);
  assert.equal(await p.locator('#sheet .tile').count(),3);
  await p.screenshot({path:SHOTS+'viewer-list.png'});
  await p.locator('#sheet .tile',{hasText:'הדג הכחול'}).click();
  await p.waitForFunction((id)=>__portal.current()===id&&__portal.mounted().includes(id),ids[0],{timeout:20000});
  assert.ok((await p.evaluate(()=>__portal.mounted().length))<=2,'two creations at most stay ready');
  await p.screenshot({path:SHOTS+'viewer-camera-status.png'});
  await p.close();

  // 2) a direct link (the QR beside an artwork)
  const q=watch(await ctx.newPage());await q.goto(base+'/view.html#'+ids[0]);await q.waitForSelector('#start');
  assert.match(await q.textContent('#screen'),/הדג הכחול/,'names the creation');
  await q.screenshot({path:SHOTS+'viewer-direct-start.png'});
  await q.click('#start');await q.waitForFunction((id)=>window.__portal&&__portal.mounted().includes(id),ids[0],{timeout:60000});
  await q.close();
  const q2=watch(await ctx.newPage());await q2.goto(base+'/view.html?c='+ids[2]);await q2.waitForSelector('#start');assert.match(await q2.textContent('#screen'),/קיר הפרחים/,'?c=<id> works too');await q2.close();

  // 3) removed: while the public copy still lags it keeps working; then a kind message
  await ed.evaluate(async(id)=>{await Portal.unpublish(id);},ids[2]);
  mock.rawLag=firstHead;
  const r1=watch(await ctx.newPage());await r1.goto(base+'/view.html#'+ids[2]);await r1.waitForSelector('#start');await r1.close();
  mock.rawLag=null;
  const r2=watch(await ctx.newPage());await r2.goto(base+'/view.html#'+ids[2]);await r2.waitForFunction(()=>document.body.dataset.state==='gone');
  assert.match(await r2.textContent('#screen'),/כבר לא מוצגת כאן/);assert.equal(await r2.getAttribute('#screen a','href'),'view.html','a way to the other artworks, not to the editor');
  await r2.screenshot({path:SHOTS+'viewer-removed.png'});await r2.close();
  const r3=watch(await ctx.newPage());await r3.goto(base+'/view.html#not-a-real-id');await r3.waitForFunction(()=>document.body.dataset.state==='gone');await r3.close();
  // 4) published a moment ago: the public copy does not know it yet, GitHub's API does
  const lagHead=mock.head();
  const newId=await ed.evaluate(async()=>{const blob=await new Promise(r=>__art(44).toBlob(r,'image/png')),img=await Studio.loadImageBlob(blob),t=await Studio.makeTarget(img);const a=Studio.blankExperience('חדשה לגמרי');a.target={artRect:t.artRect,natural:{w:600,h:800},fp:Studio.artworkFingerprint(img)};a.assets.__artwork=blob;a.elements=[];await Studio.save(a,{noHistory:true});await Portal.publish(a);return a.id;});
  mock.rawLag=lagHead;
  const n1=watch(await ctx.newPage());await n1.goto(base+'/view.html#'+newId);await n1.waitForSelector('#start');assert.match(await n1.textContent('#screen'),/חדשה לגמרי/,'a fresh link opens before the public copy catches up');await n1.close();
  mock.rawLag=null;

  // 5) in-app browsers do not give the camera: "open in the browser"
  for(const [ua,shot] of [['Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0.0','viewer-inapp-iphone.png'],[ANDROID.replace('Mobile Safari','Mobile Safari [FBAN/EMA;FBLC/he_IL;FBAV/400.0]'),'viewer-inapp-android.png']]){
    const c2=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,userAgent:ua});await mock.attach(c2);
    const ip=watch(await c2.newPage());await ip.goto(base+'/view.html#'+ids[0]);await ip.waitForFunction(()=>document.body.dataset.state==='inapp');
    const t=await ip.textContent('#screen');assert.match(t,/לפתוח את הקישור בדפדפן/);
    if(/iPhone/.test(ua))assert.match(t,/Safari/);else assert.ok(await ip.locator('a[href^="intent://"]').count()===1,'Android: a button that opens Chrome');
    await ip.screenshot({path:SHOTS+shot});await c2.close();
  }
  assert.deepEqual(errs,[],'no errors');
  console.log('portal-viewer ok');
}finally{await b.close();server.close();}})().catch(e=>{console.error(e);process.exit(1);});
