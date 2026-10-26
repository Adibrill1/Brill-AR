const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');
// Acceptance: the embedded 3D workspace is timeline-linked (Artivive pattern).
// 1. Keyframed elements render at the SAMPLED playhead position, same as the 2D canvas.
// 2. Scrubbing the 2D timeline ruler moves the 3D scene to that frame.
// 3. Gizmo drags on a keyframed element write timeline KEYS at the frozen playhead
//    (base props untouched); grabbing a gizmo during live playback freezes the playhead.
// 4. Unkeyed elements keep base-prop editing (rc62 behavior).
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});try{
 const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const p=await ctx.newPage();
 await p.goto(base+'/index.html');await p.waitForFunction(()=>document.querySelector('#exp-select').options.length>0);
 const id=await p.evaluate(async()=>{const r=Studio.blankExperience('tl3d');r.target={artRect:{x:0,y:0,w:768,h:1024},natural:{w:768,h:1024}};const c=document.createElement('canvas');c.width=768;c.height=1024;const g=c.getContext('2d');g.fillStyle='#ffffff';g.fillRect(0,0,768,1024);r.assets.__artwork=await new Promise(res=>c.toBlob(res));
  const anim={id:'anim',name:'A',type:'text',text:'A',color:'#0000ff',x:0,y:0,w:.15,rot:0,timeline:{loop:false,keys:[{t:0,x:-.3,y:0,z:0,rot:0,opacity:1,scale:1,tap:'none'},{t:2,x:.3,y:0,z:0,rot:90,opacity:1,scale:1,tap:'none'}]}};
  const stat={id:'stat',name:'S',type:'text',text:'S',color:'#ff0000',x:0,y:-.3,w:.15,rot:0};
  r.elements=[anim,stat];await Studio.save(r);const opt=document.createElement('option');opt.value=r.id;opt.textContent=r.name;document.querySelector('#exp-select').append(opt);return r.id;});
 await p.locator('#exp-select').selectOption(id);
 await p.waitForFunction(()=>parseFloat(document.querySelector('#preview').style.height)>300,{timeout:10000});
 await p.evaluate(()=>{const w=document.querySelector('#canvas-wrap');scrollTo(0,w.getBoundingClientRect().top+scrollY-8);});await p.waitForTimeout(300);
 const nodeX=()=>p.evaluate(()=>Editor3D._test.node('anim').object3D.position.x);
 const tsX=(x)=>p.evaluate(x=>Studio.toTargetSpace({target:{artRect:{x:0,y:0,w:768,h:1024}},elements:[]},{id:'anim',x,w:.15},1).x,x);
 await p.tap('#btn-3d');await p.waitForSelector('[data-el-root]',{state:'attached',timeout:20000});
 // select 'anim' in the list so the panel + timeline render for it
 await p.locator('#element-list li').first().click();await p.waitForTimeout(300);
 // 1. live playback: the node MOVES with the timeline (base x=0 would be static)
 const p1=await nodeX();await p.waitForTimeout(400);const p2=await nodeX();
 assert.ok(Math.abs(p2-p1)>0.01,'3D animates keyframed elements during live playback: '+p1+' -> '+p2);
 assert.ok(Math.abs(p1)>0.01||Math.abs(p2)>0.01,'sampled position differs from base x=0: '+p1+','+p2);
 // 2. scrub the ruler to the end (t=2s): element moves to x=+0.3 in 3D
 await p.evaluate(s=>{const b=document.querySelector('#panel-subtabs [data-sub="'+s+'"]');if(b&&b.offsetParent)b.click()},'tap');await p.locator('#tl-ruler').scrollIntoViewIfNeeded();await p.waitForTimeout(200);
 const ruler=await p.locator('#tl-ruler').boundingBox();
 await p.mouse.move(ruler.x+ruler.width*0.92,ruler.y+ruler.height/2);await p.mouse.down();await p.mouse.move(ruler.x+ruler.width*0.97,ruler.y+ruler.height/2,{steps:3});await p.mouse.up();await p.waitForTimeout(500);
 const afterScrub=await nodeX();
 assert.ok(Math.abs(afterScrub-(await tsX(0.3)))<0.03,'scrubbing the 2D ruler moves the 3D scene to that frame: '+afterScrub);
 const liveState=await p.evaluate(()=>{const b=document.querySelector('#btn-tl-live');return {exists:!!b,hidden:b&&b.hidden,display:b&&getComputedStyle(b).display,time:document.querySelector('#tl-time')&&document.querySelector('#tl-time').textContent};});
 console.log('LIVESTATE',JSON.stringify(liveState));
 assert.ok(liveState.exists&&!liveState.hidden,'playhead frozen (live button visible): '+JSON.stringify(liveState));
 // 3. keyed move-arrow drag writes a timeline KEY at the frozen t, base untouched
 await p.evaluate(()=>{const w=document.querySelector('#canvas-wrap');scrollTo(0,w.getBoundingClientRect().top+scrollY-8);});await p.waitForTimeout(300);
 const baseX=await p.evaluate(id=>Studio.load(id).then(r=>r.elements.find(e=>e.id==='anim').x),id);
 const tip=await p.evaluate(()=>{const g=Editor3D._test.gizmo();const cone=g.children[0].children[1];const v=new THREE.Vector3();cone.getWorldPosition(v);const o=new THREE.Vector3();g.getWorldPosition(o);v.lerp(o,0.5);/* grab the arrow shaft midpoint: with no periodic rebuild the cone tip can land past the canvas edge */v.project(Editor3D._test.scene().camera);const r=Editor3D._test.scene().canvas.getBoundingClientRect();return {x:r.left+(v.x+1)/2*r.width,y:r.top+(-v.y+1)/2*r.height};});
 await p.mouse.move(tip.x,tip.y);await p.mouse.down();await p.mouse.move(tip.x+40,tip.y,{steps:5});await p.mouse.up();await p.waitForTimeout(400);
 const keyed=await p.evaluate(id=>Studio.load(id).then(r=>{const e=r.elements.find(e=>e.id==='anim');const kn=e.timeline.keys.find(k=>k.t>2.5);const ko=e.timeline.keys.find(k=>k.t===2);return {baseX:e.x,kx:kn&&kn.x,kt:kn&&kn.t,oldX:ko&&ko.x};}),id);
 assert.strictEqual(keyed.baseX,baseX,'keyed drag leaves base x untouched');
 assert.ok(keyed.kt>2.5&&keyed.kx>0.31,'keyed drag wrote a NEW key at the frozen playhead (~2.9s): '+JSON.stringify(keyed));
 assert.strictEqual(keyed.oldX,0.3,'the original t=2 key is untouched: '+JSON.stringify(keyed));
 // 3b. keyed ring drag writes a rot KEY, base rot untouched
 await p.tap('#btn-3d-rotate');await p.waitForTimeout(400);
 await p.evaluate(()=>Editor3D._test.scene().object3D.updateMatrixWorld(true));
 const ringPt=async a=>p.evaluate(a=>{const g=Editor3D._test.gizmo();const ring=g.children[2];const R=ring.geometry.parameters.radius;const v=new THREE.Vector3(Math.cos(a)*R,Math.sin(a)*R,0);ring.localToWorld(v);v.project(Editor3D._test.scene().camera);const r=Editor3D._test.scene().canvas.getBoundingClientRect();return {x:r.left+(v.x+1)/2*r.width,y:r.top+(-v.y+1)/2*r.height};},a);
 const f=await ringPt(Math.PI/4),t=await ringPt(3*Math.PI/4);
 await p.mouse.move(f.x,f.y);await p.mouse.down();await p.mouse.move(t.x,t.y,{steps:6});await p.mouse.up();await p.waitForTimeout(400);
 const keyedRot=await p.evaluate(id=>Studio.load(id).then(r=>{const e=r.elements.find(e=>e.id==='anim');const k=e.timeline.keys.find(k=>k.t>2.5);return {baseRot:e.rot||0,krot:k&&k.rot};}),id);
 assert.strictEqual(keyedRot.baseRot,0,'keyed ring drag leaves base rot untouched');
 assert.ok(Math.abs(keyedRot.krot-180)<25,'ring drag wrote rot on the frozen-frame key (sampled 90 past t=2 + 90 drag): '+JSON.stringify(keyedRot));
 // 3c. back to live, grab the gizmo again: playhead auto-freezes and the key is written there
 await p.locator('#btn-tl-live').click();await p.waitForTimeout(400);
 await p.tap('#btn-3d-move');await p.waitForTimeout(300);
 await p.evaluate(()=>{const w=document.querySelector('#canvas-wrap');scrollTo(0,w.getBoundingClientRect().top+scrollY-8);});await p.waitForTimeout(300);
 const tip2=await p.evaluate(()=>{const g=Editor3D._test.gizmo();const cone=g.children[1].children[1];const v=new THREE.Vector3();cone.getWorldPosition(v);v.project(Editor3D._test.scene().camera);const r=Editor3D._test.scene().canvas.getBoundingClientRect();return {x:r.left+(v.x+1)/2*r.width,y:r.top+(-v.y+1)/2*r.height};});
 await p.mouse.move(tip2.x,tip2.y);await p.mouse.down();await p.waitForTimeout(150);
 assert.ok(await p.evaluate(()=>!document.querySelector('#btn-tl-live').hidden),'grabbing a keyframed element during live playback freezes the playhead');
 await p.mouse.move(tip2.x,tip2.y-30,{steps:4});await p.mouse.up();await p.waitForTimeout(400);
 const nKeys=await p.evaluate(id=>Studio.load(id).then(r=>r.elements.find(e=>e.id==='anim').timeline.keys.length),id);
 assert.ok(nKeys>=4,'a new key was written at the auto-frozen playhead: keys='+nKeys);
 // 4. unkeyed element still edits base props
 await p.locator('#element-list li').nth(1).click();await p.waitForTimeout(400);
 await p.evaluate(()=>{const w=document.querySelector('#canvas-wrap');scrollTo(0,w.getBoundingClientRect().top+scrollY-8);});await p.waitForTimeout(300);
 const statX0=await p.evaluate(id=>Studio.load(id).then(r=>r.elements.find(e=>e.id==='stat').x),id);
 const tip3=await p.evaluate(()=>{const g=Editor3D._test.gizmo();const cone=g.children[0].children[1];const v=new THREE.Vector3();cone.getWorldPosition(v);const o=new THREE.Vector3();g.getWorldPosition(o);v.lerp(o,0.5);/* grab the arrow shaft midpoint: with no periodic rebuild the cone tip can land past the canvas edge */v.project(Editor3D._test.scene().camera);const r=Editor3D._test.scene().canvas.getBoundingClientRect();return {x:r.left+(v.x+1)/2*r.width,y:r.top+(-v.y+1)/2*r.height};});
 await p.mouse.move(tip3.x,tip3.y);await p.mouse.down();await p.mouse.move(tip3.x+40,tip3.y,{steps:5});await p.mouse.up();await p.waitForTimeout(400);
 const stat=await p.evaluate(id=>Studio.load(id).then(r=>{const e=r.elements.find(e=>e.id==='stat');return {x:e.x,keys:(e.timeline&&e.timeline.keys||[]).length};}),id);
 assert.ok(stat.x>statX0+0.02&&stat.keys===0,'unkeyed element keeps base-prop editing, no keys created: '+JSON.stringify(stat));
 console.log('PASS 3D timeline linkage: sampled rendering, scrub sync, keyed gizmo writes, auto-freeze, base editing preserved');
}finally{await b.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exit(1)});
