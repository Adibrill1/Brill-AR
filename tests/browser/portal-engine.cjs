const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');const Mock=require('./portal-mock.cjs');
const fs=require('fs'),path=require('path'),os=require('os'),{execFileSync}=require('child_process');
// The whole portal with the REAL AR engine: twelve artworks are published (stand-in GitHub, portal-mock.cjs), Chrome's
// fake camera plays a video of one of them hanging on a grey wall (slightly slanted, soft, with sensor noise), and
// view.html with no id must recognise it from the engine's own camera frames, download only that creation, hand only
// that artwork to the engine, and the engine must find and hold it ("tracking"). Needs ffmpeg (to make the camera video).
// Headless Chrome on a Mac with a software GPU: much slower than a phone, so the time limits are loose. Not a phone camera.
const SHOTS='/Users/adibrill/Desktop/brill-ar-work/wt-portal-shots/';
const FF=['/opt/homebrew/bin/ffmpeg','/usr/local/bin/ffmpeg','/usr/bin/ffmpeg'].find(f=>fs.existsSync(f));
const ANDROID='Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
(async()=>{if(!FF){console.log('portal-engine skipped: no ffmpeg');return;}
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'portal-engine-'));const mock=Mock.create();mock.token=Mock.FAKE_TOKEN;
  let b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});let shown,ids;
  try{
    const ctx=await b.newContext({viewport:{width:390,height:844}});await mock.attach(ctx);const p=await ctx.newPage();
    await p.goto(base+'/index.html');await p.waitForFunction(()=>typeof Portal!=='undefined'&&typeof App!=='undefined');
    const r=await p.evaluate(async(token)=>{localStorage.setItem('brill-portal-token',token);
      const rnd=(s)=>()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
      const art=(seed)=>{const c=document.createElement('canvas');c.width=600;c.height=800;const g=c.getContext('2d'),r=rnd(seed);g.fillStyle=`hsl(${r()*360},${30+r()*40}%,${50+r()*40}%)`;g.fillRect(0,0,600,800);
        for(let k=0;k<70;k++){g.fillStyle=`hsl(${r()*360},${40+r()*60}%,${15+r()*70}%)`;g.beginPath();const t=r();if(t<.4)g.arc(r()*600,r()*800,8+r()*70,0,7);else if(t<.8){g.moveTo(r()*600,r()*800);for(let j=0;j<3+r()*3;j++)g.lineTo(r()*600,r()*800);}else g.rect(r()*600,r()*800,10+r()*120,10+r()*120);g.fill();}
        for(let k=0;k<25;k++){g.strokeStyle=`hsl(${r()*360},80%,${r()*90}%)`;g.lineWidth=2+r()*10;g.beginPath();g.moveTo(r()*600,r()*800);g.bezierCurveTo(r()*600,r()*800,r()*600,r()*800,r()*600,r()*800);g.stroke();}return c;};
      const ids=[];let shown='';
      for(let i=0;i<12;i++){const c=art(1000+i),blob=await new Promise(r=>c.toBlob(r,'image/png')),img=await Studio.loadImageBlob(blob),t=await Studio.makeTarget(img);
        const a=Studio.blankExperience('יצירה '+(i+1));a.target={artRect:t.artRect,natural:{w:600,h:800},fp:Studio.artworkFingerprint(img)};a.assets.__artwork=blob;
        a.elements=[{id:'txt',type:'text',text:'שלום '+(i+1),x:0,y:0,w:0.6,rot:0}];await Studio.save(a,{noHistory:true});await Portal.publish(a);ids.push(a.id);if(i===7)shown=c.toDataURL('image/png');}
      return {ids,shown};},Mock.FAKE_TOKEN);
    ids=r.ids;shown=r.shown;
  }finally{await b.close();}
  fs.writeFileSync(path.join(tmp,'art.png'),Buffer.from(shown.split(',')[1],'base64'));
  const cam=path.join(tmp,'cam.y4m');
  execFileSync(FF,['-loglevel','error','-y','-f','lavfi','-i','color=c=0x606060:s=960x720:d=5','-loop','1','-i',path.join(tmp,'art.png'),'-filter_complex',
    '[1:v]scale=405:540,perspective=x0=15:y0=0:x1=390:y1=18:x2=0:y2=540:x3=405:y3=525:sense=destination,gblur=sigma=0.8[a];[0:v][a]overlay=278:90,noise=alls=6:allf=t,eq=brightness=0.03:contrast=0.92,format=yuv420p','-t','5','-r','15',cam]);
  b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-video-capture='+cam,'--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required']});
  try{
    const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,userAgent:ANDROID,permissions:['camera']});await mock.attach(ctx);
    // the fake camera has no "back camera" label; a phone does. Test-only: drop that one wish so the engine gets the fake camera.
    await ctx.addInitScript(()=>{const md=navigator.mediaDevices;if(!md)return;const o=md.getUserMedia.bind(md);md.getUserMedia=(c)=>{if(c&&c.video&&c.video.facingMode)delete c.video.facingMode;return o(c);};});
    const p=await ctx.newPage(),errs=[],raws=[];p.on('pageerror',e=>errs.push('view: '+String(e)));p.on('request',r=>{if(r.url().startsWith('https://raw.githubusercontent.com/'))raws.push(r.url().split('/published/')[1]);});
    await p.goto(base+'/view.html');await p.waitForSelector('#start');const t0=Date.now();await p.click('#start');
    await p.waitForFunction(()=>window.__portal&&__portal.state()!=='start'&&__portal.mounted().length>0,null,{timeout:120000});
    const tRec=Date.now()-t0,named=await p.evaluate(()=>__portal.current());
    assert.equal(named,ids[7],'the portal recognised the artwork the camera shows (of 12)');
    const scenes=raws.filter(u=>u.startsWith('c/'));assert.equal(scenes.length,1,'only that creation was downloaded: '+scenes.join(' '));
    await p.waitForFunction(()=>__portal.state()==='tracking',null,{timeout:120000});
    const tTrack=Date.now()-t0;
    await p.waitForTimeout(800);await p.screenshot({path:SHOTS+'viewer-engine-tracking.png'});
    console.log(JSON.stringify({recognisedAfterMs:tRec,trackingAfterMs:tTrack,named:ids.indexOf(named)}));
    // the record button: a short clip, then the engine's preview with "Share", and on Android our "שמירה בטלפון" beside it
    assert.deepEqual(errs,[],'no page errors while recognising and tracking');
    await p.evaluate(()=>{window.__prev=0;addEventListener('mediarecorder-previewopened',()=>window.__prev++);});
    await p.locator('#recorder-button').tap();await p.waitForTimeout(2500);await p.locator('#recorder-button').tap().catch(()=>{});
    await p.waitForFunction(()=>window.__prev>0,null,{timeout:40000});await p.waitForSelector('#portal-save',{timeout:10000});await p.waitForTimeout(1200);
    await p.screenshot({path:SHOTS+'viewer-record-preview.png'});
    const [dl]=await Promise.all([p.waitForEvent('download',{timeout:20000}),p.click('#portal-save')]);assert.match(dl.suggestedFilename(),/^brill-ar-\d+\.mp4$/,'the clip downloads');
    await p.waitForTimeout(1500);await p.click('#closePreviewButton').catch(()=>{});
    // the engine's own preview video rejects play() in headless Chrome once the clip is shown (no stack, native); not on a phone as far as known
    for(let i=errs.length-1;i>=0;i--)if(/^view: NotSupportedError: Failed to load because no supported source/.test(errs[i]))errs.splice(i,1);
    // the creator's own camera (play.html, built by the same ar-mount.js): her creation from this phone's storage, found by the engine
    const e=await ctx.newPage();e.on('pageerror',x=>errs.push('play: '+String(x)));await e.goto(base+'/index.html');await e.waitForFunction(()=>typeof Studio!=='undefined');
    const local=await e.evaluate(async(png)=>{const blob=await (await fetch(png)).blob(),img=await Studio.loadImageBlob(blob),t=await Studio.makeTarget(img);
      const a=Studio.blankExperience('שלי');a.target={artRect:t.artRect,natural:{w:600,h:800}};a.assets.__artwork=blob;a.elements=[{id:'txt',type:'text',text:'שלי',x:0,y:0,w:0.5,rot:0}];await Studio.save(a,{noHistory:true});return a.id;},shown);
    await e.addInitScript(()=>{window.__found=0;addEventListener('xrimagefound',()=>{},true);document.addEventListener('DOMContentLoaded',()=>{new MutationObserver(()=>{const sc=document.querySelector('a-scene');if(sc&&!sc.__w){sc.__w=1;sc.addEventListener('xrimagefound',()=>window.__found++);}}).observe(document.body,{childList:true});});});
    await e.goto(base+'/play.html#'+local);await e.waitForFunction(()=>window.__found>0,null,{timeout:120000});
    assert.equal(await e.evaluate(()=>!!document.querySelector('xrextras-named-image-target[name=artwork] [data-el-id=txt]')),true,'play.html: her creation on the artwork');
    assert.deepEqual(errs,[],'no page errors');
    console.log('portal-engine ok');
  }finally{await b.close();server.close();fs.rmSync(tmp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1);});
