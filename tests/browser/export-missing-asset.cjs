const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');
// A record that references an asset it no longer holds: export must not look like a full backup.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});try{
const ctx=await b.newContext({viewport:{width:390,height:844},acceptDownloads:true});const p=await ctx.newPage();
await p.addInitScript(()=>{window.__dl=[];const c=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download)window.__dl.push(this.download);return c.call(this)}});
await p.goto(base+'/index.html');await p.waitForFunction(()=>document.querySelector('#exp-select').options.length>0);await p.waitForTimeout(1500);
const gone=await p.evaluate(async()=>{const dl=async()=>0;const r=(await Studio.all())[0];const el=r.elements.find(e=>e.assetId&&r.assets[e.assetId]);const id=el.assetId;delete r.assets[id];await Studio.save(r,{noHistory:true});return {id,name:el.name||el.type}});
await p.reload();await p.waitForFunction(()=>document.querySelector('#exp-select').options.length>0);await p.waitForTimeout(2000);
assert.deepEqual(await p.evaluate(async()=>Studio.missingAssets((await Studio.all())[0]).map(m=>m.id)),[gone.id],'missingAssets names the layer whose file is gone');
await p.getByText('בדיקה ושמירה',{exact:true}).last().click().catch(()=>{});await p.waitForTimeout(500);
await p.evaluate(()=>{window.__msgs=[];new MutationObserver(()=>{const t=document.querySelector('#msg').textContent;if(t)window.__msgs.push(t)}).observe(document.querySelector('#msg'),{childList:true,characterData:true,subtree:true})});
for(const [sel,ext] of [['#btn-export','.json'],['#btn-export-zip','.zip']]){
 await Promise.all([p.waitForEvent('download',{timeout:30000}),p.click(sel)]);const names=await p.evaluate(()=>window.__dl);const nm=names[names.length-1];
 assert.ok(nm.includes('חלקי')&&nm.endsWith(ext),'file name is marked partial: '+nm);}
const m=(await p.evaluate(()=>window.__msgs)).join(' | ');console.log(m);
assert.ok(/חלקי, לא גיבוי מלא/.test(m),'user is told the backup is partial');
console.log('PASS export-missing-asset (headless; not a phone)');
}finally{await b.close();server.close();}})().catch(e=>{console.error(e&&e.stack||e);process.exit(1)});
