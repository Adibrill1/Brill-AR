const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');
// The 2D real-scene layer keeps its size across creation switches: switching to a creation with no 3D layer hides it,
// and a resize measured while hidden used to leave its canvas at 0x0, so models vanished from the edit view (every layer
// still reported ready). Headless Chrome; not an iPhone.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl']});try{
const p=await (await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true})).newPage();const pageErrors=[];p.on('pageerror',e=>pageErrors.push(String(e)));
await p.goto(base+'/index.html');await p.waitForFunction(()=>document.querySelector('#exp-select').options.length>0);await p.waitForTimeout(800);
const mk=(withModel)=>p.evaluate(async withModel=>{const r=Studio.blankExperience(withModel?'with model':'plain');r.target={artRect:{x:0,y:0,w:768,h:768},natural:{w:768,h:768}};const c=document.createElement('canvas');c.width=c.height=768;const g=c.getContext('2d');g.fillStyle='#dde';g.fillRect(0,0,768,768);r.assets.__artwork=await new Promise(res=>c.toBlob(res));
  if(withModel){r.assets.m=await (await fetch('library/models/m-gems.glb')).blob();r.elements=[Studio.normEl({id:'m'+Math.random().toString(36).slice(2,6),name:'gems',type:'model',assetId:'m',x:0,y:0,w:.5,aspect:1,z:0,seat:'plane',flush:true})];}
  await Studio.save(r);const o=document.createElement('option');o.value=r.id;o.textContent=r.name;document.querySelector('#exp-select').append(o);return r.id;},withModel);
const a=await mk(true),plain=await mk(false),c=await mk(true);
const ready=async(id)=>{await p.locator('#exp-select').selectOption(id);await p.locator('#canvas-wrap').scrollIntoViewIfNeeded();
  await p.waitForFunction(async id=>(await Studio.load(id)).elements.every(e=>Editor3D.drawsIn2d(e.id)),id,{timeout:60000,polling:500});await p.waitForTimeout(600);
  return p.evaluate(()=>{const sc=Editor3D._test.scene();return [sc.canvas.width,sc.canvas.height];});};
const s1=await ready(a);assert.ok(s1[0]>0&&s1[1]>0,'first: '+s1);
await p.locator('#exp-select').selectOption(plain);await p.waitForTimeout(1200);
const s2=await ready(c);assert.ok(s2[0]>0&&s2[1]>0,'after a plain creation the layer has a size again: '+s2);
const s3=await ready(a);assert.ok(s3[0]>0&&s3[1]>0,'and back: '+s3);
assert.deepEqual(pageErrors,[],'no page errors');
console.log('PASS overlay-after-switch: real-scene layer keeps its size across creation switches');
}finally{await b.close();server.close();}})().catch(e=>{console.error(e&&e.stack||e);process.exit(1)});
