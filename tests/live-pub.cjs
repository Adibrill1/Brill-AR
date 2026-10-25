const {chromium}=require('playwright-core'),assert=require('node:assert/strict');
// End-to-end proof of the static publication route on the LIVE site with a dummy scene.
(async()=>{const base='https://star-burst-ar-studio.surge.sh',b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});try{
 const c=await b.newPage();await c.goto(base+'/preview.html?pub=qa-demo-scene');
 await c.waitForSelector('[data-el-id=one]',{state:'attached',timeout:20000});
 assert.equal(await c.evaluate(async()=>(await Studio.all()).some(r=>r.name==='דמו לפרסום')),false,'viewer must not persist the published scene');
 assert.equal(await c.evaluate(()=>document.getElementById('topbar-edit-toggle')==null),true,'no edit toggle for pub viewers');
 const pl=await b.newPage();await pl.goto(base+'/play.html?pub=qa-demo-scene');
 assert.equal(await pl.evaluate(()=>{const a=document.getElementById('camfree');return !a.hidden&&a.getAttribute('href');}),'preview.html?pub=qa-demo-scene','camera-free link on the AR page');
 assert.equal(await pl.evaluate(()=>document.getElementById('backlink').hidden),true,'editor backlink hidden for pub viewers');
 const m=await b.newPage();const resp=await m.goto(base+'/preview.html?pub=missing-scene');await m.waitForFunction(()=>document.getElementById('err').textContent.includes('לא נמצא'),undefined,{timeout:20000});
 console.log('PASS live pub route: scene builds camera-free, no viewer-side persistence, camera-free link on AR page, honest 404');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1)});
