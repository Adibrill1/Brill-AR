const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');
// Desktop editing with a mouse (no touch): a left drag still moves an item; the wheel does what a pinch does - over the
// selected item it resizes it (one save when the wheel stops; a keyed item gets a scale key), anywhere else it zooms the
// 2D view / moves the 3D camera; a right-button drag turns the 3D view even over a layer. Headless Chrome; not Safari.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl']});try{
const ctx=await b.newContext({viewport:{width:1280,height:900}});const p=await ctx.newPage();const pageErrors=[];p.on('pageerror',e=>pageErrors.push(String(e)));
await p.goto(base+'/index.html');await p.waitForFunction(()=>document.querySelector('#exp-select').options.length>0);await p.waitForTimeout(800);
const id=await p.evaluate(async()=>{const r=Studio.blankExperience('mouse-wheel');r.target={artRect:{x:0,y:0,w:768,h:768},natural:{w:768,h:768}};const c=document.createElement('canvas');c.width=c.height=768;const g=c.getContext('2d');g.fillStyle='#ffffff';g.fillRect(0,0,768,768);r.assets.__artwork=await new Promise(res=>c.toBlob(res));
  const K={loop:false,keys:[{t:0,x:-.22,y:-.2,z:0,rot:0,opacity:1,scale:1,tap:'none'},{t:2,x:-.22,y:-.2,z:0,rot:0,opacity:1,scale:1,tap:'none'}]};
  r.elements=[{id:'big',name:'BIG',type:'text',text:'BIG',color:'#ff0000',x:0,y:.15,w:.2,rot:0},{id:'kd',name:'KD',type:'text',text:'KD',color:'#aa00aa',x:-.22,y:-.2,w:.2,rot:0,timeline:K},
    {id:'bg',name:'BG',type:'text',text:'BG',color:'#00aa00',x:.25,y:-.25,w:.3,rot:0}];r.elements.forEach(Studio.normEl);
  await Studio.save(r);const o=document.createElement('option');o.value=r.id;o.textContent=r.name;document.querySelector('#exp-select').append(o);return r.id;});
