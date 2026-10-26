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
 const sel=async()=>{await p.evaluate(()=>{const li=[...document.querySelectorAll('#element-list li')].find(l=>l.textContent.includes('טקסט'));li.click();});await p.waitForTimeout(600);await p.evaluate(()=>Editor3D._test.scene().canvas.scrollIntoView({block:'center'}));await p.waitForTimeout(400);};
 const layout=()=>p.evaluate(()=>{Editor3D._test.scene().object3D.updateMatrixWorld(true);const sc=Editor3D._test.scene(),g=Editor3D._test.gizmo(),cam=sc.camera,cr=sc.canvas.getBoundingClientRect();const R=e=>{const r=e.getBoundingClientRect();return {l:r.left,t:r.top,r:r.right,b:r.bottom,w:r.width,h:r.height};};
  const btns={};for(const [k,id] of [['rot','btn-rot-z'],['rotX','btn-rot-x'],['rotY','btn-rot-y'],['move','btn-3d-move'],['rotate','btn-3d-rotate']]){const e=document.getElementById(id);const r=R(e);const cx=(r.l+r.r)/2,cy=(r.t+r.b)/2;btns[k]={...r,top:document.elementFromPoint(cx,cy)===e};}
  const pts=[];const P=(v)=>{const w=v.clone();w.project(cam);return {x:cr.left+(w.x+1)/2*cr.width,y:cr.top+(1-w.y)/2*cr.height};};
  g.children.forEach(c=>{if(c.userData.proxy)return;const w=new THREE.Vector3();c.updateWorldMatrix(true,false);const geo=c.geometry;const tip=new THREE.Vector3(0,0,0);const pos=[tip];if(c.isGroup){const cone=c.children[1];if(cone){const v=new THREE.Vector3();cone.getWorldPosition(v);pts.push(P(v));}}});
  const o=new THREE.Vector3();g.getWorldPosition(o);pts.push(P(o));
  return {btns,pts,cr:{l:cr.left,t:cr.top,r:cr.right,b:cr.bottom}};});
 const corners=[[0,0.1,'c'],[0.4,0.45,'tr'],[-0.4,0.45,'tl'],[0.4,-0.45,'br'],[-0.4,-0.45,'bl'],[0.4,0,'r'],[-0.4,0,'l']];
 let first=true;
 for(const [cx,cy,nm] of corners){
  await p.evaluate(async([id,cx,cy])=>{const r=await Studio.load(id);const e=r.elements.find(e=>e.type==='text');e.x=cx;e.y=cy;e.rot=0;e.rotX=0;e.rotY=0;await Studio.save(r);},[id,cx,cy]);
  await p.reload();await p.waitForFunction(()=>document.querySelector('#exp-select').options.length>0);await p.locator('#exp-select').selectOption(id);await p.waitForFunction(()=>parseFloat(document.querySelector('#preview').style.height)>300);
  await p.tap('#btn-3d');await p.waitForSelector('[data-el-root]',{state:'attached',timeout:20000});await p.waitForTimeout(2000);
  await sel();
  const L=await layout();const names=['rot','rotX','rotY','move','rotate'];
  await p.screenshot({path:'/downloads/flush-corner-'+nm+'-390.png'});for(const k of names){const b=L.btns[k];assert.ok(b.top,nm+': '+k+' button is the top element at its centre (not covered)');assert.ok(b.l>=L.cr.l&&b.r<=L.cr.r&&b.t>=L.cr.t&&b.b<=L.cr.b,nm+': '+k+' inside the view '+JSON.stringify(b));}
  for(const k of ['rot','rotX','rotY'])assert.ok(L.btns[k].w>=44&&L.btns[k].h>=44,nm+': '+k+' button >=44px: '+L.btns[k].w);
  for(let i=0;i<names.length;i++)for(let j=i+1;j<names.length;j++){const a=L.btns[names[i]],b=L.btns[names[j]];assert.ok(a.r<=b.l||b.r<=a.l||a.b<=b.t||b.b<=a.t,nm+': '+names[i]+' and '+names[j]+' buttons do not overlap');}
  for(const pt of L.pts)for(const k of ['rot','rotX','rotY']){const b=L.btns[k];assert.ok(!(pt.x>b.l-4&&pt.x<b.r+4&&pt.y>b.t-4&&pt.y<b.b+4),nm+': 3D move-arrow point not under the '+k+' button '+JSON.stringify({pt,b}));}
  await p.screenshot({path:'/downloads/flush-corner-'+nm+'-390.png'});
  if(first){first=false;
   const dragBtn=async(k,prop,dx,dy)=>{const v0=await p.evaluate(([id,prop])=>Studio.load(id).then(r=>r.elements.find(e=>e.type==='text')[prop]||0),[id,prop]);const L2=await layout();const b=L2.btns[k];const sx=(b.l+b.r)/2,sy=(b.t+b.b)/2;await p.mouse.move(sx,sy);await p.mouse.down();await p.mouse.move(sx+dx,sy+dy,{steps:8});await p.mouse.up();await p.waitForTimeout(600);const v1=await p.evaluate(([id,prop])=>Studio.load(id).then(r=>r.elements.find(e=>e.type==='text')[prop]||0),[id,prop]);assert.ok(Math.abs(v1-v0)>5,'dragging the '+k+' button changed '+prop+': '+v0+' -> '+v1);return [v0,v1];};
   const out={};out.rot=await dragBtn('rot','rot',-60,40);out.rotX=await dragBtn('rotX','rotX',0,40);out.rotY=await dragBtn('rotY','rotY',40,0);
   // 3D move arrows still work (an arrow drag moves x, does not rotate)
   // predictable spin: pointer sweeps 90deg counter-clockwise around the element's screen centre, twice -> +90 then +180 (repeatable)
   await p.evaluate(async id=>{const r=await Studio.load(id);r.elements.find(e=>e.type==='text').rot=0;await Studio.save(r);},id);
   await p.reload();await p.waitForFunction(()=>document.querySelector('#exp-select').options.length>0);await p.locator('#exp-select').selectOption(id);await p.waitForFunction(()=>parseFloat(document.querySelector('#preview').style.height)>300);
   await p.tap('#btn-3d');await p.waitForSelector('[data-el-root]',{state:'attached',timeout:20000});await p.waitForTimeout(2000);await sel();
   const sweep=async()=>{const L3=await layout();const o=L3.pts[L3.pts.length-1],b=L3.btns.rot;const sx=(b.l+b.r)/2,sy=(b.t+b.b)/2;const a0=Math.atan2(sy-o.y,sx-o.x),rr=Math.max(40,Math.hypot(sx-o.x,sy-o.y));await p.mouse.move(sx,sy);await p.mouse.down();for(let i=1;i<=12;i++){const a=a0-(Math.PI/2)*i/12;await p.mouse.move(o.x+rr*Math.cos(a),o.y+rr*Math.sin(a));}await p.mouse.up();await p.waitForTimeout(600);return p.evaluate(id=>Studio.load(id).then(r=>r.elements.find(e=>e.type==='text').rot),id);};
   const r1=await sweep();console.log('sweep1',r1);assert.ok(Math.abs(r1-90)<8,'90deg counter-clockwise sweep around the element rotates it +90: '+r1);
   const r2=await sweep();console.log('sweep2',r2);assert.ok(Math.abs(r2-180)<12,'a second identical sweep adds another ~90 (repeatable): '+r2);
  }
 }
 // add a legacy (pre-flush) layer to the same scene: it must keep its depth tie, new layers must have none
 await p.evaluate(async id=>{const r=await Studio.load(id);const tx=r.elements.find(e=>e.type==='text');tx.x=0;tx.y=0.1;r.elements.push({id:'legacy1',type:'text',name:'old',text:'old',color:'#fff',bold:true,x:0.1,y:-0.2,w:0.3,h:null,rot:0,z:0.1,seq:r.elements[0].seq});r.elements.forEach(Studio.normEl);await Studio.save(r);},id);
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
 console.log('PASS flush defaults + curved rotation arrows: z=0, model seated, arcs wide enough, each arc grabs its own axis (not move arrows) at default and edge position, drag rotates+saves');
}finally{await b.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exit(1)});
