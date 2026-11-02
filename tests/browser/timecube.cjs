const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server'),path=require('path');
// Time cube layer: a short clip picked with "+ קוביית זמן" is baked on the device into a frame atlas (JPEG, only the
// atlas is kept), shows as a 3D box whose depth is time - its cut moves through the volume in a loop - in the 3D view
// and in the real-scene layer over the 2D canvas; the direction/edges/depth options are saved and rebuild the box; the
// layer survives an export/import round trip and builds for AR. Headless Chrome; not an iPhone.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--autoplay-policy=no-user-gesture-required']});try{
const p=await (await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true})).newPage();const pageErrors=[];p.on('pageerror',e=>pageErrors.push(String(e)));
await p.goto(base+'/index.html');await p.waitForFunction(()=>document.querySelector('#exp-select').options.length>0);await p.waitForTimeout(800);
const id=await p.evaluate(async()=>{const r=Studio.blankExperience('timecube');r.target={artRect:{x:0,y:0,w:768,h:768},natural:{w:768,h:768}};const c=document.createElement('canvas');c.width=c.height=768;const g=c.getContext('2d');g.fillStyle='#e9e4da';g.fillRect(0,0,768,768);r.assets.__artwork=await new Promise(res=>c.toBlob(res));await Studio.save(r);const o=document.createElement('option');o.value=r.id;o.textContent=r.name;document.querySelector('#exp-select').append(o);return r.id;});
await p.locator('#exp-select').selectOption(id);await p.waitForTimeout(500);
await p.locator('#file-timecube').setInputFiles(path.join(__dirname,'../../studio/library/loops/synthwave.mp4'));
for(let i=0;;i++){if(await p.evaluate(async id=>(await Studio.load(id)).elements.some(e=>e.type==='timecube'),id))break;if(i>180)throw new Error('no time cube after 90 s: '+await p.locator('#msg').textContent());await p.waitForTimeout(500);}
const saved=await p.evaluate(async id=>{const r=await Studio.load(id),el=r.elements.find(e=>e.type==='timecube'),a=r.assets[el.assetId];return {el,type:a.type,size:a.size,assets:Object.keys(r.assets).length,valid:Studio.validTimeCube(el)};},id);
console.log(JSON.stringify({tc:saved.el.timecube,aspect:saved.el.aspect,type:saved.type,size:saved.size}));
assert.equal(saved.type,'image/jpeg','only the frame atlas is kept (a JPEG)');assert.equal(saved.assets,2,'artwork + atlas, no copy of the clip');
assert.ok(saved.valid&&saved.el.timecube.frames>=24&&saved.el.timecube.dir==='front'&&saved.el.timecube.edges===true,'baked: '+JSON.stringify(saved.el.timecube));
assert.ok(saved.size<3*1024*1024,'atlas stays small: '+saved.size);
// 3D view: the box draws the frames and its cut moves
await p.locator('#canvas-wrap').scrollIntoViewIfNeeded();await p.click('#btn-3d');
await p.waitForFunction(()=>{const n=document.querySelector('[time-cube]');return n&&n.getObject3D('mesh')&&n.getObject3D('mesh').visible;},null,{timeout:30000});
await p.evaluate(()=>{const r=document.querySelector('#editor-3d-rig');r.setAttribute('rotation','-25 35 0');});await p.waitForTimeout(700);
const cut=()=>p.evaluate(()=>document.querySelector('[time-cube]').components['time-cube'].cut);
const c1=await cut();await p.waitForTimeout(700);const c2=await cut();
assert.ok(Math.abs(c2-c1)>0.02,'the cut moves through time: '+c1+' -> '+c2);
if(process.env.TC_SHOT)await p.locator('#canvas-wrap').screenshot({path:process.env.TC_SHOT});
const px=await p.evaluate(()=>{const sc=Editor3D._test.scene(),gl=sc.renderer.getContext();sc.renderer.render(sc.object3D,sc.camera);const n=document.querySelector('[time-cube]').object3D,v=new THREE.Vector3();n.getWorldPosition(v);v.project(sc.camera);const w=gl.drawingBufferWidth,h=gl.drawingBufferHeight,x=Math.round((v.x+1)/2*w),y=Math.round((v.y+1)/2*h),d=new Uint8Array(4);gl.readPixels(x,y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,d);return [...d];});
assert.ok(!(Math.abs(px[0]-217)<6&&Math.abs(px[1]-221)<6&&Math.abs(px[2]-227)<6),'the box draws (not the grey backdrop): '+px);
// options: direction and edges saved, the box rebuilt with them
await p.evaluate(()=>[...document.querySelectorAll('#element-list li')].find(l=>l.textContent.includes('קוביית זמן')).click());await p.waitForTimeout(300);
await p.evaluate(()=>{const b=document.querySelector('#panel-subtabs [data-sub="look"]');if(b&&b.offsetParent)b.click();});await p.waitForTimeout(300);
assert.ok(await p.locator('#row-timecube').isVisible(),'time cube options in the panel (look tab)');
await p.selectOption('#sel-tc-dir','left');await p.waitForTimeout(400);await p.locator('#ck-tc-edges').uncheck();await p.waitForTimeout(900);
const opt=await p.evaluate(async id=>{const el=(await Studio.load(id)).elements.find(e=>e.type==='timecube'),c=document.querySelector('[time-cube]').components['time-cube'];return {saved:el.timecube,dir:c.data.dir,edges:c.data.edges};},id);
assert.equal(opt.saved.dir,'left');assert.equal(opt.saved.edges,false);assert.equal(opt.dir,'left','box rebuilt with the new direction');assert.equal(opt.edges,false,'and without edges');
// fixed size: the box stays whole (no cut) and the clip flows through it instead
await p.locator('#ck-tc-fixed').check();await p.waitForTimeout(900);
const fx=await p.evaluate(async id=>{const el=(await Studio.load(id)).elements.find(e=>e.type==='timecube'),c=document.querySelector('[time-cube]').components['time-cube'],m=c.mesh;const a={cut:c.cut,sx:m.scale.x,sh:c.mat.uniforms.shift.value.x,flow:c.mat.uniforms.flow.value};await new Promise(r=>setTimeout(r,700));return {saved:el.timecube.fixed,data:c.data.fixed,a,b:{cut:c.cut,sx:m.scale.x,sh:c.mat.uniforms.shift.value.x}};},id);
assert.equal(fx.saved,true,'fixed size saved');assert.equal(fx.data,true,'box rebuilt as fixed size');
assert.ok(fx.a.cut===0&&fx.b.cut===0&&Math.abs(fx.a.sx-fx.b.sx)<1e-9&&fx.a.flow===1,'the box keeps its whole size: '+JSON.stringify(fx));
assert.ok(Math.abs(fx.b.sh-fx.a.sh)>0.02,'the clip flows through it (left: along x): '+JSON.stringify(fx));
// export/import round trip and the AR build
const rt=await p.evaluate(async id=>{const r=await Studio.load(id);const text=await Studio.exportJSON(r);const back=await Studio.importJSON(text,{save:false});const el=back.elements.find(e=>e.type==='timecube');const e=Studio.buildElementEntity(back,el,0,'ar');const a=e&&(e.getDOMAttribute('time-cube')||e.getAttribute('time-cube'));return {ok:!!el,attr:a&&typeof a==='object'?{frames:a.frames,src:!!a.src,fixed:a.fixed}:a};},id);
assert.ok(rt.ok&&rt.attr&&rt.attr.frames>=24&&rt.attr.src&&rt.attr.fixed===true,'export/import keeps the time cube and AR builds it: '+JSON.stringify(rt));
assert.deepEqual(pageErrors,[],'no page errors');
console.log('PASS timecube: baked to a JPEG atlas on import, drawn as a box whose cut moves through time, options rebuild it, fixed size keeps it whole, export/import and AR build');
}finally{await b.close();server.close();}})().catch(e=>{console.error(e&&e.stack||e);process.exit(1)});
