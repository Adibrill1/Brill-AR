// The duplicate-picture block must FAIL CLOSED: when the comparison cannot run (storage read or fingerprint failure) the
// artwork upload and the import both stop, change nothing, say the check was unavailable (not "duplicate found"), and work on retry.
const {chromium}=require('playwright-core'),assert=require('assert/strict'),path=require('path'),server=require('../../server/server');
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
const p=await (await b.newContext({viewport:{width:1280,height:900}})).newPage();let pageErrors=0;p.on('pageerror',()=>pageErrors++);
await p.goto(base+'/index.html');await p.waitForSelector('#element-list li');
const star=path.resolve('studio/library/star.png'),ring=path.resolve('studio/library/ring.png');
const state=()=>p.evaluate(async()=>({n:(await (window.__all||Studio.all).call(Studio)).length,msg:(document.getElementById('msg')||{}).textContent||'',note:(document.getElementById('safety-note')||{}).textContent||''}));
const hasArt=(id)=>p.evaluate(async id=>!!((await Studio.load(id)).assets||{}).__artwork,id);
const uploadInto=async(file)=>{await p.locator('#file-artwork').setInputFiles(file);await p.waitForTimeout(1200);};
const injectedMsg=/לא הצלחנו לבדוק/;
// A: star accepted
await p.locator('#btn-new').click();await uploadInto(star);await p.waitForSelector('#sec-elements:not([hidden])');
const idA=await p.evaluate(()=>document.querySelector('#exp-select').value);
// B: normal rejection of the same picture, normal success of a different picture
await p.locator('#btn-new').click();await p.waitForTimeout(600);const idB=await p.evaluate(()=>document.querySelector('#exp-select').value);
await uploadInto(star);let s=await state();assert.ok(/זהה או דומה מדי/.test(s.msg)&&!injectedMsg.test(s.msg),'same picture rejected as duplicate: '+s.msg);assert.equal(await hasArt(idB),false,'rejected upload wrote nothing');
console.log('PASS normal rejection (same picture) writes nothing');
// injected read failure: Studio.all throws during the check
const n0=(await state()).n;
await p.evaluate(()=>{window.__all=Studio.all;let first=true;Studio.all=async function(){if(window.__failAll)throw new Error('injected read failure');return window.__all.apply(this,arguments);};window.__failAll=true;});
await uploadInto(ring);s=await state();assert.ok(injectedMsg.test(s.msg),'read failure says the check was unavailable: '+s.msg);assert.ok(!/זהה או דומה מדי/.test(s.msg),'read failure is not reported as a duplicate');
await p.evaluate(()=>{window.__failAll=false;});assert.equal(await hasArt(idB),false,'read failure uploaded nothing (fail closed)');assert.equal((await state()).n,n0,'no record added or lost');
console.log('PASS injected read failure: refused, says check unavailable, nothing written');
// injected fingerprint failure
await p.evaluate(()=>{window.__fd=Studio.fingerprintDistance;Studio.fingerprintDistance=function(){throw new Error('injected fingerprint failure');};});
await uploadInto(ring);s=await state();assert.ok(injectedMsg.test(s.msg),'fingerprint failure says unavailable: '+s.msg);assert.ok(s.msg.includes('יצירה חדשה'),'the message names the project the check stalled on, to help diagnosis: '+s.msg);assert.equal(await hasArt(idB),false,'fingerprint failure uploaded nothing');
await p.evaluate(()=>{Studio.fingerprintDistance=window.__fd;});
console.log('PASS injected fingerprint failure: refused, nothing written');
// retry after the cause is resolved works
await uploadInto(ring);await p.waitForSelector('#sec-elements:not([hidden])');assert.equal(await hasArt(idB),true,'retry after the cause is resolved is accepted');
console.log('PASS retry succeeds once the check can run');
// import path
const json=await p.evaluate(async id=>Studio.exportJSON(await Studio.load(id)),idB);
const imp=async()=>{await p.locator('#file-import').setInputFiles({name:'copy.json',mimeType:'application/json',buffer:Buffer.from(typeof json==='string'?json:JSON.stringify(json))});await p.waitForTimeout(1500);};
await p.evaluate(()=>{window.__failAll=true;});await imp();s=await state();
assert.ok(injectedMsg.test(s.note)||injectedMsg.test(s.msg),'import with failing check says unavailable: '+s.msg+' / '+s.note);assert.ok(!/הייבוא הצליח/.test(s.msg),'import did not report success');
await p.evaluate(()=>{window.__failAll=false;});await imp();s=await state();assert.ok(/זהה או דומה מדי/.test(s.msg)&&!injectedMsg.test(s.msg),'after the cause is resolved the check runs again and reports the real duplicate: '+s.msg);
console.log('PASS import fails closed on a failing check; once it can run the real duplicate rejection returns');
assert.equal(pageErrors,0,'no page errors');await b.close();server.close();})().catch(e=>{console.error(e);process.exit(1)});
