// Phone 4th tab "תנועה": the SAME arrange card (sequence/state tabs, action editor, selected-element sheet) on its own tab.
// The layers tab keeps the layer list, the undo/test/snap row and the sheet but not the sequence/action editors.
const {chromium}=require('playwright-core'),assert=require('assert/strict'),server=require('../../server/server');
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
const p=await (await b.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true})).newPage();let pageErrors=0;p.on('pageerror',()=>pageErrors++);
await p.goto(base+'/index.html');await p.waitForFunction(()=>document.querySelector('#exp-select').options.length>0);await p.waitForTimeout(800);
const vis=(s)=>p.evaluate(s=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();return getComputedStyle(e).display!=='none'&&r.height>0&&r.width>0},s);
const labels=await p.evaluate(()=>[...document.querySelectorAll('#shell-tabs button')].map(b=>b.textContent));assert.deepEqual(labels,['יצירה','שכבות','תנועה','בדיקה ושמירה']);
await p.click('#shell-tabs [data-tab=layers]');
assert.equal(await vis('#element-list'),true,'layers: list visible');assert.equal(await vis('#btn-undo'),true,'layers: undo row visible');assert.equal(await vis('#btn-test-mode'),true,'layers: test mode reachable');assert.equal(await vis('#seq-tabs'),false,'layers: sequence tabs not shown');assert.equal(await vis('#action-editor'),false,'layers: action editor not shown');
await (await p.$('#element-list li')).click();await p.waitForTimeout(300);assert.equal(await vis('#panel'),true,'layers: sheet shown for the selected element');
await p.click('#shell-tabs [data-tab=motion]');await p.waitForTimeout(300);
assert.equal(await vis('#seq-tabs'),true,'motion: sequence/state tabs visible');assert.equal(await vis('#action-editor'),true,'motion: action editor visible');assert.equal(await vis('#element-list'),false,'motion: layer list not shown');assert.equal(await vis('#panel'),true,'motion: sheet kept for the selected element');
assert.equal(await p.evaluate(()=>document.getElementById('panel').dataset.sub),'motion','motion tab opens the sheet on its motion group');
await p.getByRole('button',{name:'+ רצף',exact:true}).click();await p.waitForTimeout(400);
console.log('PASS 4th tab shows the sequence/action editors and the sheet; layers tab shows list + undo/test row + sheet');
assert.equal(pageErrors,0);await b.close();server.close();})().catch(e=>{console.error(e);process.exit(1)});
