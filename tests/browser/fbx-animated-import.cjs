const {chromium}=require('playwright-core'),assert=require('node:assert/strict'),path=require('path');const server=require('../../server/server');
// FBX with a skeleton and a clip imports through the editor (converted on the device by the bundled AssimpJS worker),
// keeps its clip, and the model moves in the editor's 2D view (joints change between frames). Headless Chrome; not an iPhone.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl']});try{
const p=await (await b.newContext({viewport:{width:1100,height:900}})).newPage();const pageErrors=[];p.on('pageerror',e=>pageErrors.push(String(e)));
await p.goto(base+'/index.html');await p.waitForFunction(()=>document.querySelector('#exp-select').options.length>0);await p.waitForTimeout(800);
await p.locator('#btn-new').click();await p.locator('#file-artwork').setInputFiles(path.resolve('studio/library/star.png'));await p.waitForSelector('#sec-elements:not([hidden])');
await p.locator('#file-model').setInputFiles(path.resolve('tests/fixtures/dolphin-anim.fbx'));
await p.waitForSelector('#confirm-modal');const text=await p.locator('#confirm-modal').textContent();assert.ok(/תנועות/.test(text)&&!/סטטיים בלבד/.test(text),'dialog says moves are kept: '+text);
await p.click('#confirm-modal button:not([data-answer="no"])');
await p.waitForFunction(()=>document.querySelectorAll('#element-list li').length>0,null,{timeout:40000});
const el=await p.evaluate(async()=>{const r=await Studio.load(document.querySelector('#exp-select').value);const e=r.elements.find(x=>x.type==='model');const info=await Studio.modelClipInfo(r.assets[e.assetId]);return {name:e.name,clips:info.map(c=>c.name),msg:document.querySelector('#msg').textContent,id:e.id};});
assert.deepEqual(el.clips,['Armature|Swim'],'clip kept: '+el.clips);assert.ok(/תנועה/.test(el.msg),'note mentions checking the motion: '+el.msg);
await p.locator('#canvas-wrap').scrollIntoViewIfNeeded(); // the real-scene layer runs only while the canvas is on screen
await p.waitForFunction(id=>Editor3D.drawsIn2d(id),el.id,{timeout:60000});
const moved=await p.evaluate(async id=>{const m=Editor3D._test.node(id).querySelector('[gltf-model]').getObject3D('mesh');const bones=[];m.traverse(o=>{if(o.isBone)bones.push(o);});
  const q=()=>bones.map(b=>b.quaternion.toArray().map(v=>v.toFixed(4)).join());const a=q();await new Promise(r=>setTimeout(r,400));const c=q();return {bones:bones.length,changed:a.filter((x,i)=>x!==c[i]).length};},el.id);
assert.equal(moved.bones,13);assert.ok(moved.changed>3,'joints move in the editor: '+JSON.stringify(moved));
assert.deepEqual(pageErrors,[],'no page errors');
console.log('PASS fbx-animated-import: skeleton + clip kept, model moves in the 2D view');
}finally{await b.close();server.close();}})().catch(e=>{console.error(e&&e.stack||e);process.exit(1)});
