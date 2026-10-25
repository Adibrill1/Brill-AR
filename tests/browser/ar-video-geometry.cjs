const {chromium}=require('playwright-core'),assert=require('assert/strict'),server=require('../../server/server');
// Regression: in AR mode the video plane must use the exact same world width/height
// as preview/editor (user report: proportions fine in the editor, distorted during
// broadcast). xrextras-target-video-fade multiplied the image-target geometry by our
// w/h and stretched non-square targets, so the AR path now uses an a-video plane with
// studio-target-video for found/lost play + fade.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});try{const p=await b.newPage({viewport:{width:800,height:600}});p.on('pageerror',e=>console.log('PAGE',e.message));await p.goto('http://127.0.0.1:'+server.address().port+'/preview.html');await p.evaluate(async()=>{document.querySelectorAll('#err,#hint,#topbar').forEach(n=>n.remove());
 const rec=Studio.blankExperience('ar video geometry');rec.target={artRect:{x:0,y:0,w:1024,h:512}}; // landscape target: target aspect != 1
 rec.elements=[{id:'vid',type:'video',x:0,y:0,w:.8,h:.48,aspect:1.5,z:0}];
 window.rec=rec;
 window.build=mode=>{const e=Studio.buildElementEntity(rec,rec.elements[0],0,mode);return {tag:e.tagName,w:e.getAttribute('width'),h:e.getAttribute('height'),fade:e.hasAttribute('xrextras-target-video-fade')};};});
 const ar=await p.evaluate(()=>build('ar')),pv=await p.evaluate(()=>build('preview'));
 assert.ok(pv.tag==='A-VIDEO','preview video plane');
 assert.ok(ar.tag==='A-VIDEO','AR must use the same a-video plane, got '+ar.tag);
 assert.equal(ar.fade,false,'no xrextras-target-video-fade attribute remains');
 assert.equal(String(ar.w),String(pv.w),'AR width matches preview');
 assert.equal(String(ar.h),String(pv.h),'AR height matches preview');
 console.log('PASS AR video plane geometry identical to preview',ar.w,ar.h);
 // found/lost lifecycle on a real scene: fade in + play on found, pause+rewind+hide on lost
 await p.evaluate(()=>{document.querySelector('a-scene')?.remove();const s=document.createElement('a-scene');s.setAttribute('embedded','');s.setAttribute('renderer','preserveDrawingBuffer:true; colorManagement:true');s.style.cssText='position:fixed;inset:0';const assets=document.createElement('a-assets'),v=document.createElement('video');v.id='m-vid';v.src='/library/orbit.mp4';v.muted=true;v.loop=true;v.playsInline=true;assets.append(v);s.append(assets);const cam=document.createElement('a-entity');cam.setAttribute('camera','');cam.setAttribute('position','0 0 1');s.append(cam);const target=document.createElement('a-entity');target.id='target';target.append(Studio.buildElementEntity(rec,rec.elements[0],0,'ar'));s.append(target);document.body.append(s);});
 await p.waitForFunction(()=>document.querySelector('[data-el-id=vid]')?.getObject3D('mesh')?.material);
 const wired=await p.evaluate(()=>{const n=document.querySelector('[data-el-id=vid]');const c=n.components['studio-target-video'];const g=n.getObject3D('mesh').geometry.parameters;const ts=Studio.toTargetSpace(rec,rec.elements[0],1.5);return {video:c&&c.data.video,gw:g.width,gh:g.height,tw:ts.w,th:ts.h};});
 assert.equal(wired.video,'#m-vid','studio-target-video wired to the media element');
 assert.ok(Math.abs(wired.gw-wired.tw)<1e-6&&Math.abs(wired.gh-wired.th)<1e-6,'AR plane geometry equals target-space size '+JSON.stringify(wired));
 console.log('PASS AR plane exact size',wired);
 let st=await p.evaluate(()=>({o:document.querySelector('[data-el-id=vid]').getObject3D('mesh').material.opacity,paused:document.getElementById('m-vid').paused}));
 assert.equal(st.o,0,'video hidden before target found');
 await p.evaluate(()=>document.getElementById('target').dispatchEvent(new Event('xrextrasfound')));
 // the asset-stalled test scene never starts its own tick loop, so drive the fade deterministically
 await p.evaluate(()=>{const c=document.querySelector('[data-el-id=vid]').components['studio-target-video'];for(let i=1;i<=60;i++)c.tick(i*16,16);});
 await p.waitForFunction(()=>{const m=document.querySelector('[data-el-id=vid]').getObject3D('mesh').material;return m.opacity>0.95&&!document.getElementById('m-vid').paused;},{timeout:5000});
 st=await p.evaluate(()=>{document.getElementById('target').dispatchEvent(new Event('xrextraslost'));return {o:document.querySelector('[data-el-id=vid]').getObject3D('mesh').material.opacity,paused:document.getElementById('m-vid').paused,t:document.getElementById('m-vid').currentTime};});
 assert.equal(st.o,0,'hidden after target lost');assert.ok(st.paused,'paused after lost');assert.equal(st.t,0,'rewound after lost');
 console.log('PASS studio-target-video found/lost play, fade and rewind');}finally{await b.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exit(1)});
