// Save-loss hardening: per-record save-state truth (saving/saved/failed), navigation
// guard while any record has an in-flight write or unresolved failure, failure-toast
// reconciliation on later success, and a working retry control on the error pill.
// Uses Studio._testHoldSave / Studio._testFailSave seams; no real IDB failure is simulated.
const {chromium}=require('playwright-core'),assert=require('assert/strict'),path=require('path'),server=require('../../server/server');
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl']});try{
const p=await b.newPage({viewport:{width:1280,height:900}});let pageErrors=0;p.on('pageerror',()=>pageErrors++);
await p.goto(base+'/index.html');await p.waitForSelector('#element-list li');
await p.locator('#btn-new').click();await p.locator('#file-artwork').setInputFiles(path.resolve('studio/library/star.png'));await p.waitForSelector('#sec-elements:not([hidden])');
await p.locator('#btn-text').click();await p.waitForSelector('#panel:not([hidden])');
const pillText=()=>p.evaluate(()=>document.querySelector('#save-state')?.textContent);
const pillClass=(c)=>p.evaluate(c=>document.querySelector('#save-state')?.classList.contains(c),c);
const msgText=()=>p.evaluate(()=>document.querySelector('#msg')?.textContent);
const guard=()=>p.evaluate(()=>{const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented;});
const edit=async(v)=>{await p.locator('#num-x').fill(v);await p.locator('#num-x').dispatchEvent('change');await p.locator('#num-x').evaluate(e=>e.blur());}; // blur: the native change re-fires upd (a real retry path), so keep failure seams active through it
// normal edit -> saved state, navigation free
await edit('.1');
await p.waitForFunction(()=>document.querySelector('#save-state')?.textContent==='נשמר');
assert.equal(await guard(),false,'no guard when nothing pending');
console.log('PASS pill shows saved after a panel edit; navigation free');
// held save -> saving state + navigation blocked, then released
await p.evaluate(()=>{window.__hr=null;Studio._testHoldSave(new Promise(r=>window.__hr=r));});
await edit('.2');
await p.waitForFunction(()=>document.querySelector('#save-state')?.textContent==='שומר…');
await p.waitForTimeout(300);
assert.equal(await guard(),true,'navigation blocked while a write is in flight');
await p.evaluate(()=>{window.__hr();Studio._testHoldSave(null);});
await p.waitForFunction(()=>document.querySelector('#save-state')?.textContent==='נשמר');
assert.equal(await guard(),false,'guard released after the write settles');
console.log('PASS in-flight write shows saving state and blocks navigation until it settles');
// failed save -> sticky error + toast; retry via the error pill; toast reconciles on success
const idA=await p.evaluate(()=>document.querySelector('#exp-select').value);
await p.evaluate(()=>Studio._testFailSave('boom'));
await edit('.3');
await p.waitForFunction(()=>document.querySelector('#save-state')?.classList.contains('error'));
assert.ok((await msgText()).includes('השמירה נכשלה'),'failure toast visible');
assert.equal(await guard(),true,'navigation blocked while a failure is unresolved');
await p.evaluate(()=>Studio._testFailSave(null));
await p.locator('#save-state').click(); // the retry control
await p.waitForFunction(()=>document.querySelector('#save-state')?.textContent==='נשמר');
assert.equal(await msgText(),'','failure toast cleared once the retry succeeds');
assert.equal(await guard(),false,'guard released after retry success');
const xA=await p.evaluate(async id=>{const r=await Studio.load(id);return r.elements.find(e=>e.type==='text').x;},idA);
assert.equal(xA,.3,'retried save persists the failed edit without a new edit');
console.log('PASS failure toast reconciles on success; error pill is a working retry control');
// per-record isolation: A fails, B saves fine - B's success must NOT clear A's sticky failure
await p.evaluate(()=>Studio._testFailSave('boom'));
await edit('.5');
await p.waitForFunction(()=>document.querySelector('#save-state')?.classList.contains('error'));
await p.evaluate(()=>Studio._testFailSave(null));
// switching away with an unresolved failure asks first; declining stays put
p.once('dialog',d=>{assert.ok(d.message().includes('השמירה שלהם נכשלה'),'switch warning shown');d.dismiss();});
await p.locator('#btn-new').click();
await p.waitForTimeout(400);
assert.equal(await p.evaluate(()=>document.querySelector('#exp-select').value),idA,'declining the warning keeps the current experience');
p.once('dialog',d=>d.accept());
await p.locator('#btn-new').click();await p.locator('#file-artwork').setInputFiles(path.resolve('studio/library/star.png'));await p.waitForSelector('#sec-elements:not([hidden])');
await p.waitForFunction(()=>document.querySelector('#save-state')?.textContent==='נשמר');
const idB=await p.evaluate(()=>document.querySelector('#exp-select').value);
assert.notEqual(idB,idA,'second experience is a different record');
assert.equal(await guard(),true,"record A's unresolved failure still blocks navigation after B saved fine");
// switching back to A is free (B is clean); A shows its sticky error again
await p.locator('#exp-select').selectOption(idA);
await p.waitForFunction(()=>document.querySelector('#save-state')?.classList.contains('error'),null,{timeout:10000});
// leaving A with the failure asks; declining stays and reverts the selector
p.once('dialog',d=>d.dismiss());
await p.locator('#exp-select').selectOption(idB);
await p.waitForTimeout(400);
assert.equal(await p.evaluate(()=>document.querySelector('#exp-select').value),idA,'declined switch keeps the selector on the failing record');
p.once('dialog',d=>d.accept());
await p.locator('#exp-select').selectOption(idB);
await p.waitForFunction(()=>document.querySelector('#save-state')?.textContent==='נשמר',null,{timeout:10000});
// back to A (leaving clean B is free) and retry
await p.locator('#exp-select').selectOption(idA);
await p.waitForFunction(()=>document.querySelector('#save-state')?.classList.contains('error'),null,{timeout:10000});
await p.locator('#save-state').click();
await p.waitForFunction(()=>document.querySelector('#save-state')?.textContent==='נשמר');
assert.equal(await guard(),false,'guard free once A retried successfully');
const xA2=await p.evaluate(async id=>{const r=await Studio.load(id);return r.elements.find(e=>e.type==='text').x;},idA);
assert.equal(xA2,.3,"consented switch dropped the failed edit; retry persists the stored state");
assert.equal(pageErrors,0,'no unhandled rejections from panel writes');
console.log('PASS save state is per-record; record switch with unsaved failure asks first and honors the answer');
}finally{await b.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exit(1)});
