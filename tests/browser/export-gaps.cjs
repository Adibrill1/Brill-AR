const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');
// Follow-through on export completeness (phone width): a layer pointing at a file the record no longer holds is listed by the
// file check, blocks "send to publish" and "publish" (nothing shared, downloaded or uploaded), and the export/send/publish
// notice stays on screen on every tab (past the old 30s timer) until closed, a full export succeeds, or the project changes.
// A non-read export failure is not described as a read failure. Headless phone emulation; not an iPhone.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});try{
const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,acceptDownloads:true});const p=await ctx.newPage();
const pageErrors=[];p.on('pageerror',e=>pageErrors.push(String(e)));
let posts=0,downloads=0;p.on('request',r=>{if(r.method()==='POST'&&r.url().includes('/api/'))posts++});p.on('download',()=>downloads++);
await p.addInitScript(()=>{window.__dl=[];const __c=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download)window.__dl.push(this.download);return __c.call(this)};window.__shared=[];Object.defineProperty(navigator,'canShare',{value:()=>true,configurable:true});Object.defineProperty(navigator,'share',{value:async d=>{window.__shared.push(d.files[0].name)},configurable:true});});
await p.goto(base+'/index.html');await p.waitForFunction(()=>document.querySelector('#exp-select').options.length>0);await p.waitForTimeout(1500);
const gone=await p.evaluate(async()=>{const r=(await Studio.all())[0];const el=r.elements.find(e=>e.assetId&&r.assets[e.assetId]&&!r.elements.some(o=>o!==e&&o.assetId===e.assetId));delete r.assets[el.assetId];await Studio.save(r,{noHistory:true});return {id:el.assetId,name:el.name||el.type}});
await p.reload();await p.waitForFunction(()=>document.querySelector('#exp-select').options.length>0);await p.waitForTimeout(2000);
const note=()=>p.evaluate(()=>{const n=document.querySelector('#export-banner');if(!n||n.hidden)return {shown:false};const r=n.getBoundingClientRect();const top=document.elementFromPoint(r.left+r.width/2,r.top+Math.min(r.height/2,16));const c=n.querySelector('.sb-close').getBoundingClientRect();
  return {shown:r.width>0,text:n.querySelector('.sb-text').textContent,inView:r.top>=-1&&r.bottom<=innerHeight+1&&r.left>=-1&&r.right<=innerWidth+1,onTop:n.contains(top),close:[Math.round(c.width),Math.round(c.height)],hOverflow:document.documentElement.scrollWidth-document.documentElement.clientWidth}});
const tab=t=>p.locator('#shell-tabs button[data-tab="'+t+'"]').click();
// 1. file check lists the layer whose file is not stored at all
await tab('create');await p.locator('#btn-file-health').click();await p.waitForFunction(()=>!/בודק/.test(document.querySelector('#file-health').textContent),undefined,{timeout:30000});
const fh=await p.evaluate(()=>document.querySelector('#file-health').textContent);
assert.ok(fh.includes('✗ '+gone.name)&&fh.includes('השכבה מפנה לקובץ שלא נמצא בשמירה'),'file check names the layer with a missing file: '+fh.slice(0,300));
assert.ok(!/^כל \d+ הקבצים נקראים/.test(fh),'file check does not report all files fine');
// 2. send to publish: refused, nothing shared or downloaded, persistent notice on every tab
await tab('check');await p.locator('#btn-send-publish').click();await p.waitForFunction(()=>{const n=document.querySelector('#export-banner');return n&&!n.hidden},undefined,{timeout:15000});
let n=await note();assert.match(n.text,/שום דבר לא נשלח: חסרים הקבצים של /);assert.ok(n.text.includes(gone.name),'names the layer');
assert.deepEqual(await p.evaluate(()=>window.__shared),[],'nothing shared');assert.equal(downloads,0,'nothing downloaded');
for(const t of ['create','layers','motion','check']){await tab(t);await p.waitForTimeout(250);const x=await note();assert.ok(x.shown&&x.inView&&x.onTop&&x.close[0]>=44&&x.close[1]>=44&&x.hOverflow===0,'notice visible, uncovered, 44px close on '+t+' '+JSON.stringify(x));}
// 3. publish to a server: refused before any upload
await tab('check');await p.evaluate(b=>{const s=document.querySelector('#in-server');s.value=b;const t=document.querySelector('#in-token');t.value='x';},base);
await p.evaluate(()=>document.querySelector('#btn-publish').click());await p.waitForFunction(()=>/לא פורסם/.test(document.querySelector('#export-banner').textContent),undefined,{timeout:15000});
assert.ok((await note()).text.includes(gone.name));assert.equal(posts,0,'no upload request');
// 4. export: partial file + notice that outlives the old 30s timer and other toasts
// Headless Chrome on Linux names blob downloads 'download'; assert the name the app sets on the link instead.
await Promise.all([p.waitForEvent('download',{timeout:30000}),p.locator('#btn-export-zip').click()]);{const nm=await p.evaluate(()=>window.__dl[window.__dl.length-1]||'');assert.ok(nm.includes('חלקי')&&nm.endsWith('.zip'),'file marked partial: '+nm);}
n=await note();assert.match(n.text,/חלקי, לא גיבוי מלא/);
await p.evaluate(()=>{document.querySelector('#msg').textContent='other toast'});await p.waitForTimeout(32000);
n=await note();assert.ok(n.shown&&/חלקי, לא גיבוי מלא/.test(n.text),'partial notice still shown after 32s');
await p.click('#export-banner .sb-close');assert.equal((await note()).shown,false,'closed by the user');
// 5. a non-read export failure says so with its code, not "a file was not read"
await p.evaluate(()=>{window.__zip=Studio.exportZIP;Studio.exportZIP=async()=>{throw new Error('zip support not loaded')}});
await p.locator('#btn-export-zip').click();await p.waitForFunction(()=>{const n=document.querySelector('#export-banner');return n&&!n.hidden},undefined,{timeout:15000});
n=await note();assert.match(n.text,/הייצוא לא הושלם, ולכן לא נוצר קובץ גיבוי/);assert.match(n.text,/קוד: zip support not loaded/);assert.ok(!/קובץ אחד לא נקרא/.test(n.text),'not misreported as a read failure');
// 6. switching project clears a notice that belonged to the previous one; a full export clears an export failure
await p.evaluate(()=>{Studio.exportZIP=window.__zip});
await p.evaluate(()=>document.querySelector('#btn-new').click());await p.waitForTimeout(1500);
assert.equal((await note()).shown,false,'notice of the previous project cleared on switch');
await p.evaluate(()=>{Studio.exportZIP=async()=>{throw new Error('zip support not loaded')}});await p.evaluate(()=>document.querySelector('#btn-export-zip').click());
await p.waitForFunction(()=>{const n=document.querySelector('#export-banner');return n&&!n.hidden},undefined,{timeout:15000});
await p.evaluate(()=>{Studio.exportZIP=window.__zip});
await Promise.all([p.waitForEvent('download',{timeout:30000}),p.evaluate(()=>document.querySelector('#btn-export-zip').click())]);await p.waitForTimeout(300);
assert.equal((await note()).shown,false,'a full export clears the earlier export failure');
assert.deepEqual(pageErrors,[],'no page errors');
console.log('PASS export-gaps (headless phone emulation; not an iPhone)');
}finally{await b.close();server.close();}})().catch(e=>{console.error(e&&e.stack||e);process.exit(1)});
