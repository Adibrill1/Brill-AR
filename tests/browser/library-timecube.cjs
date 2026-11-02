const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');
// Ready time cubes in the starter library: adding one bakes its loop on the device into a time cube layer with the
// entry's name, start width and slice direction (front for the loops that open on a blank page, so the front face
// plays the clip), and the box draws. Headless Chrome; not an iPhone.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--autoplay-policy=no-user-gesture-required']});try{
const p=await (await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true})).newPage();const pageErrors=[];p.on('pageerror',e=>pageErrors.push(String(e)));
await p.goto(base+'/index.html');await p.waitForFunction(()=>document.querySelector('#exp-select').options.length>0);await p.waitForTimeout(800);
const id=await p.evaluate(async()=>{const r=Studio.blankExperience('tc');r.target={artRect:{x:0,y:0,w:768,h:768},natural:{w:768,h:768}};const c=document.createElement('canvas');c.width=c.height=768;const g=c.getContext('2d');g.fillStyle='#e9e4da';g.fillRect(0,0,768,768);r.assets.__artwork=await new Promise(res=>c.toBlob(res));
  await Studio.save(r);const o=document.createElement('option');o.value=r.id;o.textContent=r.name;document.querySelector('#exp-select').append(o);return r.id;});
await p.locator('#exp-select').selectOption(id);await p.waitForTimeout(500);
for(const [lid,n,name,dir] of [['tc-stained-glass',1,'קוביית זמן: ויטראז׳','right'],['tc-ukiyo-wave',2,'קוביית זמן: אוקיו־אה','front']]){
  await p.locator('#shell-tabs button[data-tab="layers"]').click().catch(()=>{});await p.getByRole('button',{name:'ספריית התחלה'}).first().click();await p.waitForSelector('#starter-library[open]');
  await p.click('.library-filters button[data-group="timecube"]');await p.click(`[data-library-id="${lid}"]`);
  await p.waitForFunction(n=>!document.querySelector('#starter-library[open]')&&document.querySelectorAll('#element-list li').length===n,n,{timeout:120000});
  const el=await p.evaluate(async([id,n])=>{const e=(await Studio.load(id)).elements[n-1];return {type:e.type,name:e.name,w:e.w,dir:e.timecube.dir,edges:e.timecube.edges,frames:e.timecube.frames,valid:Studio.validTimeCube(e)};},[id,n]);
  assert.deepEqual([el.type,el.name,el.w,el.dir,el.edges],['timecube',name,.5,dir,true],lid+': '+JSON.stringify(el));
  assert.ok(el.valid&&el.frames>=24,lid+' baked: '+JSON.stringify(el));
}
await p.locator('#canvas-wrap').scrollIntoViewIfNeeded();await p.click('#btn-3d');
await p.waitForFunction(()=>{const n=[...document.querySelectorAll('[time-cube]')];return n.length===2&&n.every(x=>x.getObject3D('mesh')&&x.getObject3D('mesh').visible);},null,{timeout:60000});
assert.deepEqual(pageErrors,[],'no page errors');
console.log('PASS library-timecube: two ready cubes added from the library, baked with their names, widths and directions, both boxes draw');
}finally{await b.close();server.close();}})().catch(e=>{console.error(e&&e.stack||e);process.exit(1)});
