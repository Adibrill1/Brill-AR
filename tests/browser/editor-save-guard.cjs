// Save-loss hardening: save-state pill truth (saving/saved/failed) + navigation guard
// while a write is in flight or a failure is unresolved. Uses Studio._testHoldSave /
// Studio._testFailSave seams; no real IDB failure is simulated.
const {chromium}=require('playwright-core'),assert=require('assert/strict'),path=require('path'),server=require('../../server/server');
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl']});try{
const p=await b.newPage({viewport:{width:1280,height:900}});let pageErrors=0;p.on('pageerror',()=>pageErrors++);
await p.goto(base+'/index.html');await p.waitForSelector('#element-list li');
await p.locator('#btn-new').click();await p.locator('#file-artwork').setInputFiles(path.resolve('studio/library/star.png'));await p.waitForSelector('#sec-elements:not([hidden])');
await p.locator('#btn-text').click();await p.waitForSelector('#panel:not([hidden])');
const pill=()=>p.locator('#save-state');
const guard=()=>p.evaluate(()=>{const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented;});
// normal edit -> saved state
await p.locator('#num-x').fill('.1');await p.locator('#num-x').dispatchEvent('change');
await p.waitForFunction(()=>document.querySelector('#save-state')?.textContent==='נשמר');
assert.equal(await guard(),false,'no guard when nothing pending');
console.log('PASS pill shows saved after a panel edit; navigation free');
// held save -> saving state + navigation blocked, then released
await p.evaluate(()=>{window.__hr=null;Studio._testHoldSave(new Promise(r=>window.__hr=r));});
await p.locator('#num-x').fill('.2');await p.locator('#num-x').dispatchEvent('change');
await p.waitForFunction(()=>document.querySelector('#save-state')?.textContent==='שומר…');
await p.waitForTimeout(300); // let the queued save reach the hold point
assert.equal(await guard(),true,'navigation blocked while a write is in flight');
await p.evaluate(()=>{window.__hr();Studio._testHoldSave(null);});
await p.waitForFunction(()=>document.querySelector('#save-state')?.textContent==='נשמר');
assert.equal(await guard(),false,'guard released after the write settles');
console.log('PASS in-flight write shows saving state and blocks navigation until it settles');
// failed save -> sticky error + guard, recovered by the next successful save
await p.evaluate(()=>Studio._testFailSave('boom'));
await p.locator('#num-x').fill('.3');await p.locator('#num-x').dispatchEvent('change');
await p.waitForFunction(()=>document.querySelector('#save-state')?.classList.contains('error'));
assert.equal(await guard(),true,'navigation blocked while a failure is unresolved');
await p.evaluate(()=>Studio._testFailSave(null));
await p.locator('#num-x').fill('.4');await p.locator('#num-x').dispatchEvent('change');
await p.waitForFunction(()=>document.querySelector('#save-state')?.textContent==='נשמר');
assert.equal(await guard(),false,'guard released after a later save succeeds');
// the failed edit was kept in memory and persisted by the later save
const x=await p.evaluate(async()=>{const id=document.querySelector('#exp-select').value;const r=await Studio.load(id);return r.elements.find(e=>e.type==='text').x;});
assert.equal(x,.4,'in-memory edits survive a failed save and persist on the next one');
assert.equal(pageErrors,0,'no unhandled rejections from panel writes');
console.log('PASS failed save surfaces sticky error, blocks navigation, next save recovers and persists pending edits');
}finally{await b.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exit(1)});