await p.locator('#exp-select').selectOption(id);await p.waitForFunction(()=>parseFloat(document.querySelector('#preview').style.height)>300,{timeout:10000});
await p.locator('#canvas-wrap').scrollIntoViewIfNeeded();await p.waitForTimeout(500);
const saved=()=>p.evaluate(async id=>(await Studio.load(id)).elements.map(e=>({id:e.id,x:e.x,w:e.w,keys:e.timeline&&e.timeline.keys.map(k=>({t:k.t,scale:k.scale}))})),id);
const at2d=(ex,ey)=>p.evaluate(([ex,ey])=>{const c=document.querySelector('#preview'),r=c.getBoundingClientRect(),s=Math.min(r.width/768*1,r.height/1024)*768;return {x:r.left+r.width/2+ex*s,y:r.top+r.height/2-ey*s};},[ex,ey]);
const wheel=async(x,y,dy,n)=>{await p.mouse.move(x,y);for(let i=0;i<n;i++){await p.mouse.wheel(0,dy);await p.waitForTimeout(40);}await p.waitForTimeout(800);};
// 2D: a left drag moves the item
let c=await at2d(0,.15);await p.mouse.move(c.x,c.y);await p.mouse.down();await p.mouse.move(c.x+30,c.y,{steps:5});await p.mouse.move(c.x+60,c.y,{steps:5});await p.mouse.up();await p.waitForTimeout(700);
let s=await saved();assert.ok(s[0].x>.05,'2D: a mouse drag moves the selected item: '+JSON.stringify(s[0]));
// 2D: the wheel over the selected item resizes it (up = bigger), and the view does not zoom
c=await at2d(s[0].x,.15);const z0=await p.evaluate(()=>document.querySelector('#preview').dataset.zoom);
await wheel(c.x,c.y,-100,4);s=await saved();assert.ok(s[0].w>.3,'2D: wheel up on the item makes it bigger: '+s[0].w);
assert.equal(await p.evaluate(()=>document.querySelector('#preview').dataset.zoom),z0,'2D: the view does not zoom while resizing');
await wheel(c.x,c.y,100,4);s=await saved();assert.ok(Math.abs(s[0].w-.2)<.03,'2D: wheel down brings it back: '+s[0].w);
// 2D keyed item: a scale key at the playhead, base width unchanged
await p.evaluate(()=>[...document.querySelectorAll('#element-list li')].find(l=>l.textContent.includes('KD')).click());await p.waitForTimeout(400);
c=await at2d(-.22,-.2);await wheel(c.x,c.y,-100,3);s=await saved();
assert.equal(s[1].w,.2,'2D keyed: base width unchanged');assert.ok(s[1].keys.some(k=>k.scale>1.3),'2D keyed: a bigger scale key at the playhead: '+JSON.stringify(s[1]));
// 2D: the wheel off the item zooms the view; the page does not scroll
const sy=await p.evaluate(()=>scrollY);const off=await p.evaluate(()=>{const r=document.querySelector('#preview').getBoundingClientRect();return {x:r.left+12,y:r.top+12};});
await wheel(off.x,off.y,-100,3);const z1=+await p.evaluate(()=>document.querySelector('#preview').dataset.zoom);
assert.ok(z1>1.2,'2D: the wheel on empty space zooms the view: '+z1);assert.equal(await p.evaluate(()=>scrollY),sy,'the page does not scroll under the editor');
await wheel(off.x,off.y,100,3);
// 3D: the wheel over the selected item resizes it; the camera stays
await p.click('#btn-3d');await p.waitForFunction(()=>Editor3D.isActive()&&document.querySelector('[data-el-root="big"]'),null,{timeout:20000});await p.waitForTimeout(900);
await p.evaluate(()=>[...document.querySelectorAll('#element-list li')].find(l=>l.textContent.includes('BIG')).click());await p.waitForTimeout(400);
const at3d=(eid)=>p.evaluate(eid=>{const sc=Editor3D._test.scene(),n=document.querySelector('[data-el-root="'+eid+'"]').object3D,v=new THREE.Vector3();sc.object3D.updateMatrixWorld(true);n.getWorldPosition(v);v.project(sc.camera);const r=sc.canvas.getBoundingClientRect();return {x:r.left+(v.x+1)/2*r.width,y:r.top+(1-v.y)/2*r.height,camZ:sc.camera.el.getAttribute('position').z};},eid);
c=await at3d('big');const w0=(await saved())[0].w;
await wheel(c.x,c.y,-100,4);s=await saved();const c2=await at3d('big');
assert.ok(s[0].w>w0*1.4,'3D: wheel up on the item makes it bigger: '+w0+' -> '+s[0].w);assert.equal(c2.camZ,c.camZ,'3D: the camera stays put');
const drawn=await p.evaluate(()=>document.querySelector('[data-el-root="big"]').object3D.scale.x);assert.ok(Math.abs(drawn-1)<.01,'3D: once the wheel stops the size is in the item: '+drawn);
// 3D: the wheel off the item moves the camera; the item stays
const spot=await p.evaluate(()=>{const cv=Editor3D._test.scene().canvas,r=cv.getBoundingClientRect();for(const fy of [.9,.1,.85])for(const fx of [.1,.2,.8,.9]){const x=r.left+r.width*fx,y=r.top+r.height*fy;if(document.elementFromPoint(x,y)===cv)return {x,y};}return null;});
assert.ok(spot,'an empty spot on the 3D canvas');const w1=(await saved())[0].w;
await wheel(spot.x,spot.y,-100,3);assert.ok((await at3d('big')).camZ<c.camZ,'3D: the wheel on empty space moves the camera closer');assert.equal((await saved())[0].w,w1,'3D: and leaves the item alone');
// 3D: a right-button drag over a layer turns the view and does not change the selection
const bg=await at3d('bg');const r0=await p.evaluate(()=>document.querySelector('#editor-3d-rig').getAttribute('rotation').y);
await p.mouse.move(bg.x,bg.y);await p.mouse.down({button:'right'});await p.mouse.move(bg.x+40,bg.y,{steps:4});await p.mouse.move(bg.x+80,bg.y,{steps:4});await p.mouse.up({button:'right'});await p.waitForTimeout(300);
const r1=await p.evaluate(()=>document.querySelector('#editor-3d-rig').getAttribute('rotation').y);
assert.ok(Math.abs(r1-r0)>10,'3D: a right drag over a layer turns the view: '+r0+' -> '+r1);
assert.ok(await p.evaluate(()=>[...document.querySelectorAll('#element-list li')].some(l=>l.textContent.includes('BIG')&&/sel|active/.test(l.className))),'3D: the selection stays on the item');
assert.deepEqual(pageErrors,[],'no page errors');
console.log('PASS editor-mouse-wheel: mouse drag moves; the wheel resizes the selected item (2D, keyed, 3D) or zooms the view/camera; a right drag turns the 3D view');
}finally{await b.close();server.close();}})().catch(e=>{console.error(e&&e.stack||e);process.exit(1)});
