const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');
// Acceptance (editing-semantics guard): a gizmo manipulation the timeline would silently
// override must be REFUSED with a message - never a silent base-prop edit. Base edits stay
// available where they are the real behavior (rotX/rotY tilts, unkeyed elements).
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});try{
 const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const p=await ctx.newPage();
 await p.goto(base+'/index.html');await p.waitForFunction(()=>document.querySelector('#exp-select').options.length>0);
 const id=await p.evaluate(async()=>{const r=Studio.blankExperience('guard3d');r.target={artRect:{x:0,y:0,w:768,h:1024},natural:{w:768,h:1024}};const c=document.createElement('canvas');c.width=768;c.height=1024;const g=c.getContext('2d');g.fillStyle='#ffffff';g.fillRect(0,0,768,1024);r.assets.__artwork=await new Promise(res=>c.toBlob(res));
  const curve={id:'curve',name:'C',type:'text',text:'C',color:'#0000ff',x:0,y:.2,w:.15,rot:0,timeline:{loop:false,xyMap:{baseX:0,baseY:.2,matrix:[1,0,0,1,0,0]},keys:[{t:0,x:0,y:0,z:0,rot:0,opacity:1,scale:1,tap:'none'},{t:2,x:.2,y:0,z:0,rot:0,opacity:1,scale:1,tap:'none'}]}};
  const grp={id:'grp',name:'G',type:'group',x:-.2,y:-.2,w:.3,rot:0,children:['gc'],timeline:{loop:false,keys:[{t:0,x:-.2,y:-.2,z:0,rot:0,opacity:1,scale:1,tap:'none'},{t:2,x:-.1,y:-.2,z:0,rot:45,opacity:1,scale:1,tap:'none'}]}};
  const gc={id:'gc',name:'GC',type:'text',text:'G',color:'#00aa00',x:0,y:0,w:.1,rot:0};
  const tilt={id:'tilt',name:'T',type:'text',text:'T',color:'#ff0000',x:.25,y:.2,w:.15,rot:0,timeline:{loop:false,keys:[{t:0,x:.25,y:.2,z:0,rot:0,opacity:1,scale:1,tap:'none'},{t:2,x:.25,y:.2,z:0,rot:90,opacity:1,scale:1,tap:'none'}]}};
  r.elements=[curve,grp,gc,tilt];r.elements.forEach(Studio.normEl);await Studio.save(r);const opt=document.createElement('option');opt.value=r.id;opt.textContent=r.name;document.querySelector('#exp-select').append(opt);return r.id;});
 await p.locator('#exp-select').selectOption(id);
 await p.waitForFunction(()=>parseFloat(document.querySelector('#preview').style.height)>300,{timeout:10000});
 await p.evaluate(()=>{const w=document.querySelector('#canvas-wrap');scrollTo(0,w.getBoundingClientRect().top+scrollY-8);});await p.waitForTimeout(300);
 await p.tap('#btn-3d');await p.waitForSelector('[data-el-root]',{state:'attached',timeout:20000});
 const tipOf=async(gi)=>{await p.evaluate(()=>Editor3D._test.scene().object3D.updateMatrixWorld(true));return p.evaluate(gi=>{const g=Editor3D._test.gizmo();const cone=g.children[gi].children[1];const v=new THREE.Vector3();cone.getWorldPosition(v);v.project(Editor3D._test.scene().camera);const r=Editor3D._test.scene().canvas.getBoundingClientRect();return {x:r.left+(v.x+1)/2*r.width,y:r.top+(-v.y+1)/2*r.height};},gi);};
 const ringPt=async(k,a)=>p.evaluate(([k,a])=>{const g=Editor3D._test.gizmo();const ring=g.children[k];const R=ring.geometry.parameters.radius;const v=new THREE.Vector3(Math.cos(a)*R,Math.sin(a)*R,0);ring.localToWorld(v);v.project(Editor3D._test.scene().camera);const r=Editor3D._test.scene().canvas.getBoundingClientRect();return {x:r.left+(v.x+1)/2*r.width,y:r.top+(-v.y+1)/2*r.height};},[k,a]);
 const selectEl=async(id2)=>{await p.evaluate(id2=>{Editor3D._test.scene();document.querySelectorAll('#element-list li').forEach(li=>{const t=li.textContent.trim().replace(/^\S+\s+/,'');if(t===id2||t.startsWith(id2+' '))li.click();});},id2);await p.waitForTimeout(400);await p.evaluate(()=>{const w=document.querySelector('#canvas-wrap');scrollTo(0,w.getBoundingClientRect().top+scrollY-8);});await p.waitForTimeout(300);};
 const state=()=>p.evaluate(id=>Studio.load(id).then(r=>({curve:r.elements.find(e=>e.id==='curve'),grp:r.elements.find(e=>e.id==='grp'),tilt:r.elements.find(e=>e.id==='tilt'),msg:document.querySelector('#msg').textContent,liveHidden:document.querySelector('#btn-tl-live').hidden})),id);
 // 1. curve-mapped (xyMap) element: X-arrow grab is REFUSED with a message; nothing changes
 await selectEl('C');
 let s0=await state();
 const tip=await tipOf(0);
 await p.mouse.move(tip.x,tip.y);await p.mouse.down();await p.waitForTimeout(150);
 assert.strictEqual(await p.evaluate(()=>Editor3D._test.drag()),null,'xyMap arrow grab starts no drag');
 let s1=await state();
 assert.ok(s1.msg.includes('ציר הזמן'),'gate message shown: "'+s1.msg+'"');
 assert.strictEqual(s1.curve.x,s0.curve.x,'base x unchanged');
 assert.strictEqual(s1.curve.timeline.keys.length,2,'no new key written');
 assert.ok(s1.liveHidden,'playhead NOT frozen by a gated drag');
 await p.mouse.up();await p.waitForTimeout(6000); // let the message clear
 // 2. keyed group: X-arrow gated; rot RING writes a key (supported channel)
 await selectEl('G');
 const tip2=await tipOf(0);
 await p.mouse.move(tip2.x,tip2.y);await p.mouse.down();await p.waitForTimeout(150);
 assert.strictEqual(await p.evaluate(()=>Editor3D._test.drag()),null,'keyed group arrow grab starts no drag');
 const s2=await state();
 assert.ok(s2.msg.includes('קבוצה'),'group gate message shown: "'+s2.msg+'"');
 await p.mouse.up();await p.waitForTimeout(6500);
 await p.tap('#btn-3d-rotate');await p.waitForTimeout(300);
 const f=await ringPt(2,Math.PI/4),t=await ringPt(2,3*Math.PI/4);
 await p.mouse.move(f.x,f.y);await p.mouse.down();await p.mouse.move(t.x,t.y,{steps:6});await p.mouse.up();await p.waitForTimeout(400);
 const s3=await state();
 const gk=s3.grp.timeline.keys;
 assert.ok(gk.length>=3&&Math.abs(gk[gk.length-1].rot-135)<30,'group rot ring wrote a key (supported channel): '+JSON.stringify(gk.map(k=>({t:k.t,rot:k.rot}))));
 // 3. keyed element, rotX ring (no channel anywhere): BASE tilt edit works, no freeze, no key
 await p.locator('#btn-tl-live').click();await p.waitForTimeout(300); // unfreeze from step 2's intended freeze
 await selectEl('T');
 const s4=await state();
 assert.ok(s4.liveHidden,'starting live again for the tilt check');
 const fx=await ringPt(0,Math.PI/4),tx=await ringPt(0,3*Math.PI/4);
 await p.mouse.move(fx.x,fx.y);await p.mouse.down();await p.mouse.move(tx.x,tx.y,{steps:6});await p.mouse.up();await p.waitForTimeout(400);
 const s5=await state();
 assert.ok(Math.abs((s5.tilt.rotX||0)-90)<25,'rotX ring tilted the element (base edit): rotX='+s5.tilt.rotX);
 assert.strictEqual(s5.tilt.timeline.keys.length,2,'no timeline key written for a channel-less tilt');
 assert.ok(s5.liveHidden,'tilt edit did NOT freeze the playhead');
 console.log('PASS 3D editing guard: silent-override edits refused with message; supported channels and base tilts preserved');
}finally{await b.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exit(1)});
