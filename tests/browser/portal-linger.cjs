const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');const Mock=require('./portal-mock.cjs');
const fs=require('fs'),path=require('path'),os=require('os'),{execFileSync}=require('child_process');
// A creation must leave with its artwork. The REAL engine and a read-only copy of Adi's portal (see portal-switch.cjs):
// Chrome's fake camera shows her artwork "יצירה 3" (a video with colour removal) until the engine holds it, then the
// artwork is taken out of the picture (a bare grey wall; a marker square in the corner turns white at that moment).
// Measured from that moment: how long the creation is still drawn (its image target visible), and how long any of its
// video or sound still plays. Adi's phone recording showed it floating frozen in the middle of the screen for ~2 s.
// Headless Chrome with a software GPU: the engine's own "lost" comes later than on a phone, so the limit is loose; the
// number printed compares versions. Needs ffmpeg. MEASURE_ONLY=1 prints without asserting.
const SNAP='/Users/adibrill/Desktop/brill-ar-work/cache/published-snapshot';
const FF=['/opt/homebrew/bin/ffmpeg','/usr/local/bin/ffmpeg','/usr/bin/ffmpeg'].find(f=>fs.existsSync(f));
const ANDROID='Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const A='d0e29245-a1aa-4391-bcbe-7ae502d7751f',SEG=20,WALL=14;
(async()=>{if(!FF){console.log('portal-linger skipped: no ffmpeg');return;}
  if(!fs.existsSync(path.join(SNAP,'index.json'))){console.log('portal-linger skipped: run portal-switch.cjs once to fetch the snapshot');return;}
  const cat=JSON.parse(fs.readFileSync(path.join(SNAP,'index.json')));
  const art=path.join(SNAP,JSON.parse(fs.readFileSync(path.join(SNAP,cat.items.find(i=>i.id===A).scene))).assets.__artwork.file);
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'portal-linger-'));const mock=Mock.create();mock.seedDir(SNAP);
  execFileSync(FF,['-loglevel','error','-y','-f','lavfi','-i','color=c=0x606060:s=960x720:d='+SEG,'-loop','1','-i',art,'-filter_complex',
    '[1:v]scale=405:540:force_original_aspect_ratio=decrease,perspective=x0=15:y0=0:x1=W:y1=18:x2=0:y2=H:x3=W:y3=H-15:sense=destination,gblur=sigma=0.8[a];[0:v][a]overlay=(W-w)/2:(H-h)/2,drawbox=x=0:y=0:w=48:h=48:color=black:t=fill,noise=alls=5:allf=t,format=yuv420p','-t',String(SEG),'-r','15',path.join(tmp,'a.y4m')]);
  execFileSync(FF,['-loglevel','error','-y','-f','lavfi','-i','color=c=0x606060:s=960x720:d='+WALL,'-vf','drawbox=x=0:y=0:w=48:h=48:color=white:t=fill,noise=alls=5:allf=t,format=yuv420p','-t',String(WALL),'-r','15',path.join(tmp,'w.y4m')]);
  const cam=path.join(tmp,'cam.y4m');execFileSync(FF,['-loglevel','error','-y','-i',path.join(tmp,'a.y4m'),'-i',path.join(tmp,'w.y4m'),'-filter_complex','[0:v][1:v]concat=n=2:v=1[v]','-map','[v]','-r','15',cam]);
  const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-video-capture='+cam,'--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required']});
  try{
    const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,userAgent:ANDROID,permissions:['camera']});await mock.attach(ctx);
    await ctx.addInitScript((A)=>{
      const md=navigator.mediaDevices;if(md){const o=md.getUserMedia.bind(md);md.getUserMedia=(c)=>{if(c&&c.video&&c.video.facingMode)delete c.video.facingMode;return o(c);};}
      window.__tB=0;window.__found=0;window.__lastVis=0;window.__lastPlay=0;window.__lostEv=0;
      const tick=()=>{const t=[...document.querySelectorAll('xrextras-named-image-target')].find(n=>n.getAttribute('name')===A),now=performance.now();
        if(t&&t.object3D&&t.object3D.visible)window.__lastVis=now;
        if([...document.querySelectorAll('video[id^="m-"],audio[id^="m-"]')].some(m=>!m.paused))window.__lastPlay=now;
        requestAnimationFrame(tick);};requestAnimationFrame(tick);
      addEventListener('xrloaded',()=>setTimeout(()=>{XR8.addCameraPipelineModule({name:'linger-clock',onProcessCpu:({processGpuResult})=>{const a=processGpuResult&&processGpuResult.camerapixelarray;if(!a||!a.pixels||window.__tB)return;
        const w=a.cols,h=a.rows,px=(x,y)=>a.pixels[y*a.rowBytes+x],c=[px(3,3),px(w-4,3),px(3,h-4),px(w-4,h-4)];if(Math.max(...c)>200)window.__tB=performance.now();}});},500));
      document.addEventListener('DOMContentLoaded',()=>new MutationObserver(()=>{const sc=document.querySelector('a-scene');if(sc&&!sc.__w){sc.__w=1;
        sc.addEventListener('xrimagefound',(e)=>{if(e.detail&&e.detail.name===A&&!window.__found)window.__found=performance.now();});
        sc.addEventListener('xrimagelost',(e)=>{if(e.detail&&e.detail.name===A&&window.__tB&&!window.__lostEv)window.__lostEv=performance.now();},true);}}).observe(document.body,{childList:true}));
    },A);
    const p=await ctx.newPage(),errs=[];p.on('pageerror',e=>errs.push(String(e)));
    await p.goto(base+'/view.html');
    await p.waitForFunction(()=>window.__found,null,{timeout:120000});
    // while it is held: the recogniser sees the artwork where the creation stands (what lets a reflection keep it)
    const where=[];for(let k=0;k<6;k++){await p.waitForTimeout(600);const w=await p.evaluate(()=>!window.__tB&&__portal.state()==='tracking'&&__portal.where());if(w&&w.seen)where.push(w);}
    await p.waitForFunction(()=>window.__tB>0,null,{timeout:(SEG+20)*1000});
    const vis0=await p.evaluate(()=>window.__lastVis>=window.__tB-200);
    await p.waitForTimeout(7000);
    const r=await p.evaluate(()=>({tB:window.__tB,visibleMs:Math.max(0,Math.round(window.__lastVis-window.__tB)),playingMs:Math.max(0,Math.round(window.__lastPlay-window.__tB)),engineLostMs:window.__lostEv?Math.round(window.__lostEv-window.__tB):null,st:__portal.state()}));
    console.log(JSON.stringify(Object.assign({shownWhenRemoved:vis0},r)));console.log('where (screen vs recogniser):',JSON.stringify(where.map(w=>[...w.screen,...w.seen].map(v=>+v.toFixed(3)))));
    if(process.env.MEASURE_ONLY)return;
    assert.ok(where.length>=2&&where.every(w=>Math.abs(w.seen[0]-w.screen[0])<0.1&&Math.abs(w.seen[1]-w.screen[1])<0.1),'the recogniser places the artwork where the engine holds it');
    assert.ok(vis0,'the creation was showing when the artwork left the picture');
    assert.ok(r.visibleMs<1500,'the creation leaves with its artwork (still drawn '+r.visibleMs+' ms after; the engine said lost after '+r.engineLostMs+' ms)');
    assert.ok(r.playingMs<=r.visibleMs+200,'its video and sound stop with it ('+r.playingMs+' ms)');
    assert.deepEqual(errs,[],'no page errors');
    console.log('portal-linger ok');
  }finally{await b.close();server.close();fs.rmSync(tmp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1);});
