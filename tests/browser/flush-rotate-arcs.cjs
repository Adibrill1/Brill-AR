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
 assert.ok(modelZ&&Math.abs(modelZ.minZ)<1e-6&&modelZ.maxZ>0.01,'model back face rests on the artwork plane within 1e-6 art-heights (no depth tie offset), extends toward viewer: '+JSON.stringify(modelZ));
 // gizmo: select the text, move mode shows three straight arrows AND three curved rotation arcs
 await p.evaluate(()=>{const li=[...document.querySelectorAll('#element-list li')].find(l=>l.textContent.includes('טקסט'));li.click();});await p.waitForTimeout(600);
 const info=await p.evaluate(()=>{Editor3D._test.scene().object3D.updateMatrixWorld(true);const g=Editor3D._test.gizmo();const parts=g.children.filter(c=>!c.userData.proxy||c.userData.gizmoPart).map(c=>c.userData.gizmoPart);return {parts,n:g.children.length};});
 console.log(JSON.stringify(info));
 for(const k of ['x','y','z','rot','rotX','rotY'])assert.ok(info.parts.includes(k),'gizmo has '+k);
 await p.evaluate(()=>Editor3D._test.scene().canvas.scrollIntoView({block:'center'}));await p.waitForTimeout(400);
 const geo=()=>p.evaluate(()=>{Editor3D._test.scene().object3D.updateMatrixWorld(true);const sc=Editor3D._test.scene(),g=Editor3D._test.gizmo(),cam=sc.camera,rect=sc.canvas.getBoundingClientRect();const P=(o,v)=>{const w=v.clone();o.localToWorld(w);w.project(cam);return {x:rect.left+(w.x+1)/2*rect.width,y:rect.top+(1-w.y)/2*rect.height};};const out={rect:{l:rect.left,t:rect.top,w:rect.width,h:rect.height}};
  for(const k of ['rot','rotX','rotY']){const pv=g.children.find(c=>c.userData.gizmoPart===k);const vis=pv.children[0],hit=pv.children.find(c=>c.userData.proxy);const R=vis.geometry.parameters.radius,sp=pv.userData.span,tu=hit.geometry.parameters.tube;const pm=P(vis,new THREE.Vector3(Math.cos(sp/2)*R,Math.sin(sp/2)*R,0)),po=P(vis,new THREE.Vector3(Math.cos(sp/2)*(R+tu),Math.sin(sp/2)*(R+tu),0));const p0=P(vis,new THREE.Vector3(R,0,0)),p1=P(vis,new THREE.Vector3(Math.cos(sp)*R,Math.sin(sp)*R,0));out[k]={mid:pm,width:2*Math.hypot(pm.x-po.x,pm.y-po.y),chord:Math.hypot(p0.x-p1.x,p0.y-p1.y)};}
  for(const k of ['x','y','z']){const gp=g.children.find(c=>c.userData.gizmoPart===k&&c.isGroup);const cyl=gp.children[0];out[k]={mid:P(cyl,new THREE.Vector3(0,0,0))};}
  return out;});
 const pick=async(pt)=>{await p.mouse.move(pt.x,pt.y);await p.mouse.down();await p.waitForTimeout(80);const part=await p.evaluate(()=>{const d=Editor3D._test.drag();return d&&d.part?d.part:(d?'move':null);});await p.mouse.up();await p.waitForTimeout(150);return part;};
 const verify=async(label)=>{const g=await geo();const res={};for(const k of ['rot','rotX','rotY']){assert.ok(g[k].width>=24,label+' '+k+' arc hit width >=24px: '+g[k].width);assert.ok(g[k].chord>=(k==='rot'?24:12),label+' '+k+' arc visible chord (tilt arcs are foreshortened in the front view): '+g[k].chord);const m=g[k].mid;assert.ok(m.x>g.rect.l&&m.x<g.rect.l+g.rect.w&&m.y>g.rect.t&&m.y<g.rect.t+g.rect.h,label+' '+k+' inside viewport '+JSON.stringify(m));if(label==='edge')await p.screenshot({path:'/downloads/flush-arcs-edge-390.png'});res[k]=await pick(m);assert.equal(res[k],k,label+': touching the '+k+' arc grabs '+k+', got '+res[k]);}
  for(const k of ['x','y','z']){const m=g[k].mid;const got=await pick(m);assert.notEqual(got&&got.startsWith('rot'),true,label+': touching the '+k+' move arrow does not grab a rotation arc ('+got+')');}
  return g;};
 const g1=await verify('default');
 console.log(JSON.stringify({w:{rot:g1.rot.width,rotX:g1.rotX.width,rotY:g1.rotY.width},chord:{rot:g1.rot.chord,rotX:g1.rotX.chord,rotY:g1.rotY.chord}}));
 // edge: element near the right/top edge of the artwork
 await p.evaluate(async id=>{const r=await Studio.load(id);const e=r.elements.find(e=>e.type==='text');e.x=0.38;e.y=0.2;await Studio.save(r);},id);
 await p.reload();await p.waitForFunction(()=>document.querySelector('#exp-select').options.length>0);await p.locator('#exp-select').selectOption(id);await p.waitForFunction(()=>parseFloat(document.querySelector('#preview').style.height)>300);
 await p.tap('#btn-3d');await p.waitForSelector('[data-el-root]',{state:'attached',timeout:20000});await p.waitForTimeout(2000);
 await p.evaluate(()=>{const li=[...document.querySelectorAll('#element-list li')].find(l=>l.textContent.includes('טקסט'));li.click();});await p.waitForTimeout(600);
 await p.evaluate(()=>Editor3D._test.scene().canvas.scrollIntoView({block:'center'}));await p.waitForTimeout(400);
 await verify('edge');
 await p.screenshot({path:'/downloads/flush-arcs-edge-390.png'});
 // back to the default spot: drag the curved Z arrow, element rotates and saves
 await p.evaluate(async id=>{const r=await Studio.load(id);const e=r.elements.find(e=>e.type==='text');e.x=0;e.y=0.1;await Studio.save(r);},id);
 await p.reload();await p.waitForFunction(()=>document.querySelector('#exp-select').options.length>0);await p.locator('#exp-select').selectOption(id);await p.waitForFunction(()=>parseFloat(document.querySelector('#preview').style.height)>300);
 await p.tap('#btn-3d');await p.waitForSelector('[data-el-root]',{state:'attached',timeout:20000});await p.waitForTimeout(2000);
 await p.evaluate(()=>{const li=[...document.querySelectorAll('#element-list li')].find(l=>l.textContent.includes('טקסט'));li.click();});await p.waitForTimeout(600);
 await p.evaluate(()=>Editor3D._test.scene().canvas.scrollIntoView({block:'center'}));await p.waitForTimeout(400);
 await p.screenshot({path:'/downloads/flush-arcs-390.png'});
 const rotDrag=async(k,prop,dir)=>{const g=await geo();const m=g[k].mid;const v0=await p.evaluate(([id,prop])=>Studio.load(id).then(r=>r.elements.find(e=>e.type==='text')[prop]||0),[id,prop]);await p.mouse.move(m.x,m.y);await p.mouse.down();await p.mouse.move(m.x+dir*30,m.y+dir*22,{steps:8});await p.mouse.up();await p.waitForTimeout(600);const v1=await p.evaluate(([id,prop])=>Studio.load(id).then(r=>r.elements.find(e=>e.type==='text')[prop]||0),[id,prop]);assert.ok(Math.abs(v1-v0)>3,'dragging the '+k+' arc changed '+prop+': '+v0+' -> '+v1);return [v0,v1];};
 const out={};out.rot=await rotDrag('rot','rot',1);out.rotX=await rotDrag('rotX','rotX',1);out.rotY=await rotDrag('rotY','rotY',1);
 // depth policy: new (flush) layers carry NO depth tie offset, legacy layers keep theirs
 // add a legacy (pre-flush) layer to the same scene: it must keep its depth tie, new layers must have none
 await p.evaluate(async id=>{const r=await Studio.load(id);r.elements.push({id:'legacy1',type:'text',name:'old',text:'old',color:'#fff',bold:true,x:0.1,y:-0.2,w:0.3,h:null,rot:0,z:0.1,seq:r.elements[0].seq});r.elements.forEach(Studio.normEl);await Studio.save(r);},id);
 await p.reload();await p.waitForFunction(()=>document.querySelector('#exp-select').options.length>0);await p.locator('#exp-select').selectOption(id);await p.waitForFunction(()=>parseFloat(document.querySelector('#preview').style.height)>300);
 await p.tap('#btn-3d');await p.waitForSelector('[data-el-root]',{state:'attached',timeout:20000});await p.waitForTimeout(2500);
 const zs=await p.evaluate(()=>{const rec=null;return [...document.querySelectorAll('[data-el-root]')].map(n=>({id:n.getAttribute('data-el-root')||n.dataset.elRoot||n.id,z:n.object3D.position.z}));});
 console.log(JSON.stringify(zs));
 const flushZ=zs.slice(0,4).map(x=>x.z),legacy=zs[4].z;
 assert.deepEqual(flushZ,[0,0,0,0],'four new layers sit exactly at z=0 (no per-layer depth offset): '+flushZ);
 assert.ok(Math.abs(legacy-(0.1+4*0.001))<1e-9,'legacy layer keeps its z + index tie (existing scenes unchanged): '+legacy);
 const ro=await p.evaluate(()=>[...document.querySelectorAll('[data-el-root]')].filter((n,i)=>i===0||i===2).map(n=>{let r=null,dw=null;n.object3D.traverse(m=>{if(m.isMesh&&m.renderOrder>0&&r===null){r=m.renderOrder;dw=m.material.depthWrite;}});return {r,dw};}));
 console.log(JSON.stringify(ro));
 assert.ok(ro[0].r&&ro[1].r&&ro[0].r<ro[1].r,'flush layers (text idx0, image idx2) draw in array order via renderOrder: '+JSON.stringify(ro));assert.ok(ro.every(x=>x.dw===false),'flat flush layers do not write depth, so coplanar layers cannot z-fight: '+JSON.stringify(ro));
 console.log('PASS flush defaults + curved rotation arrows: z=0, model seated, arcs wide enough, each arc grabs its own axis (not move arrows) at default and edge position, drag rotates+saves',JSON.stringify(out));
}finally{await b.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exit(1)});
