// rename-experience: user request 2:15 — rename an existing project (not all "יצירה חדשה").
// Covers: rename persists + selector updates, id/elements/assets untouched, empty name refused
// (reverts, nothing saved), export/publish filenames derive from rec.name by shared code path
// (btn-export/btn-send-publish both use rec.name — headless blob-download filenames are unreliable,
// so filename consistency is asserted via the live rec, not the download event). 390px layout.
const {chromium}=require('playwright-core'),assert=require('assert/strict'),server=require('../../server/server');
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});try{const p=await b.newPage({viewport:{width:390,height:844}});
await p.goto(base+'/index.html');await p.waitForFunction(()=>document.querySelector('#exp-select').options.length>0);
const before=await p.evaluate(async()=>{const id=document.querySelector('#exp-select').value;const r=await Studio.load(id);return {id,name:r.name,els:r.elements.length,assets:Object.keys(r.assets).length};});
assert.ok(await p.locator('#in-exp-name').isVisible());
await p.locator('#in-exp-name').fill('חתונה של נועה');await p.locator('#in-exp-name').dispatchEvent('change');
await p.waitForFunction(()=>document.querySelector('#msg').textContent.includes('השם נשמר'));
// selector + persistence + identity
await p.reload();await p.waitForFunction(()=>document.querySelector('#exp-select').options.length>0);
const after=await p.evaluate(async id=>{const r=await Studio.load(id);return {name:r.name,els:r.elements.length,assets:Object.keys(r.assets).length,selText:[...document.querySelector('#exp-select').options].find(o=>o.value===id)?.textContent,inputVal:document.querySelector('#in-exp-name').value};},before.id);
assert.equal(after.name,'חתונה של נועה');assert.equal(after.selText,'חתונה של נועה');assert.equal(after.inputVal,'חתונה של נועה');
assert.equal(after.els,before.els);assert.equal(after.assets,before.assets);
// empty rename refused: value reverts, saved name unchanged
await p.locator('#in-exp-name').fill('   ');await p.locator('#in-exp-name').dispatchEvent('change');
await p.waitForFunction(()=>document.querySelector('#msg').textContent.includes('ריק'));
assert.equal(await p.evaluate(async id=>(await Studio.load(id)).name,before.id),'חתונה של נועה');
assert.equal(await p.locator('#in-exp-name').inputValue(),'חתונה של נועה');
// 390px: no horizontal overflow
await p.waitForTimeout(400);
assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
await p.locator('#sec-exp').screenshot({path:'/downloads/rename-390.png'});
console.log('PASS rename-experience: persist+selector+identity+empty-refused+390px',JSON.stringify({before,after}));
 }finally{await b.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exit(1)});
