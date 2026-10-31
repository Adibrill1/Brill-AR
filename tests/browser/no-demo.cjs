const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');
// The real site does not create a sample creation. ?nodemo gives the real-site behavior on the local test server:
// an empty gallery opens one blank "יצירה חדשה" (saved, so it is listed), a reload does not add another, and
// deleting the last creation leaves one blank creation, never the sample. ?demo still seeds the sample.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});try{
const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const p=await ctx.newPage();
const pageErrors=[];p.on('pageerror',e=>pageErrors.push(String(e)));p.on('dialog',d=>d.accept());
const state=()=>p.evaluate(async()=>{const all=await Studio.all();return {n:all.length,names:all.map(r=>r.name),els:all.map(r=>(r.elements||[]).length),assets:all.map(r=>Object.keys(r.assets||{}).length),seeded:localStorage.getItem('ar-studio-demo-seeded'),options:document.querySelector('#exp-select').options.length}});
await p.goto(base+'/index.html?nodemo');await p.waitForFunction(()=>document.querySelector('#exp-select').options.length>0);await p.waitForTimeout(800);
let s=await state();assert.deepEqual([s.n,s.names[0],s.els[0],s.assets[0],s.seeded,s.options],[1,'יצירה חדשה',0,0,null,1],'empty gallery opens one blank creation, no sample: '+JSON.stringify(s));
await p.reload();await p.waitForFunction(()=>document.querySelector('#exp-select').options.length>0);await p.waitForTimeout(800);
s=await state();assert.equal(s.n,1,'reload does not add another blank creation');
await p.evaluate(()=>document.querySelector('#btn-del-exp').click());await p.waitForTimeout(1200);
s=await state();assert.deepEqual([s.n,s.names[0],s.els[0],s.seeded],[1,'יצירה חדשה',0,null],'deleting the last creation leaves a blank one, not the sample: '+JSON.stringify(s));
const p2=await ctx.newPage();await p2.goto(base+'/index.html?demo');await p2.waitForFunction(()=>document.querySelector('#exp-select').options.length>1,undefined,{timeout:20000});
assert.ok(await p2.evaluate(async()=>(await Studio.all()).some(r=>/Star Burst/.test(r.name))),'?demo still seeds the sample');
assert.deepEqual(pageErrors,[],'no page errors');
console.log('PASS no-demo (headless phone emulation)');
}finally{await b.close();server.close();}})().catch(e=>{console.error(e&&e.stack||e);process.exit(1)});
