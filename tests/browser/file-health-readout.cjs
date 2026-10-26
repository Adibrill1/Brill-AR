const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');
// Read-only file check: names each stored asset and which step works; changes nothing in storage.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});try{
 const ctx=await b.newContext({viewport:{width:390,height:844}});const p=await ctx.newPage();
 await p.addInitScript(()=>{const o=FileReader.prototype.readAsDataURL;FileReader.prototype.readAsDataURL=function(blob){if(sessionStorage.getItem('rf')==='1'){const r=this;setTimeout(()=>{Object.defineProperty(r,'error',{value:{name:'NotReadableError'}});r.onerror&&r.onerror(new Event('error'))},0);return}return o.call(this,blob)}});
 await p.goto(base+'/index.html');await p.waitForFunction(()=>document.querySelector('#exp-select').options.length>0);await p.waitForTimeout(1500);
 const snap=()=>p.evaluate(async()=>{const r=(await Studio.all())[0];const out={id:r.id,upd:r.updatedAt||r.updated||null,n:Object.keys(r.assets).length,h:{}};for(const [k,v] of Object.entries(r.assets)){const ab=new Uint8Array(await v.arrayBuffer());let h=0;for(let i=0;i<ab.length;i++)h=(h*31+ab[i])>>>0;out.h[k]=[ab.length,h]}return out});
 const before=await snap();assert.ok(before.n>=2,'project has several stored assets');
 // 1. healthy
 await p.click('#btn-file-health');await p.waitForFunction(()=>/הקבצים נקראים|בעייתיים/.test(document.querySelector('#file-health').textContent),null,{timeout:30000});
 let t=await p.evaluate(()=>document.querySelector('#file-health').textContent);assert.ok(/כל \d+ הקבצים נקראים/.test(t),'healthy project reports all files readable: '+t);assert.ok(/תמונת היצירה/.test(t),'names the artwork');assert.ok(/קוראת בלבד/.test(t),'states it is read-only');
 // 2. FileReader fails for everything: reported per asset with the stage that failed
 await p.evaluate(()=>sessionStorage.setItem('rf','1'));await p.click('#btn-file-health');await p.waitForFunction(()=>/בעייתיים/.test(document.querySelector('#file-health').textContent),null,{timeout:30000});
 t=await p.evaluate(()=>document.querySelector('#file-health').textContent);assert.ok(/קריאה ✓ מלאה ✓ המרה ✗/.test(t)&&/\(3 ניסיונות\)/.test(t),'reader failure is shown as the failing stage with 3 tries, bytes still readable: '+t);
 await p.evaluate(()=>sessionStorage.removeItem('rf'));
 // 3. missing asset entry
 const miss=await p.evaluate(async()=>{const rows=await Studio.fileHealth({elements:[{assetId:'gone',name:'כוכב'}],assets:{gone:null,fake:{}}});return rows.map(r=>[r.name,!!r.missing])});assert.ok(miss.length===2&&miss.every(r=>r[1]),'missing assets are reported as missing: '+JSON.stringify(miss));
 const after=await snap();assert.deepEqual(after,before,'storage untouched by the checks (bytes and record stamp identical)');
 console.log('PASS file-health-readout (headless; not a phone)');
}finally{await b.close();server.close();}})().catch(e=>{console.error(e&&e.stack||e);process.exit(1)});
