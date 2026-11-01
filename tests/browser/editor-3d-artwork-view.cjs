const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');
// The artwork stays in view in the 3D workspace: turning the view by dragging empty space stops at 70° (it used to turn
// without limit, so the artwork went edge-on and then away, leaving only the grey background), the artwork plane is
// two-sided, and the "חזית" button brings the view back face-on at the starting distance. Headless Chrome; not an iPhone.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl']});try{
const p=await (await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true})).newPage();const pageErrors=[];p.on('pageerror',e=>pageErrors.push(String(e)));
await p.goto(base+'/index.html');await p.waitForFunction(()=>document.querySelector('#exp-select').options.length>0);await p.waitForTimeout(800);
const id=await p.evaluate(async()=>{const r=Studio.blankExperience('view');r.target={artRect:{x:0,y:0,w:768,h:768},natural:{w:768,h:768}};const c=document.createElement('canvas');c.width=c.height=768;const g=c.getContext('2d');g.fillStyle='#c0392b';g.fillRect(0,0,768,768);r.assets.__artwork=await new Promise(res=>c.toBlob(res));
  await Studio.save(r);const o=document.createElement('option');o.value=r.id;o.textContent=r.name;document.querySelector('#exp-select').append(o);return r.id;});
await p.locator('#exp-select').selectOption(id);await p.locator('#canvas-wrap').scrollIntoViewIfNeeded();await p.waitForTimeout(600);
await p.click('#btn-3d');await p.waitForFunction(()=>Editor3D.isActive()&&document.querySelector('#editor-3d-rig a-plane')&&document.querySelector('#editor-3d-rig a-plane').getObject3D('mesh'),null,{timeout:20000});await p.waitForTimeout(800);
// on-screen width of the artwork plane, as a share of the 3D view's width
const state=()=>p.evaluate(()=>{const sc=Editor3D._test.scene(),art=document.querySelector('#editor-3d-rig a-plane'),m=art.getObject3D('mesh');sc.object3D.updateMatrixWorld(true);
  const w=art.getAttribute('width'),h=art.getAttribute('height'),xs=[[-w/2,-h/2],[w/2,-h/2],[-w/2,h/2],[w/2,h/2]].map(([x,y])=>{const v=new THREE.Vector3(x,y,0).applyMatrix4(m.matrixWorld).project(sc.camera);return v.x;});
  return {share:(Math.max(...xs)-Math.min(...xs))/2,rotY:document.querySelector('#editor-3d-rig').getAttribute('rotation').y,side:m.material.side,visible:art.object3D.visible,camZ:sc.camera.el.getAttribute('position').z};});
const s0=await state();assert.ok(s0.share>.5&&s0.visible,'face-on at start: '+JSON.stringify(s0));assert.equal(s0.side,2,'artwork plane is two-sided (THREE.DoubleSide)');
const box=await p.locator('#editor-3d-host canvas').first().boundingBox(),x0=box.x+box.width*.2,y0=box.y+box.height*.8;
for(let k=0;k<3;k++){await p.mouse.move(x0,y0);await p.mouse.down();for(let i=1;i<=10;i++)await p.mouse.move(x0+i*box.width*.06,y0);await p.mouse.up();await p.waitForTimeout(200);} // 3 drags: ~165° unclamped
const s1=await state();assert.equal(s1.rotY,70,'turning stops at 70°');assert.ok(s1.share>s0.share*.25,'the artwork is still well in view: '+JSON.stringify(s1));
await p.click('#btn-3d-front');await p.waitForTimeout(400);
const s2=await state();assert.equal(s2.rotY,0,'front view');assert.equal(s2.camZ,1.15,'starting distance');assert.ok(Math.abs(s2.share-s0.share)<.02,'face-on again: '+JSON.stringify(s2));
assert.deepEqual(pageErrors,[],'no page errors');
console.log('PASS editor-3d-artwork-view: view turn stops at 70°, artwork two-sided and in view, "חזית" resets the view');
}finally{await b.close();server.close();}})().catch(e=>{console.error(e&&e.stack||e);process.exit(1)});
