const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');
// Acceptance (pinch view-zoom): a two-finger spread/pinch zooms the EDITING VIEW in both the
// 2D canvas and the embedded 3D view - it never resizes the artwork or mutates elements, and
// hit-testing keeps mapping taps to the right element while zoomed.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});try{
 const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const p=await ctx.newPage();
 await p.goto(base+'/index.html');await p.waitForFunction(()=>document.querySelector('#exp-select').options.length>0);
 const id=await p.evaluate(async()=>{const r=Studio.blankExperience('pinchguard');r.target={artRect:{x:0,y:0,w:768,h:768},natural:{w:768,h:768}};const c=document.createElement('canvas');c.width=768;c.height=768;const g=c.getContext('2d');g.fillStyle='#ffffff';g.fillRect(0,0,768,768);r.assets.__artwork=await new Promise(res=>c.toBlob(res));
  const free={id:'free',name:'FR',type:'text',text:'FR',color:'#ff0000',x:.3,y:0,w:.12,rot:0};
  const K=(x,y)=>({loop:false,keys:[{t:0,x,y,z:0,rot:0,opacity:1,scale:1,tap:'none'},{t:2,x,y,z:0,rot:0,opacity:1,scale:1,tap:'none'}]});
  const keyd={id:'keyd',name:'KD',type:'text',text:'KD',color:'#aa00aa',x:-.25,y:0,w:.15,rot:0,timeline:K(-.25,0)};
  r.elements=[free,keyd];r.elements.forEach(Studio.normEl);await Studio.save(r);const opt=document.createElement('option');opt.value=r.id;opt.textContent=r.name;document.querySelector('#exp-select').append(opt);return r.id;});
 await p.locator('#exp-select').selectOption(id);
 await p.waitForFunction(()=>parseFloat(document.querySelector('#preview').style.height)>300,{timeout:10000});
 const ses=await ctx.newCDPSession(p);
 const pinch=async(box,d0,d1)=>{const cx=box.x+box.width/2;let cy=box.y+box.height/2;
  // 3D view docks its tool buttons in a corner; keep the two fingers off that column (a finger on a button does not reach the canvas)
  const tb=await p.evaluate(()=>{const e=document.getElementById('editor-3d-tools');if(!e||!e.offsetParent)return null;const r=e.getBoundingClientRect();return {t:r.top,b:r.bottom};});
  if(tb&&cy>tb.t-14&&cy<tb.b+14)cy=(cy-box.y<box.height/2+1)&&tb.t>box.y+box.height/2?cy:(tb.b+14<box.y+box.height-20?tb.b+30:tb.t-30);
  await ses.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cx-d0/2,y:cy,id:1},{x:cx+d0/2,y:cy,id:2}]});
  await ses.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cx-(d0+d1)/4,y:cy,id:1},{x:cx+(d0+d1)/4,y:cy,id:2}]});
  await ses.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cx-d1/2,y:cy,id:1},{x:cx+d1/2,y:cy,id:2}]});
  await ses.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await p.waitForTimeout(300);};
 const state=()=>p.evaluate(id=>Studio.load(id).then(r=>({free:r.elements.find(e=>e.id==='free'),keyd:r.elements.find(e=>e.id==='keyd'),zoom:document.querySelector('#preview').dataset.zoom})),id);
 // 1. 2D: spread zooms the view in (~3x), pinch zooms it back out (~1.5x)
 await p.evaluate(()=>{const w=document.querySelector('#canvas-wrap');scrollTo(0,w.getBoundingClientRect().top+scrollY-8);});await p.waitForTimeout(300);
 let box=await p.locator('#preview').boundingBox();
 await pinch(box,60,180);
 let s1=await state();
 assert.ok(Math.abs(parseFloat(s1.zoom)-3)<0.08,'2D spread zoomed the view ~3x: '+s1.zoom);
 await pinch(box,180,90);
 let s2=await state();
 assert.ok(Math.abs(parseFloat(s2.zoom)-1.5)<0.08,'2D pinch zoomed the view out to ~1.5x: '+s2.zoom);
 assert.strictEqual(s2.free.x,.3,'view zoom never moved the element');
 assert.strictEqual(s2.free.w,.12,'view zoom never resized the element');
 // 2. 2D: while zoomed, a tap still lands on the element under the finger (inverse mapping)
 const z=parseFloat(s2.zoom),bw=box.width;
 const sx=box.x+bw*(0.5+0.2*z),sy=box.y+box.height/2; // FR world center is 0.2*bw right of canvas center, on the midline
 await p.touchscreen.tap(sx,sy);
 try{await p.waitForFunction(()=>document.querySelector('#panel-name').textContent.includes('FR'),{timeout:2500});}
 catch(e){throw new Error('tap at zoom '+z+' did not select FR (mapping broken)');}
 // 2b. a two-finger gesture that BEGINS on an element must not leave the first finger's partial edit:
 // drag FR with one finger, bring the second finger down for a pinch - the drag rolls back, the view zooms
 const dragPinch=async(px,py,qx,qy)=>{ // one finger drags from (px,py), second finger lands at (qx,qy) for a pinch; returns after both lift
  await ses.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:px,y:py,id:1}]});
  await ses.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:px+36,y:py,id:1}]});
  await p.waitForTimeout(120);
  await ses.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:px+36,y:py,id:1},{x:qx,y:qy,id:2}]});
  await ses.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:px+16,y:py,id:1},{x:qx+20,y:qy,id:2}]});
  await ses.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await p.waitForTimeout(400);};
 // reset to zoom 1 for predictable finger targets
 await pinch(box,120,60); // 1.5 * 0.5 = 0.75... drive back toward 1
 await p.evaluate(()=>{const c=document.querySelector('#preview');}); // no-op, keep structure simple
 await pinch(box,150,150*(1/0.75)); // ~back to 1
 let sr=await state();const zr=parseFloat(sr.zoom);
 const frS={x:box.x+box.width*(0.5+0.2*zr),y:box.y+box.height/2};
 await dragPinch(frS.x,frS.y,frS.x-60,frS.y);
 let s4=await state();
 assert.strictEqual(s4.free.x,.3,'pinch cancelled the first-finger drag: FR.x rolled back, got '+s4.free.x);
 assert.strictEqual(s4.free.y,0,'pinch cancelled the first-finger drag: FR.y rolled back, got '+s4.free.y);
 assert.ok(Math.abs(parseFloat(s4.zoom)-zr)>0.05,'the pinch still zoomed the view after cancelling the drag: '+zr+' -> '+s4.zoom);
 // same protection on a KEYED element: a cancelled keyed drag must not leave a new key behind
 const kdS={x:box.x+box.width*(0.5-(0.25/0.75)*0.5*parseFloat(s4.zoom)),y:box.y+box.height/2};
 await dragPinch(kdS.x,kdS.y,kdS.x+60,kdS.y);
 let s5=await state();
 assert.strictEqual(s5.keyd.timeline.keys.length,2,'cancelled keyed drag left no key behind: '+JSON.stringify(s5.keyd.timeline.keys.map(k=>k.t)));
 assert.strictEqual(s5.keyd.x,-.25,'cancelled keyed drag left base x untouched');
 // playhead state is part of the rollback: started live -> back to live (no freeze left behind)
 const tlState=()=>p.evaluate(()=>({liveHidden:document.querySelector('#btn-tl-live').hidden,time:document.querySelector('#tl-time').textContent}));
 let tl1=await tlState();
 assert.ok(tl1.liveHidden&&tl1.time==='','cancelled keyed drag left no freeze behind: '+JSON.stringify(tl1));
 // ...but a deliberate pre-drag freeze survives the cancelled gesture
 await p.evaluate(()=>{document.querySelectorAll('#element-list li').forEach(li=>{if(li.textContent.includes('KD'))li.click();});});
 await p.waitForTimeout(400);
 await p.evaluate(()=>{document.querySelector('#tl-ruler').scrollIntoView({block:'center'});});await p.waitForTimeout(300);
 const rb=await p.locator('#tl-ruler').boundingBox();
 await p.mouse.move(rb.x+rb.width*0.6,rb.y+rb.height/2);await p.mouse.down();await p.mouse.up();await p.waitForTimeout(300);
 let tl2=await tlState();
 assert.ok(!tl2.liveHidden&&tl2.time!=='','scrub froze the playhead: '+JSON.stringify(tl2));
 await p.evaluate(()=>{const w=document.querySelector('#canvas-wrap');scrollTo(0,w.getBoundingClientRect().top+scrollY-8);});await p.waitForTimeout(300);
 box=await p.locator('#preview').boundingBox();
 const kdS2={x:box.x+box.width*(0.5-(0.25/0.75)*0.5*parseFloat((await state()).zoom)),y:box.y+box.height/2};
 await dragPinch(kdS2.x,kdS2.y,kdS2.x+60,kdS2.y);
 let tl3=await tlState();
 assert.strictEqual(tl3.time,tl2.time,'deliberate freeze survived the cancelled drag: '+JSON.stringify(tl3));
 assert.ok(!tl3.liveHidden,'live-resume button still visible for the preserved freeze');
 let s5b=await state();
 assert.strictEqual(s5b.keyd.timeline.keys.length,2,'frozen-scrub cancelled drag left no key behind');
 await p.locator('#btn-tl-live').click();await p.waitForTimeout(200);
 // 3. 3D: spread dollies the camera in, pinch dollies it back out, inside the wheel range
 await p.evaluate(()=>{const w=document.querySelector('#canvas-wrap');scrollTo(0,w.getBoundingClientRect().top+scrollY-8);});await p.waitForTimeout(300);
 await p.tap('#btn-3d');await p.waitForSelector('[data-el-root]',{state:'attached',timeout:20000});
 await p.waitForFunction(()=>{const s=Editor3D._test.scene();return s&&s.canvas;},{timeout:20000});
 const camZ=()=>p.evaluate(()=>{let z=null;Editor3D._test.scene().querySelectorAll('[camera]').forEach(n=>{z=n.getAttribute('position').z;});return z;});
 const z0=await camZ();
 const sbox=await p.evaluate(()=>{const r=Editor3D._test.scene().canvas.getBoundingClientRect();return {x:r.left,y:r.top,width:r.width,height:r.height};});
 await pinch(sbox,60,120);
 const z1=await camZ();
 assert.ok(Math.abs(z1-z0*0.5)<0.05,'3D spread dollied in ~2x: '+z0+' -> '+z1);
 await pinch(sbox,180,60);
 const z2=await camZ();
 assert.ok(Math.abs(z2-z1*3)<0.08,'3D pinch dollied back out ~3x: '+z1+' -> '+z2);
 let s3=await state();
 assert.strictEqual(s3.free.x,.3,'3D view zoom never moved the element');
 assert.ok(!s3.free.timeline||!s3.free.timeline.keys,'view zoom created no timeline');
 // 3b. 3D rollback: one finger drags the move gizmo, second finger pinches - the gizmo drag rolls back
 await p.evaluate(()=>{document.querySelectorAll('#element-list li').forEach(li=>{if(li.textContent.includes('FR'))li.click();});});
 await p.waitForTimeout(500);
 const tip=await p.evaluate(()=>{Editor3D._test.scene().object3D.updateMatrixWorld(true);const g=Editor3D._test.gizmo();const cone=g.children[0].children[1];const v=new THREE.Vector3();cone.getWorldPosition(v);v.project(Editor3D._test.scene().camera);const r=Editor3D._test.scene().canvas.getBoundingClientRect();return {x:r.left+(v.x+1)/2*r.width,y:r.top+(-v.y+1)/2*r.height};});
 await dragPinch(tip.x,tip.y,sbox.x+sbox.width/2,sbox.y+sbox.height*0.8);
 let s6=await state();
 assert.strictEqual(s6.free.x,.3,'pinch cancelled the first-finger gizmo drag: FR.x rolled back, got '+s6.free.x);
 assert.ok(!s6.free.timeline||!s6.free.timeline.keys,'cancelled gizmo drag created no timeline');
 // 3D keyed rollback also restores the playhead: gizmo-drag KD, pinch, back to live, no key
 await p.evaluate(()=>{document.querySelectorAll('#element-list li').forEach(li=>{if(li.textContent.includes('KD'))li.click();});});
 await p.waitForTimeout(500);
 const tipK=await p.evaluate(()=>{Editor3D._test.scene().object3D.updateMatrixWorld(true);const g=Editor3D._test.gizmo();const cone=g.children[0].children[1];const v=new THREE.Vector3();cone.getWorldPosition(v);v.project(Editor3D._test.scene().camera);const r=Editor3D._test.scene().canvas.getBoundingClientRect();return {x:r.left+(v.x+1)/2*r.width,y:r.top+(-v.y+1)/2*r.height};});
 await dragPinch(tipK.x,tipK.y,sbox.x+sbox.width/2,sbox.y+sbox.height*0.8);
 let s7=await state();
 assert.strictEqual(s7.keyd.timeline.keys.length,2,'cancelled 3D keyed gizmo drag left no key behind');
 const tl4=await p.evaluate(()=>({liveHidden:document.querySelector('#btn-tl-live').hidden,time:document.querySelector('#tl-time').textContent}));
 assert.ok(tl4.liveHidden&&tl4.time==='','cancelled 3D keyed drag left no freeze behind: '+JSON.stringify(tl4));
 console.log('PASS pinch zoom: two-finger spread/pinch zooms the 2D editing view and the 3D camera, mapping stays correct while zoomed, elements untouched');
}finally{await b.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exit(1)});
