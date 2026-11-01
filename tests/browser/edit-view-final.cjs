const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');
// Edit view shows the final look: (1) in 2D a real scene layer draws an off-center 3D model exactly over its 2D box
// (no "3D" placeholder; the model is no longer pulled toward the middle), (2) moving or turning a layer rebuilds nothing
// in 3D (artwork plane and models stay), (3) full-screen editing covers the screen and the rotation knob turns a layer
// (snapping to 90°), (4) a looping clip restarts just before its end, (5) sound starts by itself when the browser allows
// it and the touch button shows only when it refuses, (6) the library card itself adds the item.
// Headless desktop Chrome (SwiftShader WebGL); not an iPhone.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl']});try{
const p=await (await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true})).newPage();const pageErrors=[];p.on('pageerror',e=>pageErrors.push(String(e)));
await p.goto(base+'/index.html');await p.waitForFunction(()=>document.querySelector('#exp-select').options.length>0);await p.waitForTimeout(1200);
const id=await p.evaluate(async()=>{const r=Studio.blankExperience('final look');r.target={artRect:{x:0,y:0,w:768,h:1024},natural:{w:768,h:1024}};
  const c=document.createElement('canvas');c.width=768;c.height=1024;const g=c.getContext('2d');g.fillStyle='#ffffff';g.fillRect(0,0,768,1024);r.assets.__artwork=await new Promise(res=>c.toBlob(res));
  r.assets.m1=await (await fetch('library/models/lantern_01.glb')).blob();
  r.elements=[{id:'t1',name:'T',type:'text',text:'I',color:'#0000ff',x:0.2,y:-0.3,w:.2,rot:0,flush:true},{id:'m1',name:'פנס',type:'model',assetId:'m1',x:-0.25,y:0.2,w:.4,aspect:1,z:0,seat:'plane',flush:true}];
  await Studio.save(r);const opt=document.createElement('option');opt.value=r.id;opt.textContent=r.name;document.querySelector('#exp-select').append(opt);return r.id;});
await p.locator('#exp-select').selectOption(id);
await p.waitForFunction(()=>Editor3D.drawsIn2d('m1'),null,{timeout:60000});await p.waitForTimeout(400);
// (1) the model's projected box sits on its 2D box, and the 2D canvas no longer paints a placeholder there
const fit=await p.evaluate(()=>{const sc=Editor3D._test.scene(),n=sc.querySelector('[data-el-root="m1"]');sc.object3D.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(n.object3D),cen=box.getCenter(new THREE.Vector3()).project(sc.camera),cr=sc.canvas.getBoundingClientRect(),pr=document.querySelector('#preview').getBoundingClientRect();
  const bx=__testBoxes.m1;return {sx:cr.left+(cen.x+1)/2*cr.width-pr.left,sy:cr.top+(1-cen.y)/2*cr.height-pr.top,bx:bx.cx,by:bx.cy,bw:bx.w,mode:Editor3D._test.mode(),cam:sc.camera.type,art:sc.querySelector('#editor-3d-rig > a-plane:not([data-el-root])').object3D.visible};});
