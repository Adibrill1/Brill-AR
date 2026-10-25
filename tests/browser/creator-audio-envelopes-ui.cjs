// Spatial-audio envelope authoring (gap n:13). Engine modes (normal/spatial,
// linear vs logarithmic rolloff, inner/outer radius) are documented by Artivive's
// official spatial-audio demo (old interface); the on-canvas envelope rings are
// our own authoring aid and are labeled as such in the panel hint.
const {chromium}=require('playwright-core'),assert=require('assert/strict'),path=require('path'),server=require('../../server/server');
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--autoplay-policy=no-user-gesture-required']});try{
const p=await b.newPage({viewport:{width:1280,height:900}});
await p.goto(base+'/index.html');await p.waitForSelector('#element-list li');
await p.locator('#btn-new').click();await p.locator('#file-artwork').setInputFiles(path.resolve('studio/library/star.png'));await p.waitForSelector('#sec-elements:not([hidden])');
await p.locator('[data-add="sound"]').click();await p.locator('#file-sound').setInputFiles(path.resolve('studio/library/bell.wav'));
await p.waitForFunction(()=>document.querySelectorAll('#element-list li').length===1);
const id=await p.evaluate(()=>document.querySelector('#exp-select').value);
// enable spatial via the panel; the sound is the only element, auto-selected
await p.locator('#ck-spatial').check();
await p.waitForFunction(()=>{const e=window.__audioEnvelopes&&Object.values(window.__audioEnvelopes)[0];return e&&e.outer>0;});
const env0=await p.evaluate(()=>Object.values(window.__audioEnvelopes)[0]);
assert.ok(Math.abs(env0.outer-1.4)<.01,'default outer radius 1.4: '+JSON.stringify(env0));
assert.ok(Math.abs(env0.inner-.35)<.01,'default inner radius .35');
assert.ok(env0.rOuter>env0.rInner,'outer ring drawn larger than inner ring');
console.log('PASS spatial toggle draws inner+outer envelope rings at the documented default distances',env0);
// numeric field shrinks the ring (outer clamps to inner+0.01, so 0.5 is above the 0.35 default inner)
await p.locator('#num-spatial-out').fill('0.5');await p.locator('#num-spatial-out').dispatchEvent('change');
await p.waitForFunction(()=>{const e=Object.values(window.__audioEnvelopes||{})[0];return e&&Math.abs(e.outer-.5)<.01;});
const env1=await p.evaluate(()=>Object.values(window.__audioEnvelopes)[0]);
assert.ok(env1.rOuter<env0.rOuter,'ring follows the numeric field');
console.log('PASS numeric outer-radius field resizes the envelope ring',env1);
// drag the outer ring outward: spatialOuter grows and persists (canvas must be scrolled into view first)
await p.locator('#preview').scrollIntoViewIfNeeded();
const bb=await p.locator('#preview').boundingBox();
const ring=()=>p.evaluate(()=>Object.values(window.__audioEnvelopes)[0]);
let e1=await ring();
await p.mouse.move(bb.x+e1.cx+e1.rOuter,bb.y+e1.cy);await p.mouse.down();
await p.mouse.move(bb.x+e1.cx+e1.rOuter+60,bb.y+e1.cy,{steps:4});await p.mouse.up();
await p.waitForFunction(async id=>{const r=await Studio.load(id);return r.elements[0].spatialOuter>0.55;},id);
const after=await p.evaluate(async id=>{const r=await Studio.load(id);return {out:r.elements[0].spatialOuter,inn:r.elements[0].spatialInner};},id);
console.log('PASS dragging the outer envelope ring updates and persists the outer radius',after);
// dragging the inner ring past the outer clamps it to outer-0.01
e1=await ring();
await p.mouse.move(bb.x+e1.cx+e1.rInner,bb.y+e1.cy);await p.mouse.down();
await p.mouse.move(bb.x+e1.cx+e1.rOuter+40,bb.y+e1.cy,{steps:4});await p.mouse.up();
await p.waitForFunction(async id=>{const r=await Studio.load(id);const el=r.elements[0];return el.spatialInner!=null&&el.spatialOuter!=null&&el.spatialInner<el.spatialOuter;},id);
const clamped=await p.evaluate(async id=>{const r=await Studio.load(id);return {out:r.elements[0].spatialOuter,inn:r.elements[0].spatialInner};},id);
assert.ok(Math.abs(clamped.inn-(clamped.out-.01))<.02,'inner clamps just below outer: '+JSON.stringify(clamped));
console.log('PASS inner ring drag clamps against the outer radius',clamped);
// engine wiring in preview: linear mode => PositionalAudio linear, ref=inner, max=outer
await p.locator('#sel-spatial-mode').selectOption('linear');
await p.waitForFunction(async id=>{const r=await Studio.load(id);return r.elements[0].spatialMode==='linear';},id);
await p.goto('about:blank');await p.goto(base+'/preview.html#'+id);
await p.waitForFunction(()=>{const n=document.querySelector('[data-el-id]');return n&&n.object3D&&n.object3D.children.some(c=>!!c.panner);}); // PositionalAudio keeps type 'Audio'; .panner is the discriminator
const wir=await p.evaluate(()=>{const n=document.querySelector('[data-el-id]');const a=n.object3D.children.find(c=>!!c.panner);return {model:a.panner.distanceModel,ref:a.panner.refDistance,max:a.panner.maxDistance,rolloff:a.panner.rolloffFactor};});
assert.equal(wir.model,'linear','linear mode wires THREE linear distance model');
const exp=await p.evaluate(async id=>{const r=await Studio.load(id);return {inn:r.elements[0].spatialInner,out:r.elements[0].spatialOuter};},id);
assert.ok(Math.abs(wir.ref-exp.inn)<.01&&Math.abs(wir.max-exp.out)<.01,'ref/max distances match the authored envelopes: '+JSON.stringify(wir)+' vs '+JSON.stringify(exp));
console.log('PASS preview wires authored envelopes into positional audio (linear: silent beyond outer)',wir);
// phone-size visual of the rings in the editor
await p.goto(base+'/index.html');await p.waitForFunction(()=>document.querySelectorAll('#exp-select option').length>0);
await p.locator('#exp-select').selectOption(id);await p.waitForFunction(()=>Object.keys(window.__audioEnvelopes||{}).length===1);
await p.setViewportSize({width:390,height:844});await p.waitForTimeout(500);
await p.locator('#element-list li').click();await p.waitForFunction(()=>Object.keys(window.__audioEnvelopes||{}).length===1);
await p.locator('#preview').scrollIntoViewIfNeeded();await p.waitForTimeout(300);
await p.screenshot({path:'/downloads/creator-audio-envelopes-390.png'});
console.log('PASS 390px editor view renders the envelope rings (representative capture)');
}catch(e){console.error(e);process.exitCode=1}finally{await b.close();server.close()}})();
