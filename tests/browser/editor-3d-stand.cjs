const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');
// "העמדה" in the 3D view stands the selected item upright on the artwork (the artwork as a floor): tilted 90° forward,
// square to it, its lowest point touching the picture - for a 3D model and for a flat image. The view leans back so
// the standing item is seen. The move/rotate tool buttons are drawn icons with Hebrew words (the "↔" character showed
// as a grey emoji tile on the iPhone). Headless Chrome; not an iPhone.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl']});try{
const p=await (await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true})).newPage();const pageErrors=[];p.on('pageerror',e=>pageErrors.push(String(e)));
await p.goto(base+'/index.html');await p.waitForFunction(()=>document.querySelector('#exp-select').options.length>0);await p.waitForTimeout(800);
const id=await p.evaluate(async()=>{const r=Studio.blankExperience('stand');r.target={artRect:{x:0,y:0,w:768,h:768},natural:{w:768,h:768}};const c=document.createElement('canvas');c.width=c.height=768;const g=c.getContext('2d');g.fillStyle='#2b6cb0';g.fillRect(0,0,768,768);r.assets.__artwork=await new Promise(res=>c.toBlob(res));
  const s=document.createElement('canvas');s.width=200;s.height=300;const sg=s.getContext('2d');sg.fillStyle='#e8590c';sg.fillRect(0,0,200,300);r.assets.pic=await new Promise(res=>s.toBlob(res));
  r.assets.a=await (await fetch('library/models/q-alpaca.glb')).blob();
  r.elements=[Studio.normEl({id:'m1',name:'model',type:'model',assetId:'a',x:-.2,y:-.1,w:.3,aspect:1,z:0,seat:'plane',rot:30}),Studio.normEl({id:'i1',name:'pic',type:'image',assetId:'pic',x:.2,y:.1,w:.25,aspect:200/300,z:0,rot:15})];
  await Studio.save(r);const o=document.createElement('option');o.value=r.id;o.textContent=r.name;document.querySelector('#exp-select').append(o);return r.id;});
await p.locator('#exp-select').selectOption(id);await p.locator('#canvas-wrap').scrollIntoViewIfNeeded();await p.waitForTimeout(600);
await p.click('#btn-3d');await p.waitForFunction(()=>Editor3D.isActive()&&document.querySelector('[data-el-root="m1"]')&&document.querySelector('[data-el-root="m1"] [gltf-model]').getObject3D('mesh'),null,{timeout:30000});await p.waitForTimeout(800);
const icons=await p.evaluate(()=>['btn-3d-move','btn-3d-rotate'].map(i=>{const e=document.getElementById(i);return {svg:!!e.querySelector('svg'),text:e.textContent.trim()};}));
assert.deepEqual(icons,[{svg:true,text:'הזזה'},{svg:true,text:'סיבוב'}],'tool buttons: drawn icon + Hebrew word');
assert.ok(await p.locator('#btn-3d-stand').isVisible(),'"העמדה" button visible in the 3D view');
// lowest point of a layer, in the artwork's own space
const low=(eid)=>p.evaluate((eid)=>{const rig=document.querySelector('#editor-3d-rig').object3D,n=document.querySelector('[data-el-root="'+eid+'"]').object3D;rig.updateMatrixWorld(true);const inv=new THREE.Matrix4().copy(rig.matrixWorld).invert(),box=new THREE.Box3(),pt=new THREE.Box3();n.traverse(o=>{if(!o.isMesh)return;if(!o.geometry.boundingBox)o.geometry.computeBoundingBox();pt.copy(o.geometry.boundingBox).applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv,o.matrixWorld));box.union(pt);});return {minZ:box.min.z,maxZ:box.max.z,h:box.max.y-box.min.y};},eid);
const stand=async(eid)=>{await p.evaluate((eid)=>{[...document.querySelectorAll('#element-list li')].find(li=>li.textContent.includes(eid==='m1'?'model':'pic')).click();},eid);await p.waitForTimeout(400);await p.click('#btn-3d-stand');await p.waitForTimeout(900);return p.evaluate(async({id,eid})=>(await Studio.load(id)).elements.find(e=>e.id===eid),{id,eid});};
for(const eid of ['i1','m1']){
  const before=await low(eid);const el=await stand(eid);const after=await low(eid);
  assert.equal(el.rotX,90,eid+' tilted 90° (saved)');assert.equal(el.rotY,0,eid+' square');assert.equal(el.rot,0,eid+' no in-plane turn');
  assert.ok(Math.abs(after.minZ)<.01,eid+' lowest point touches the artwork: '+JSON.stringify(after));
  assert.ok(after.maxZ-after.minZ>Math.max(before.maxZ-before.minZ,.03),eid+' stands out of the picture: before '+JSON.stringify(before)+' after '+JSON.stringify(after));
}
const rig=await p.evaluate(()=>document.querySelector('#editor-3d-rig').getAttribute('rotation'));assert.ok(rig.x<-30,'the view leans back to show the standing item: '+JSON.stringify(rig));
// turn all the way round: the view passes 90° and the artwork shows from behind
await p.click('#btn-3d-front');await p.waitForTimeout(300);
const box=await p.locator('#editor-3d-host canvas').first().boundingBox(),x0=box.x+box.width*.2,y0=box.y+box.height*.8; // open space below the artwork, clear of the handles and the buttons
for(let k=0;k<3;k++){await p.mouse.move(x0,y0);await p.mouse.down();for(let i=1;i<=10;i++)await p.mouse.move(x0+i*box.width*.06,y0);await p.mouse.up();await p.waitForTimeout(150);}
const back=await p.evaluate(()=>{const sc=Editor3D._test.scene(),art=document.querySelector('#editor-3d-rig a-plane'),m=art.getObject3D('mesh');sc.object3D.updateMatrixWorld(true);const n=new THREE.Vector3(0,0,1).transformDirection(m.matrixWorld),c=new THREE.Vector3();m.getWorldPosition(c);const toCam=sc.camera.getWorldPosition(new THREE.Vector3()).sub(c).normalize();
  const w=art.getAttribute('width'),h=art.getAttribute('height'),xs=[[-w/2,-h/2],[w/2,-h/2],[-w/2,h/2],[w/2,h/2]].map(([x,y])=>new THREE.Vector3(x,y,0).applyMatrix4(m.matrixWorld).project(sc.camera).x);
  return {rotY:document.querySelector('#editor-3d-rig').getAttribute('rotation').y,facing:n.dot(toCam),share:(Math.max(...xs)-Math.min(...xs))/2};});
assert.ok(back.facing<-.5,'looking at the artwork from behind: '+JSON.stringify(back));assert.ok(back.share>.3,'the artwork is in view from behind: '+JSON.stringify(back));
await p.click('#btn-3d-front');await p.waitForTimeout(300);assert.equal(await p.evaluate(()=>document.querySelector('#editor-3d-rig').getAttribute('rotation').y),0,'"חזית" brings the face back');
assert.deepEqual(pageErrors,[],'no page errors');
console.log('PASS editor-3d-stand: "העמדה" stands a model and an image upright touching the artwork, view leans back; view turns round to the artwork\'s back; tool buttons are drawn icons with words');
}finally{await b.close();server.close();}})().catch(e=>{console.error(e&&e.stack||e);process.exit(1)});
