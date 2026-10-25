// Diagnostics test-mode (gap n:15), grounded in the gap File's reading of Artivive's
// in-editor Preview (course/module sources + official videos): tap layers and SEE which
// sequences play, what stopped, and what triggered each change; edit mode and test mode
// are separated so a tap never drags a layer; returning to editing preserves selection.
const {chromium}=require('playwright-core'),assert=require('assert/strict'),path=require('path'),server=require('../../server/server'),waitFor=require('./waitfor.cjs');
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl']});try{
const p=await b.newPage({viewport:{width:1280,height:900}});
p.on('pageerror',e=>console.log('PAGEERROR:',e.message));
await p.goto(base+'/index.html');await p.waitForSelector('#element-list li');
await p.locator('#btn-new').click();await p.locator('#file-artwork').setInputFiles(path.resolve('studio/library/star.png'));await p.waitForSelector('#sec-elements:not([hidden])');
// two text keys
await p.locator('#btn-text').click();await p.waitForFunction(()=>document.querySelectorAll('#element-list li').length===1);
await p.locator('#btn-text').click();await p.waitForFunction(()=>document.querySelectorAll('#element-list li').length===2);
const id=await p.evaluate(()=>document.querySelector('#exp-select').value);
// wire two action-sequences and tap targets via the model layer (authoring itself is covered by creator-piano-ui)
const seqIds=await p.evaluate(async id=>{
  const r=await Studio.load(id);const [a,b]=r.elements;
  const mk=(name,layer)=>({id:Studio.newId(),name,duration:3,loop:false,reset:false,autoStart:false,actions:[{id:Studio.newId(),type:'scale',layerId:layer.id,start:0,duration:1,ease:'linear',to:{scale:1.5}}]});
  const s1=mk('רצף א',a),s2=mk('רצף ב',b);
  r.actionSequences=[s1,s2];a.onTap='action:'+s1.id;b.onTap='action:'+s2.id;
  a.x=-.25;b.x=.25;
  await Studio.save(r);return [s1.id,s2.id];
},id);
await p.goto('about:blank');await p.goto(base+'/index.html');
await p.waitForFunction(()=>document.querySelectorAll('#exp-select option').length>0);
await p.locator('#exp-select').selectOption(id);await p.waitForFunction(()=>document.querySelectorAll('#element-list li').length===2);
// select element A (the selection that must survive test mode)
await p.locator('#element-list li').nth(0).click();
// enter test mode: strip appears, editing refused
await p.locator('#btn-test-mode').click();
await p.waitForSelector('#diag-strip:not([hidden])');
assert.ok((await p.locator('#diag-strip').innerText()).includes('אבחון בדיקה'),'diagnostics header shown');
// tap key A on the canvas (canvas must be in view; boxes keyed by element id)
await p.locator('#preview').scrollIntoViewIfNeeded();
const elIds=await p.evaluate(async id=>{const r=await Studio.load(id);return r.elements.map(e=>e.id);},id);
const tap=async idx=>{await p.locator('#preview').scrollIntoViewIfNeeded();const bx=await p.evaluate(eid=>window.__testBoxes[eid],elIds[idx]);const bb=await p.locator('#preview').boundingBox();await p.mouse.click(bb.x+bx.cx,bb.y+bx.cy);};
await tap(0);
await p.waitForFunction(sid=>{const r=document.querySelector('#diag-strip .diag-row[data-seq="'+sid+'"]');return r&&r.innerText.includes('מנגן');},seqIds[0]);
assert.ok((await p.locator('#diag-strip').innerText()).includes('הפעלת רצף'),'trigger reason logged for the tap');
console.log('PASS test-mode tap starts the tapped layer\'s sequence and the strip shows it playing with its trigger');
// tap key B: both sequences active at once
await tap(1);
await p.waitForFunction(sid=>{const r=document.querySelector('#diag-strip .diag-row[data-seq="'+sid+'"]');return r&&r.innerText.includes('מנגן');},seqIds[1]);
const both=await p.evaluate(ids=>[...document.querySelectorAll('#diag-strip .diag-row[data-seq]')].map(r=>({id:r.dataset.seq,playing:r.innerText.includes('מנגן')})),seqIds);
assert.ok(both.every(r=>r.playing),'both sequences active simultaneously: '+JSON.stringify(both));
console.log('PASS two taps show two sequences playing at once',both);
// stop A from the strip: B keeps playing
await p.locator('#diag-strip .diag-row[data-seq="'+seqIds[0]+'"] .diag-toggle').click();
await p.waitForFunction(ids=>{const a=document.querySelector('#diag-strip .diag-row[data-seq="'+ids[0]+'"]'),b=document.querySelector('#diag-strip .diag-row[data-seq="'+ids[1]+'"]');return a.innerText.includes('מושהה')&&b.innerText.includes('מנגן');},seqIds);
console.log('PASS stopping one sequence from the strip leaves the other playing');
// test mode refused editing: element A x unchanged after the taps
const xInTest=await p.evaluate(async id=>{const r=await Studio.load(id);return r.elements[0].x;},id);
assert.equal(xInTest,-.25,'taps in test mode never dragged the layer');
// exit test mode: selection preserved, editing restored
await p.locator('#btn-test-mode').click();
await p.waitForSelector('#diag-strip',{state:'hidden'});
const sel=await p.evaluate(()=>{const li=document.querySelector('#element-list li.sel');return {selClass:!!li,panel:document.querySelector('#panel-name').textContent};});
assert.ok(sel.selClass&&sel.panel.length>0,'selection preserved after exiting test mode: '+JSON.stringify(sel));
// editing works again: drag element A by 40px
await p.locator('#preview').scrollIntoViewIfNeeded();const bb2=await p.locator('#preview').boundingBox();
const bx0=await p.evaluate(eid=>window.__testBoxes[eid],elIds[0]);
await p.mouse.move(bb2.x+bx0.cx,bb2.y+bx0.cy);await p.mouse.down();await p.mouse.move(bb2.x+bx0.cx+40,bb2.y+bx0.cy,{steps:3});await p.mouse.up();
await waitFor(p,async id=>{const r=await Studio.load(id);return Math.abs(r.elements[0].x-(-.25))>0.01;},id);
console.log('PASS exiting test mode restores editing (drag moves the layer) with selection preserved',sel);
// representative 390px capture: strip live with one sequence playing
await p.locator('#btn-test-mode').click();await p.waitForSelector('#diag-strip:not([hidden])');
await tap(0);
await p.waitForFunction(sid=>{const r=document.querySelector('#diag-strip .diag-row[data-seq="'+sid+'"]');return r&&r.innerText.includes('מנגן');},seqIds[0]);
await p.setViewportSize({width:390,height:844});await p.waitForTimeout(500);
await p.locator('#diag-strip').scrollIntoViewIfNeeded();await p.waitForTimeout(300);
await p.screenshot({path:'/downloads/creator-diagnostics-390.png'});
console.log('PASS 390px capture of the diagnostics strip (representative)');
}catch(e){console.error(e);process.exitCode=1}finally{await b.close();server.close()}})();
