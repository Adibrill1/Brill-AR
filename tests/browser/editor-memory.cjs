const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');
// The edit view's real-scene layer does not grow with edits: every rebuild used to load each model again under a new
// URL (three.js kept a copy per URL), leave the replaced models' geometry/textures on the GPU and keep their decoded
// 1024px images in the file cache - an iPhone ran out of memory (models stayed purple placeholders or vanished).
// Also: while the WebGL context is lost the canvas takes the layers back, and they return when it is restored.
// Headless Chrome; not an iPhone.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl']});try{
const p=await (await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true})).newPage();const pageErrors=[];p.on('pageerror',e=>pageErrors.push(String(e)));
await p.goto(base+'/index.html');await p.waitForFunction(()=>document.querySelector('#exp-select').options.length>0);await p.waitForTimeout(800);
const id=await p.evaluate(async()=>{const r=Studio.blankExperience('memory');r.target={artRect:{x:0,y:0,w:768,h:768},natural:{w:768,h:768}};const c=document.createElement('canvas');c.width=c.height=768;c.getContext('2d').fillRect(0,0,9,9);r.assets.__artwork=await new Promise(res=>c.toBlob(res));
  r.assets.a=await (await fetch('library/models/q-alpaca.glb')).blob();r.assets.b=await (await fetch('library/models/marble_bust_01.glb')).blob();
  r.elements=[Studio.normEl({id:'m1',name:'a',type:'model',assetId:'a',x:-.2,y:0,w:.3,aspect:1,z:0,seat:'plane',flush:true}),Studio.normEl({id:'m2',name:'b',type:'model',assetId:'b',x:.2,y:0,w:.3,aspect:1,z:0,seat:'plane',flush:true})];
  await Studio.save(r);const o=document.createElement('option');o.value=r.id;o.textContent=r.name;document.querySelector('#exp-select').append(o);return r.id;});
await p.locator('#exp-select').selectOption(id);await p.locator('#canvas-wrap').scrollIntoViewIfNeeded();
const both=()=>p.waitForFunction(()=>Editor3D.drawsIn2d('m1')&&Editor3D.drawsIn2d('m2'),null,{timeout:60000});
await both();await p.waitForTimeout(800);
const mem=()=>p.evaluate(()=>{const sc=Editor3D._test.scene(),files=Object.values(THREE.Cache.files||{});return {cached:files.length,geometries:sc.renderer.info.memory.geometries,textures:sc.renderer.info.memory.textures};});
const m0=await mem();
await p.evaluate(()=>document.querySelector('#element-list li').click());await p.waitForTimeout(300);
for(let i=0;i<6;i++){await p.evaluate((i)=>{const s=document.getElementById('sl-scale');s.value=String(.3+i*.02);s.dispatchEvent(new Event('input',{bubbles:true}));s.dispatchEvent(new Event('change',{bubbles:true}));},i);await p.waitForTimeout(700);await both();}
await p.waitForTimeout(1500);
assert.deepEqual(await mem(),m0,'six resizes (six rebuilds) leave the cache and GPU memory where they were');
// lost context: the canvas takes the layers back; restored: the layer draws them again
await p.evaluate(()=>{window.__lc=Editor3D._test.scene().renderer.getContext().getExtension('WEBGL_lose_context');window.__lc.loseContext();});
await p.waitForFunction(()=>Editor3D._test.glLost()&&!Editor3D.drawsIn2d('m1'),null,{timeout:5000});
await p.evaluate(()=>window.__lc.restoreContext());await both();
assert.deepEqual(pageErrors,[],'no page errors');
console.log('PASS editor-memory: rebuilds keep memory flat '+JSON.stringify(m0)+'; lost WebGL context hands layers to the canvas and back');
}finally{await b.close();server.close();}})().catch(e=>{console.error(e&&e.stack||e);process.exit(1)});
