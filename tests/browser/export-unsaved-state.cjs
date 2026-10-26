const {chromium}=require('playwright-core'),assert=require('node:assert/strict'),fs=require('fs');const server=require('../../server/server');
// With a failed save, the existing local export (download, no upload) must still contain the UNSAVED in-memory edit.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});try{
const ctx=await b.newContext({viewport:{width:390,height:844},acceptDownloads:true});const p=await ctx.newPage();
let uploads=0;p.on('request',r=>{if(r.method()==='POST'||r.method()==='PUT')uploads++});
await p.goto(base+'/index.html');await p.waitForFunction(()=>document.querySelector('#exp-select').options.length>0);await p.waitForTimeout(1500);
// make an edit through the real UI: select the first layer, move it with the position panel is UI-specific, so edit via the live record the 3D/2D handlers share
if(!process.env.NOFAIL)await p.evaluate(()=>{Studio._testFailSave('disk full')});
await p.click('#element-list li');await p.waitForTimeout(300);
const before=await p.evaluate(async()=>(await Studio.all())[0].elements.map(e=>e.x));
// nudge using the first range input in the panel for position-like change
const changed=await p.evaluate(()=>{const r=document.querySelector('#panel input[type=range]');if(!r)return null;r.value=String(Number(r.min)+(Number(r.max)-Number(r.min))*0.9);r.dispatchEvent(new Event('input',{bubbles:true}));r.dispatchEvent(new Event('change',{bubbles:true}));return r.value});
await p.waitForTimeout(800);
const st=await p.evaluate(()=>{const e=document.querySelector('#save-state');return e?e.textContent:''});
console.log('slider',changed,'save-state:',st);
const stored=await p.evaluate(async()=>JSON.stringify((await Studio.all())[0].elements));
await p.getByText('בדיקה ושמירה',{exact:true}).last().click().catch(()=>{});await p.waitForTimeout(500);const dl=async sel=>{const [d]=await Promise.all([p.waitForEvent('download',{timeout:30000}),p.click(sel)]);const f='/tmp/exp-'+Date.now()+d.suggestedFilename().slice(-5);await d.saveAs(f);return f};
p.on('console',m=>console.log('console:',m.text().slice(0,200)));p.on('pageerror',e=>console.log('pageerror',String(e).slice(0,200)));
const jf=await dl('#btn-export').catch(async e=>{console.log('NO DOWNLOAD; msg=',await p.evaluate(()=>document.querySelector('#msg').textContent));throw e});const j=JSON.parse(fs.readFileSync(jf,'utf8'));
assert.notEqual(JSON.stringify(j.elements.map(e=>({...e,id:undefined}))).length,0);
const storedEls=JSON.parse(stored);
const diff=j.elements.some((e,i)=>JSON.stringify(e)!==JSON.stringify(storedEls[i]));
console.log('export differs from stored (contains unsaved edit):',diff,'assets in export:',Object.keys(j.assets||{}).length);
assert.ok(diff,'export reflects the unsaved in-memory edit, not the stored copy');
assert.ok(Object.keys(j.assets||{}).length>=2,'export carries the asset bytes');
const zf=await dl('#btn-export-zip');assert.ok(fs.statSync(zf).size>1000,'zip export produced');
assert.equal(uploads,0,'export makes no upload requests');
console.log('PASS export-unsaved-state (headless; not a phone)');
}finally{await b.close();server.close();}})().catch(e=>{console.error(e&&e.stack||e);process.exit(1)});