assert.equal(fit.mode,'2d');assert.equal(fit.cam,'OrthographicCamera');assert.equal(fit.art,false,'2D layer leaves the artwork to the canvas');
assert.ok(Math.abs(fit.sx-fit.bx)<fit.bw*0.12&&Math.abs(fit.sy-fit.by)<fit.bw*0.2,'model drawn on its 2D box '+JSON.stringify(fit));
const purple=await p.evaluate(()=>{const c=document.querySelector('#preview'),b=__testBoxes.m1,d=devicePixelRatio,x=c.getContext('2d').getImageData(Math.round((b.cx+b.w*0.4)*d),Math.round((b.cy+b.h*0.4)*d),1,1).data;return [...x];});
assert.ok(!(purple[0]<120&&purple[2]>100&&purple[1]<90),'no purple "3D" placeholder under the real model: '+purple);
// (2) 3D: moving and turning rebuild nothing (artwork plane and model stay the same nodes)
await p.click('#btn-3d');await p.waitForFunction(()=>Editor3D.isActive()&&Editor3D._test.node('m1'),null,{timeout:20000});await p.waitForTimeout(800);
const before=await p.evaluate(()=>{window.__art0=document.querySelector('#editor-3d-rig > a-plane:not([data-el-root])');window.__m0=Editor3D._test.node('m1');return Editor3D._test.rebuilds();});
await p.evaluate(()=>[...document.querySelectorAll('#element-list li')].find(li=>li.textContent.includes('פנס')).click());
await p.waitForTimeout(300);
await p.evaluate(()=>{for(const [id,v] of [['num-x','0.1'],['num-rot','30']]){const i=document.getElementById(id);i.value=v;i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new Event('change',{bubbles:true}));}});
await p.waitForTimeout(1500);
const after=await p.evaluate(()=>({n:Editor3D._test.rebuilds(),sameArt:window.__art0===document.querySelector('#editor-3d-rig > a-plane:not([data-el-root])')&&window.__art0.isConnected,sameModel:window.__m0===Editor3D._test.node('m1')}));
assert.equal(after.n,before,'no rebuild for move/turn');assert.ok(after.sameArt,'artwork plane kept');assert.ok(after.sameModel,'model kept');
await p.click('#btn-2d');await p.waitForTimeout(500);
// (3) full screen + rotation knob
await p.click('#btn-full');await p.waitForTimeout(800);
const fs=await p.evaluate(()=>{const w=document.querySelector('#canvas-wrap').getBoundingClientRect(),c=document.querySelector('#preview').getBoundingClientRect();return {w:[w.left,w.top,w.width,w.height],c:[c.left,c.top,c.width,c.height],bar:!document.querySelector('#full-bar').hidden,vw:innerWidth,vh:innerHeight};});
assert.deepEqual(fs.w,[0,0,fs.vw,fs.vh],'wrap covers the screen '+JSON.stringify(fs));assert.ok(fs.bar,'full-screen bar shown');assert.ok(fs.c[2]>fs.vw*0.9&&fs.c[0]>=-0.5&&fs.c[0]+fs.c[2]<=fs.vw+0.5,'canvas fills the width '+JSON.stringify(fs));
const knob=await p.evaluate(()=>{const b=__testBoxes.m1,r=document.querySelector('#preview').getBoundingClientRect(),s=Math.sin(b.rot),c=Math.cos(b.rot),d=b.h/2+26;return {x:r.left+b.cx+d*s,y:r.top+b.cy-d*c,cx:r.left+b.cx,cy:r.top+b.cy};});
const R=Math.hypot(knob.x-knob.cx,knob.y-knob.cy),a0=Math.atan2(knob.y-knob.cy,knob.x-knob.cx);
await p.mouse.move(knob.x,knob.y);await p.mouse.down();for(let i=1;i<=8;i++){const a=a0-i*(57*Math.PI/180)/8;await p.mouse.move(knob.cx+R*Math.cos(a),knob.cy+R*Math.sin(a));}await p.mouse.up();await p.waitForTimeout(900);
const rot=await p.evaluate(async()=>(await Studio.load(document.querySelector('#exp-select').value)).elements.find(e=>e.id==='m1').rot);
assert.equal(rot,90,'knob turns counter-clockwise 30+57=87 -> snaps to 90 (got '+rot+')');
await p.click('#btn-full');await p.waitForTimeout(500);
assert.ok(await p.evaluate(()=>!document.body.classList.contains('full-edit')&&document.querySelector('#full-bar').hidden),'full screen closes');
// (4) seamless loop on syncMedia
const loop=await p.evaluate(()=>{const c=document.createElement('div');const mk=(t)=>({el:{id:'x'+t},node:{loop:true,paused:false,duration:10,currentTime:t,play(){return Promise.resolve();},pause(){}}});c._studioMedia=[mk(9.95),mk(9.5)];Studio.syncMedia(c,{elements:[]},0);return c._studioMedia.map(m=>m.node.currentTime);});
assert.deepEqual(loop,[0,9.5],'restart 80ms before the end only');
// (5) sound: allowed -> no button, unlocked; refused -> button
const snd=await p.evaluate(async()=>{const mk=(ok)=>[{kind:'video',el:{volume:1},node:{muted:true,paused:true,volume:1,play(){return ok?Promise.resolve():Promise.reject(Object.assign(new Error('x'),{name:'NotAllowedError'}));},pause(){}}}];
  const a=Studio.soundOnTouch(mk(true));await new Promise(r=>setTimeout(r,50));const okBtn=!!document.getElementById('sound-overlay');
  const bb=Studio.soundOnTouch(mk(false));await new Promise(r=>setTimeout(r,50));const noBtn=!!document.getElementById('sound-overlay');document.getElementById('sound-overlay')?.remove();
  return {okBtn,okUnlocked:a.isUnlocked(),noBtn,noUnlocked:bb.isUnlocked()};});
assert.deepEqual(snd,{okBtn:false,okUnlocked:true,noBtn:true,noUnlocked:false},JSON.stringify(snd));
// (6) library: the card is the button
await p.click('#shell-tabs button[data-tab="layers"]').catch(()=>{});await p.getByRole('button',{name:'ספריית התחלה'}).first().click();await p.waitForSelector('#starter-library[open]');
const lib=await p.evaluate(()=>({tag:document.querySelector('[data-library-id="star"]').tagName,old:[...document.querySelectorAll('#starter-library button')].some(x=>x.textContent.trim()==='הוספה ליצירה')}));
assert.deepEqual(lib,{tag:'BUTTON',old:false});
const n0=await p.evaluate(()=>document.querySelectorAll('#element-list li').length);
await p.click('[data-library-id="star"] img');await p.waitForFunction(n=>document.querySelectorAll('#element-list li').length>n,n0,{timeout:20000});
assert.deepEqual(pageErrors,[],'no page errors');
console.log('PASS edit-view-final: real model on its 2D box, no rebuild on move/turn, full screen + knob 90°, loop lead, sound probe, tap-to-add card');
}finally{await b.close();server.close();}})().catch(e=>{console.error(e&&e.stack||e);process.exit(1)});
