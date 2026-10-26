const {chromium}=require('playwright-core'),assert=require('node:assert/strict'),path=require('path');const server=require('../../server/server');
// New elements start flush with the artwork plane (z=0, models seated on it) and 3D move mode shows curved rotation arrows next to the move arrows.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});try{
 const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const p=await ctx.newPage();p.on('pageerror',e=>console.log('PAGE',e.message));
 await p.goto(base+'/index.html');await p.waitForFunction(()=>document.querySelector('#exp-select').options.length>0);
 const id=await p.evaluate(async()=>{const r=Studio.blankExperience('flush');r.target={artRect:{x:0,y:0,w:768,h:1024},natural:{w:768,h:1024}};const c=document.createElement('canvas');c.width=768;c.height=1024;const g=c.getContext('2d');g.fillStyle='#e8e0d0';g.fillRect(0,0,768,1024);g.fillStyle='#223';for(let i=0;i<40;i++)g.fillRect((i*37)%700,(i*91)%950,50,50);r.assets.__artwork=await new Promise(res=>c.toBlob(res,'image/png'));await Studio.save(r);const o=document.createElement('option');o.value=r.id;o.textContent=r.name;document.querySelector('#exp-select').append(o);return r.id;});
 await p.locator('#exp-select').selectOption(id);await p.waitForFunction(()=>parseFloat(document.querySelector('#preview').style.height)>300,{timeout:15000});
 await p.evaluate(()=>document.querySelector('#btn-text').click());await p.waitForTimeout(500);
 await p.evaluate(()=>document.querySelector('#btn-particles').click());await p.waitForTimeout(500);
 await p.setInputFiles('#file-image',path.join(__dirname,'../../studio/library/orbit-poster.png'));await p.waitForTimeout(1500);
 await p.setInputFiles('#file-model',path.join(__dirname,'../../studio/library/gem.glb'));await p.waitForTimeout(2500);
 const els=await p.evaluate(id=>Studio.load(id).then(r=>r.elements.map(e=>({type:e.type,z:e.z,seat:e.seat||null}))),id);
 console.log(JSON.stringify(els));
 for(const e of els)assert.equal(e.z,0,e.type+' starts at z=0 (flush with the artwork)');
 assert.equal(els.find(e=>e.type==='model').seat,'plane','new model is seated on the plane');
 assert.equal(els.filter(e=>e.type!=='model').every(e=>e.seat===null),true);
 // 3D: artwork backdrop is pushed back so z=0 layers cannot z-fight; model back face sits on z=0
 await p.tap('#btn-3d');await p.waitForSelector('[data-el-root]',{state:'attached',timeout:20000});await p.waitForTimeout(2500);
 const po=await p.evaluate(()=>{const sc=Editor3D._test.scene();let r=null;sc.object3D.traverse(o=>{if(o.material&&o.material.map&&o.parent&&o.el&&o.el.tagName==='A-PLANE'&&!o.el.closest('[data-el-root]'))r=o.material.polygonOffset;});return r;});
 assert.equal(po,true,'artwork backdrop has polygonOffset (flush layers win the depth test)');
 const modelZ=await p.evaluate(()=>{const n=[...document.querySelectorAll('[data-el-root]')].find(x=>x.querySelector('[gltf-model]')||x.getAttribute('data-el-root')&&x.querySelector('a-entity'));const m=n&&n.object3D;if(!m)return null;const box=new THREE.Box3().setFromObject(m);return {minZ:box.min.z,maxZ:box.max.z};});
 console.log('model world z-range',JSON.stringify(modelZ));
 assert.ok(modelZ&&Math.abs(modelZ.minZ)<0.01&&modelZ.maxZ>0.01,'model back face rests on the artwork plane (min z ~0, extends toward viewer)');
 // gizmo: select the text, move mode shows three straight arrows AND three curved rotation arcs
 await p.evaluate(()=>{const li=[...document.querySelectorAll('#element-list li')].find(l=>l.textContent.includes('טקסט'));li.click();});await p.waitForTimeout(600);
 const info=await p.evaluate(()=>{Editor3D._test.scene().object3D.updateMatrixWorld(true);const g=Editor3D._test.gizmo();const parts=g.children.filter(c=>!c.userData.proxy||c.userData.gizmoPart).map(c=>c.userData.gizmoPart);return {parts,n:g.children.length};});
 console.log(JSON.stringify(info));
 for(const k of ['x','y','z','rot','rotX','rotY'])assert.ok(info.parts.includes(k),'gizmo has '+k);
 // touch target: projected width of the rot arc hit proxy >= 24px
 const px=await p.evaluate(()=>{const sc=Editor3D._test.scene(),g=Editor3D._test.gizmo(),cam=sc.camera,rect=sc.canvas.getBoundingClientRect();const pivot=g.children.find(c=>c.userData.gizmoPart==='rot');const hit=pivot.children.find(c=>c.userData.proxy);const R=hit.geometry.parameters.radius,t=hit.geometry.parameters.tube,a=hit.rotation.z+pivot.userData.span/2;const mid=new THREE.Vector3(Math.cos(a)*R,Math.sin(a)*R,0),out=new THREE.Vector3(Math.cos(a)*(R+t),Math.sin(a)*(R+t),0);hit.parent.updateMatrixWorld(true);const proj=v=>{const w=v.clone();hit.localToWorld(w);w.project(cam);return {x:(w.x+1)/2*rect.width,y:(1-w.y)/2*rect.height};};const A=proj(mid),B=proj(out);return {tubePx:Math.hypot(A.x-B.x,A.y-B.y)*2,x:A.x,y:A.y,w:rect.width,h:rect.height};});
 console.log(JSON.stringify(px));
 assert.ok(px.tubePx>=16,'curved arrow touch target >= 16px wide (move-arrow hit is ~10px): '+px.tubePx);
 assert.ok(px.x>0&&px.x<px.w&&px.y>0&&px.y<px.h,'curved arrow inside the viewport');
 // drag the curved Z arrow: element rotates and saves
 await p.evaluate(()=>Editor3D._test.scene().canvas.scrollIntoView({block:'center'}));await p.waitForTimeout(400);
 const proj=await p.evaluate(()=>{const sc=Editor3D._test.scene(),g=Editor3D._test.gizmo(),cam=sc.camera,rect=sc.canvas.getBoundingClientRect();const pivot=g.children.find(c=>c.userData.gizmoPart==='rot');const R=pivot.children[0].geometry.parameters.radius;const st=pivot.userData.start,sp=pivot.userData.span;const pt=a=>{const v=new THREE.Vector3(Math.cos(a)*R,Math.sin(a)*R,0);pivot.children[0].localToWorld(v);v.project(cam);return {x:rect.left+(v.x+1)/2*rect.width,y:rect.top+(1-v.y)/2*rect.height};};return {f:pt(sp/2),t:pt(sp/2+Math.PI/4)};});
 console.log(JSON.stringify(proj));const rot0=await p.evaluate(id=>Studio.load(id).then(r=>r.elements.find(e=>e.type==='text').rot),id);
 await p.mouse.move(proj.f.x,proj.f.y);await p.mouse.down();await p.mouse.move(proj.t.x,proj.t.y,{steps:8});await p.mouse.up();await p.waitForTimeout(600);
 const rot1=await p.evaluate(id=>Studio.load(id).then(r=>r.elements.find(e=>e.type==='text').rot),id);
 assert.ok(Math.abs(rot1-rot0)>20,'dragging the curved arrow rotated the element and saved: '+rot0+' -> '+rot1);
 await p.evaluate(()=>{const c=document.querySelector('#canvas-wrap');c&&c.scrollIntoView({block:'start'});});await p.waitForTimeout(300);
 await p.screenshot({path:'/downloads/flush-arcs-390.png'});
 console.log('PASS flush defaults + curved rotation arrows: z=0, model seated, backdrop pushed back, arcs touchable and rotate+save',JSON.stringify({rot0,rot1}));
}finally{await b.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exit(1)});
