const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');const Mock=require('./portal-mock.cjs');
const fs=require('fs'),path=require('path'),os=require('os'),{execFileSync}=require('child_process');
// Switching between creations with the REAL engine and Adi's real portal (a read-only copy of her three published
// creations: ~/Desktop/brill-ar-work/cache/published-snapshot, fetched from the public branch if missing). Chrome's fake
// camera shows her artwork "יצירה 3" (a video with colour removal) for 16 seconds, then an artwork added for the test
// (a detailed picture with a video over its middle). Measured: the
// time from the camera turning to the second artwork until the engine holds it, and until its content is showing.
// (Her other two, a card's back and a lip-balm box photographed sideways, are mostly big flat letters: the engine does
// not find them in headless Chrome at all, so they are not the second artwork here.)
// The videos start the way an iPhone starts them (nothing loaded before play(), then a moment until the first picture),
// and every frame is checked: no video layer may be drawn while its video has no picture (that drew a black sheet).
// Also: the camera is asked for once (one getUserMedia) for the whole visit. Headless Chrome with a software GPU on a
// Mac: slower than a phone; the numbers compare versions, they are not a phone's times. Needs ffmpeg.
const SHOTS='/Users/adibrill/Desktop/brill-ar-work/wt-portal-shots/polish/';
const SNAP='/Users/adibrill/Desktop/brill-ar-work/cache/published-snapshot';
const FF=['/opt/homebrew/bin/ffmpeg','/usr/local/bin/ffmpeg','/usr/bin/ffmpeg'].find(f=>fs.existsSync(f));
const ANDROID='Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const A='d0e29245-a1aa-4391-bcbe-7ae502d7751f',SEG=16,SEGB=45;let B='';
(async()=>{if(!FF){console.log('portal-switch skipped: no ffmpeg');return;}
  if(!fs.existsSync(path.join(SNAP,'index.json'))){ // a read-only copy of the public branch
    const get=async(f)=>{const r=await fetch('https://raw.githubusercontent.com/Adibrill1/Brill-AR/published/'+f);if(!r.ok)throw new Error(f+' '+r.status);const b=Buffer.from(await r.arrayBuffer());fs.mkdirSync(path.dirname(path.join(SNAP,f)),{recursive:true});fs.writeFileSync(path.join(SNAP,f),b);return b;};
    const cat=JSON.parse(await get('index.json'));for(const it of cat.items)for(const f of [it.scene,...it.files,it.thumb])await get(f);}
  const cat=JSON.parse(fs.readFileSync(path.join(SNAP,'index.json')));
  const artOf=(id)=>{const it=cat.items.find(i=>i.id===id);return path.join(SNAP,JSON.parse(fs.readFileSync(path.join(SNAP,it.scene))).assets.__artwork.file);};
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'portal-switch-'));const mock=Mock.create();mock.seedDir(SNAP);
  // one more creation beside hers, published with the editor's own code: a detailed artwork with a video over its middle
  {const pb=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});try{
    const c=await pb.newContext({viewport:{width:390,height:844}});mock.token=Mock.FAKE_TOKEN;await mock.attach(c);const e=await c.newPage();
    await e.goto(base+'/index.html');await e.waitForFunction(()=>typeof Portal!=='undefined'&&typeof App!=='undefined');
    const vid=fs.readFileSync(path.join(__dirname,'../fixtures/clock-12s.mp4')).toString('base64');
    const r=await e.evaluate(async([token,vid])=>{localStorage.setItem('brill-portal-token',token);
      const rnd=(s)=>()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
      const c=document.createElement('canvas');c.width=600;c.height=800;const g=c.getContext('2d'),r=rnd(1007);g.fillStyle=`hsl(${r()*360},${30+r()*40}%,${50+r()*40}%)`;g.fillRect(0,0,600,800);
      for(let k=0;k<70;k++){g.fillStyle=`hsl(${r()*360},${40+r()*60}%,${15+r()*70}%)`;g.beginPath();const t=r();if(t<.4)g.arc(r()*600,r()*800,8+r()*70,0,7);else if(t<.8){g.moveTo(r()*600,r()*800);for(let j=0;j<3+r()*3;j++)g.lineTo(r()*600,r()*800);}else g.rect(r()*600,r()*800,10+r()*120,10+r()*120);g.fill();}
      for(let k=0;k<25;k++){g.strokeStyle=`hsl(${r()*360},80%,${r()*90}%)`;g.lineWidth=2+r()*10;g.beginPath();g.moveTo(r()*600,r()*800);g.bezierCurveTo(r()*600,r()*800,r()*600,r()*800,r()*600,r()*800);g.stroke();}
      const blob=await new Promise(r=>c.toBlob(r,'image/png')),img=await Studio.loadImageBlob(blob),t=await Studio.makeTarget(img);
      const a=Studio.blankExperience('שעון');a.target={artRect:t.artRect,natural:{w:600,h:800},fp:Studio.artworkFingerprint(img)};a.assets.__artwork=blob;
      a.assets.v1=new Blob([Uint8Array.from(atob(vid),ch=>ch.charCodeAt(0))],{type:'video/mp4'});
      a.elements=[{id:'vid',type:'video',name:'שעון',x:0,y:0,w:0.6,h:0.6,rot:0,z:0,flush:true,aspect:1,assetId:'v1',loop:true,volume:0}];
      await Studio.save(a,{noHistory:true});await Portal.publish(a);return {id:a.id,png:c.toDataURL('image/png')};},[Mock.FAKE_TOKEN,vid]);
    B=r.id;fs.writeFileSync(path.join(tmp,'b.png'),Buffer.from(r.png.split(',')[1],'base64'));
  }finally{await pb.close();}}
  // the camera: grey wall, the artwork a little slanted and soft, sensor noise, all of it inside the part of the picture a
  // portrait phone screen shows (cut sides are not found by the engine); a marker square in the corner turns white
  // when the second artwork comes (so the page knows the exact moment from the camera picture itself)
  const seg=(img,mark,out,len=SEG)=>execFileSync(FF,['-loglevel','error','-y','-f','lavfi','-i','color=c=0x606060:s=960x720:d='+len,'-loop','1','-i',img,'-filter_complex',
    '[1:v]scale=405:540:force_original_aspect_ratio=decrease,perspective=x0=15:y0=0:x1=W:y1=18:x2=0:y2=H:x3=W:y3=H-15:sense=destination,gblur=sigma=0.8[a];[0:v][a]overlay=(W-w)/2:(H-h)/2,drawbox'+'=x=0:y=0:w=48:h=48:color='+mark+':t=fill,noise=alls=5:allf=t,format=yuv420p','-t',String(len),'-r','15',out]);
  seg(process.env.ONLY_B?path.join(tmp,'b.png'):artOf(A),'black',path.join(tmp,'a.y4m'));seg(path.join(tmp,'b.png'),'white',path.join(tmp,'b.y4m'),SEGB);
  const cam=path.join(tmp,'cam.y4m');execFileSync(FF,['-loglevel','error','-y','-i',path.join(tmp,'a.y4m'),'-i',path.join(tmp,'b.y4m'),'-filter_complex','[0:v][1:v]concat=n=2:v=1[v]','-map','[v]','-r','15',cam]);
  const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--use-file-for-fake-video-capture='+cam,'--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required']});
  try{
    const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,userAgent:ANDROID,permissions:['camera']});await mock.attach(ctx);
    if(process.env.NOSLOW)await ctx.addInitScript(()=>{window.__noslow=1;});
    await ctx.addInitScript(()=>{
      // the fake camera has no "back camera" label; a phone does. Test-only: drop that one wish so the engine gets the fake camera.
      const md=navigator.mediaDevices;if(md){const o=md.getUserMedia.bind(md);window.__gum=0;md.getUserMedia=(c)=>{window.__gum++;if(c&&c.video&&c.video.facingMode)delete c.video.facingMode;return o(c);};}
      // videos start as on an iPhone: nothing is loaded before play(), and the first picture comes a moment after it
      const P=HTMLMediaElement.prototype,play=P.play;if(!window.__noslow){
      const mine=(v)=>v.tagName==='VIDEO'&&/^blob:/.test(v.getAttribute('src')||''); // a creation's video (not the camera's own)
      const pre=Object.getOwnPropertyDescriptor(P,'preload');
      Object.defineProperty(P,'preload',{configurable:true,get(){return pre.get.call(this);},set(x){pre.set.call(this,/^m-/.test(this.id||'')?'none':x);}});
      P.play=function(){if(!mine(this)||this.__slow)return play.call(this);const v=this;v.__slow=true;return new Promise((res,rej)=>setTimeout(()=>play.call(v).then(res,rej),1500));};}
      // every frame: a video layer drawn (visible, not transparent) while its video has no picture is a black sheet
      window.__black=[];window.__shown={};
      const check=()=>{const sc=document.querySelector('a-scene');if(sc&&sc.object3D)for(const t of document.querySelectorAll('xrextras-named-image-target')){if(!t.object3D||!t.object3D.visible)continue;const name=t.getAttribute('name');
        t.object3D.traverse((m)=>{if(!m.isMesh||!m.material)return;let o=m,vis=true;while(o){if(!o.visible){vis=false;break;}o=o.parent;}if(!vis)return;
          const tex=m.material.map||(m.material.uniforms&&m.material.uniforms.map&&m.material.uniforms.map.value),v=tex&&tex.image;if(!v||v.tagName!=='VIDEO')return;
          if(v.readyState>=2)v.__hadPic=true;if(m.material.opacity>0.02&&v.readyState<2&&!v.__hadPic)window.__black.push({name,t:performance.now(),op:+m.material.opacity.toFixed(2),rs:v.readyState});
          });
        // its content is showing: the target is held, every video layer in it is drawn with a picture, every model has loaded
        if(!window.__shown[name]){let ok=true,any=false;t.object3D.traverse((m)=>{if(!m.isMesh||!m.material)return;any=true;const tex=m.material.map||(m.material.uniforms&&m.material.uniforms.map&&m.material.uniforms.map.value),v=tex&&tex.image;if(v&&v.tagName==='VIDEO'&&!(m.material.opacity>0.5&&v.readyState>=2))ok=false;});
          for(const g of t.querySelectorAll('[gltf-model]'))if(!g.getObject3D('mesh'))ok=false;if(ok&&any)window.__shown[name]=performance.now();}}
        requestAnimationFrame(check);};requestAnimationFrame(check);
      // the moment the camera turns to the second artwork (the marker in the corner of the picture)
      window.__tB=0;window.__found={};
      addEventListener('xrloaded',()=>setTimeout(()=>{XR8.addCameraPipelineModule({name:'switch-clock',onProcessCpu:({processGpuResult})=>{const a=processGpuResult&&processGpuResult.camerapixelarray;if(!a||!a.pixels||window.__tB)return;
        // the camera picture is turned to portrait here; the marker is in one of the corners: look at all four
        const w=a.cols,h=a.rows,px=(x,y)=>a.pixels[y*a.rowBytes+x],c=[px(3,3),px(w-4,3),px(3,h-4),px(w-4,h-4)];if(Math.max(...c)>200)window.__tB=performance.now();}});},500));
      document.addEventListener('DOMContentLoaded',()=>new MutationObserver(()=>{const sc=document.querySelector('a-scene');if(sc&&!sc.__w){sc.__w=1;sc.addEventListener('xrimagefound',(e)=>{const n=e.detail&&e.detail.name;if(n&&!window.__found[n])window.__found[n]=performance.now();});}}).observe(document.body,{childList:true}));
    });
    const p=await ctx.newPage(),errs=[];p.on('pageerror',e=>errs.push(String(e)));
    await p.goto(base+'/view.html'+(process.env.ONLY_B?'#'+B:''));
    if(process.env.ONLY_B){await p.waitForFunction((B)=>window.__found[B],B,{timeout:60000}).catch(()=>{});console.log('ONLY_B',JSON.stringify(await p.evaluate((B)=>({found:window.__found[B],st:__portal.state()}),B)));return;}
    if(await p.waitForSelector('#start',{timeout:4000}).then(()=>true,()=>false))await p.click('#start'); // the version before had a start button
    await p.waitForFunction((A)=>window.__found[A],A,{timeout:120000});
    const fA=await p.evaluate(()=>performance.now());
    await p.waitForFunction(()=>window.__tB>0,null,{timeout:(SEG+40)*1000});
    // a few pictures while it switches
    for(let i=0;i<6;i++){await p.waitForTimeout(700);await p.screenshot({path:SHOTS+'switch-'+i+'.png'});}
    await p.waitForFunction((B)=>window.__found[B]&&window.__shown[B],B,{timeout:(SEGB-5)*1000}).catch(()=>{});
    const r=await p.evaluate(({A,B})=>({tB:window.__tB,foundB:window.__found[B]||0,shownB:window.__shown[B]||0,shownA:window.__shown[A]||0,black:window.__black.length,blackFirst:window.__black.slice(0,3),gum:window.__gum,mounted:window.__portal&&__portal.mounted(),cur:window.__portal&&__portal.current(),st:window.__portal&&__portal.state(),times:window.__portal&&__portal.times&&__portal.times().map(x=>[x.id.slice(0,4),Math.round(x.chose-window.__tB),x.found?Math.round(x.found-window.__tB):0]),heard:window.__portal&&__portal.heard&&__portal.heard().map(h=>[Math.round(h[0]-window.__tB),h[1]&&h[1].slice(0,4),h[2],h[3]])}),{A,B});console.log(JSON.stringify(r));
    const out={foundBAfterMs:r.foundB?Math.round(r.foundB-r.tB):null,contentBAfterMs:r.shownB?Math.round(r.shownB-r.tB):null,blackFrames:r.black,blackSample:r.blackFirst,getUserMediaCalls:r.gum,mounted:r.mounted};
    console.log(JSON.stringify(out));
    await p.screenshot({path:SHOTS+'switch-final.png'});
    if(process.env.MEASURE_ONLY)return;
    assert.ok(r.foundB,'the engine found the second artwork');assert.ok(r.shownB,'its content is showing');
    assert.equal(r.black,0,'no video layer drawn before its video has a picture (no black sheet): '+JSON.stringify(r.blackFirst));
    assert.equal(r.gum,1,'the camera is asked for once for the whole visit');
    assert.deepEqual(errs,[],'no page errors');
    console.log('portal-switch ok');
  }finally{await b.close();server.close();fs.rmSync(tmp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exit(1);});
