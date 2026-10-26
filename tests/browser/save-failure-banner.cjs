const {chromium}=require('playwright-core'),assert=require('node:assert/strict'),crypto=require('crypto');const server=require('../../server/server');
// Save failures on a phone-width shell: transient write errors are retried automatically (as is, then with assets copied
// into memory); a persistent failure shows a banner with the reason and the browser's code on EVERY tab, with a 44px retry
// and a backup export; success after a failure is confirmed with the time; a full disk is not retried; an unreadable file is
// named; returning to the page retries; a record missing from storage asks for a backup, never to switch projects.
// Simulated with Studio._testFailPut and a Blob read seam: no real iPhone storage failure is reproduced here.
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});try{
for(const vp of [{width:390,height:844,name:'portrait'},{width:844,height:390,name:'landscape'}]){
const ctx=await b.newContext({viewport:{width:vp.width,height:vp.height},isMobile:true,hasTouch:true,acceptDownloads:true});const p=await ctx.newPage();
let pageErrors=[];p.on('pageerror',e=>pageErrors.push(String(e)));
await p.addInitScript(()=>{const ab=Blob.prototype.arrayBuffer;Blob.prototype.arrayBuffer=function(){if(sessionStorage.getItem('bad')&&this.size===Number(sessionStorage.getItem('bad')))return Promise.reject(new DOMException('x','NotReadableError'));return ab.call(this)}});
await p.goto(base+'/index.html');await p.waitForFunction(()=>document.querySelector('#exp-select').options.length>0);await p.waitForTimeout(1500);
assert.ok(await p.evaluate(()=>document.body.classList.contains('shell')),'phone shell active');
await p.locator('#shell-tabs button[data-tab="layers"]').click();
await p.click('#element-list li');await p.waitForTimeout(300);
let n=0;const edit=async()=>{n++;await p.locator('#shell-tabs button[data-tab="layers"]').click();return p.evaluate(k=>{const r=document.querySelector('#panel input[type=range]');const v=Number(r.min)+(Number(r.max)-Number(r.min))*(0.2+0.07*k);r.value=String(v);r.dispatchEvent(new Event('input',{bubbles:true}));r.dispatchEvent(new Event('change',{bubbles:true}));return Number(r.value)},n)};
const st=()=>p.evaluate(()=>Studio.saveState(document.querySelector('#exp-select').value));
const pill=()=>p.evaluate(()=>document.querySelector('#save-state').textContent);
const waitPill=t=>p.waitForFunction(t=>document.querySelector('#save-state').textContent===t,t,{timeout:15000});
const stored=()=>p.evaluate(async()=>{const r=(await Studio.all()).find(x=>x.id===document.querySelector('#exp-select').value);return r?JSON.stringify(r.elements):null});
const banner=()=>p.evaluate(()=>{const b=document.querySelector('#save-banner');if(!b||b.hidden)return {shown:false};const r=b.getBoundingClientRect();const top=document.elementFromPoint(r.left+r.width/2,r.top+Math.min(r.height/2,18));const q=s=>{const e=b.querySelector(s);if(!e||e.hidden)return null;const x=e.getBoundingClientRect();return [Math.round(x.width),Math.round(x.height)]};
  return {shown:r.width>0&&r.height>0,cls:b.className,text:b.querySelector('.sb-text').textContent,meta:b.querySelector('.sb-meta').textContent,inView:r.top>=-1&&r.bottom<=innerHeight+1&&r.left>=-1&&r.right<=innerWidth+1,onTop:b.contains(top),retry:q('.sb-retry'),exp:q('.sb-export'),close:q('.sb-close'),hOverflow:document.documentElement.scrollWidth-document.documentElement.clientWidth}});
const assetHashes=()=>p.evaluate(async()=>{const r=(await Studio.all()).find(x=>x.id===document.querySelector('#exp-select').value);const o={};for(const [k,v] of Object.entries(r.assets)){const u=new Uint8Array(await v.arrayBuffer());o[k]=Array.from(u.slice(0,64)).join(',')+':'+u.length}return o});
const hashes0=await assetHashes();assert.ok(Object.keys(hashes0).length>=4,'demo project has several assets');

// 1. one transient failure -> automatic retry, saved, no error banner
await p.evaluate(()=>Studio._testFailPut({n:1,name:'UnknownError'}));
let v=await edit();await waitPill('נשמר');
let s=await st();assert.equal(s.lastError,null);assert.equal(s.lastAttempts,2,'second write succeeded');assert.ok((await stored()).includes(String(v).slice(0,5)),'edit stored');
assert.equal((await banner()).shown,false,'no banner when the automatic retry succeeded');
// 2. two failures -> third write with in-memory asset copies; asset bytes unchanged
await p.evaluate(()=>Studio._testFailPut({n:2,name:'UnknownError'}));
v=await edit();await waitPill('נשמר');s=await st();assert.equal(s.lastAttempts,3,'in-memory copy write succeeded');
assert.deepEqual(await assetHashes(),hashes0,'asset bytes identical after the in-memory copy write');
// 3. persistent failure -> banner with reason + code on every tab, retry works, success confirmed with time
await p.evaluate(()=>Studio._testFailPut({n:99,name:'UnknownError',message:'Error preparing Blob/File data'}));
const storedBefore=await stored();v=await edit();
await p.waitForFunction(()=>document.querySelector('#save-state').classList.contains('error'),undefined,{timeout:15000});
assert.equal(await stored(),storedBefore,'nothing written while failing');
for(const tab of ['create','layers','motion','check']){await p.locator('#shell-tabs button[data-tab="'+tab+'"]').click();await p.waitForTimeout(250);const bn=await banner();
  assert.ok(bn.shown&&bn.inView&&bn.onTop,vp.name+' banner visible and not covered on tab '+tab+' '+JSON.stringify(bn));
  assert.ok(bn.retry&&bn.retry[0]>=44&&bn.retry[1]>=44&&bn.exp&&bn.exp[1]>=44,'44px retry and export on '+tab);assert.equal(bn.hOverflow,0,'no horizontal scroll on '+tab);}
let bn=await banner();assert.match(bn.text,/השמירה נכשלה: הדפדפן דחה את הכתיבה בלי לפרט סיבה/);assert.match(bn.meta,/UnknownError: Error preparing Blob\/File data/);assert.match(bn.meta,/שמירה מוצלחת אחרונה בדף הזה: \d\d:\d\d/);
assert.ok(!/רענ(ני|נו)\b(?! )|פתחי יצירה אחרת/.test(bn.text.replace('אל תרענני','')),'never suggests reloading or switching');
await p.evaluate(()=>Studio._testFailPut(null));await p.click('#save-banner .sb-retry');await waitPill('נשמר');
bn=await banner();assert.equal(bn.cls,'ok');assert.match(bn.text,/השמירה הצליחה ב־\d\d:\d\d/);assert.ok(bn.close&&bn.close[1]>=44);
assert.notEqual(await stored(),storedBefore,'the failed edit was saved by the retry');
await p.click('#save-banner .sb-close');assert.equal((await banner()).shown,false,'closed');
// 4. full disk -> final, no automatic retry, named reason
await p.evaluate(()=>Studio._testFailPut({n:1,name:'QuotaExceededError',message:'quota'}));await edit();
await p.waitForFunction(()=>document.querySelector('#save-state').classList.contains('error'),undefined,{timeout:15000});
s=await st();assert.equal(s.lastErrorName,'QuotaExceededError');assert.match((await banner()).text,/אין מספיק מקום באחסון/);
await p.evaluate(()=>Studio._testFailPut(null));await p.click('#save-banner .sb-retry');await waitPill('נשמר');
// 5. unreadable file while writes fail -> the file is named
const big=Object.entries(hashes0).map(([k,h])=>[k,Number(h.split(':').pop())]).sort((a,b)=>b[1]-a[1])[0];
await p.evaluate(sz=>{sessionStorage.setItem('bad',String(sz));Studio._testFailPut({n:2,name:'UnknownError'})},big[1]);await edit();
await p.waitForFunction(()=>document.querySelector('#save-state').classList.contains('error'),undefined,{timeout:15000});
s=await st();assert.equal(s.lastErrorAsset,big[0],'unreadable asset id recorded');assert.match((await banner()).text,/הקובץ של .+ לא נקרא מהמכשיר/);
await p.evaluate(()=>{sessionStorage.removeItem('bad');Studio._testFailPut(null)});
// 6. coming back to the page retries automatically
await p.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await waitPill('נשמר');
// 7. record missing from storage -> backup first, no retry button, no "open another project"
await p.evaluate(async()=>{const id=document.querySelector('#exp-select').value;const db=await new Promise((res,rej)=>{const r=indexedDB.open('ar-studio',1);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});await new Promise((res,rej)=>{const tx=db.transaction('experiences','readwrite');tx.objectStore('experiences').delete(id);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)});db.close();
  window.__msgs=[];new MutationObserver(()=>{const t=document.querySelector('#msg').textContent;if(t)window.__msgs.push(t)}).observe(document.querySelector('#msg'),{childList:true,characterData:true,subtree:true});});
await edit();await p.waitForFunction(()=>{const b=document.querySelector('#save-banner');return !b.hidden&&/לא נמצאת יותר באחסון/.test(b.textContent)},undefined,{timeout:15000});
bn=await banner();assert.equal(bn.retry,null,'no retry for a record that is gone');assert.ok(bn.exp,'backup export offered');
const msgs=(await p.evaluate(()=>window.__msgs)).join(' | ');assert.ok(!/פתחי יצירה אחרת/.test(msgs+bn.text),'never suggests opening another project: '+msgs);
const [d]=await Promise.all([p.waitForEvent('download',{timeout:30000}),p.click('#save-banner .sb-export')]);assert.match(d.suggestedFilename(),/\.zip$/,'backup ZIP from the banner');
assert.deepEqual(pageErrors,[],'no page errors');
console.log('PASS save-failure-banner '+vp.name);
await ctx.close();}
console.log('PASS save-failure-banner (headless phone emulation; not an iPhone)');
}finally{await b.close();server.close();}})().catch(e=>{console.error(e&&e.stack||e);process.exit(1)});
