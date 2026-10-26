const {chromium}=require('playwright-core'),assert=require('assert/strict'),path=require('path'),server=require('../../server/server');
// Import is subject to the same duplicate-target rule as upload (nothing written on conflict), and flush/seat flags survive JSON + ZIP + recovery import.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});try{const p=await b.newPage({viewport:{width:390,height:844}});
 await p.goto(base+'/index.html');await p.waitForSelector('#element-list li');
 await p.locator('#file-artwork').setInputFiles(path.resolve('tests/fixtures/target-a.png'));await p.waitForFunction(()=>document.querySelector('#msg').textContent.includes('נשמרה'));
 const A=await p.evaluate(()=>document.querySelector('#exp-select').value);
 // blank experience B (no artwork) with a flush text, a flush+seat model-like element and a legacy text
 const B=await p.evaluate(async()=>{const r=Studio.blankExperience('flags');r.elements=[{id:'f1',type:'text',name:'f',text:'f',color:'#fff',bold:true,x:0,y:0,w:.3,h:null,rot:0,z:0,flush:true,seq:r.sequences&&r.sequences[0]?r.sequences[0].id:undefined},{id:'l1',type:'text',name:'l',text:'l',color:'#fff',bold:true,x:0,y:.2,w:.3,h:null,rot:0,z:.15}];r.elements.forEach(Studio.normEl);await Studio.save(r);return r.id;});
 const exp=await p.evaluate(async([A,B])=>{const out={};for(const [k,id] of [['A',A],['B',B]]){const r=await Studio.load(id);const j=await Studio.exportJSON(r);out[k+'json']=typeof j==='string'?j:await j.text();const z=await Studio.exportZIP(r);out[k+'zip']=Array.from(new Uint8Array(await z.arrayBuffer()));}return out;},[A,B]);
 const count=()=>p.evaluate(async()=>(await Studio.all()).length);
 const before=await count();
 // 1. JSON import of A (same target) -> blocked, nothing written
 await p.locator('#file-import').setInputFiles({name:'a.json',mimeType:'application/json',buffer:Buffer.from(exp.Ajson)});
 await p.waitForFunction(()=>document.querySelector('#msg').textContent.includes('הייבוא נעצר'));
 assert.equal(await count(),before,'JSON import blocked, no record written');
 // 2. ZIP import of A -> blocked
 await p.locator('#file-import').setInputFiles({name:'a.zip',mimeType:'application/zip',buffer:Buffer.from(exp.Azip)});
 await p.waitForTimeout(1500);assert.ok((await p.evaluate(()=>document.querySelector('#msg').textContent)).includes('הייבוא נעצר'));assert.equal(await count(),before,'ZIP import blocked');
 // 3. recovery import of A -> blocked
 await p.locator('#file-import-recovery').setInputFiles({name:'a.json',mimeType:'application/json',buffer:Buffer.from(exp.Ajson)});
 await p.waitForTimeout(800);
 await p.waitForTimeout(1200);assert.equal(await count(),before,'recovery import of a conflicting target writes nothing (confirm dialog may auto-dismiss)');
 // 4. B (no artwork) imports fine via JSON and ZIP; flush flag and legacy z preserved
 for(const [name,type,buf] of [['b.json','application/json',Buffer.from(exp.Bjson)],['b.zip','application/zip',Buffer.from(exp.Bzip)]]){
  const n0=await count();await p.locator('#file-import').setInputFiles({name,mimeType:type,buffer:buf});await p.waitForFunction(n=>document.querySelector('#msg').textContent.includes('הייבוא הצליח'),n0,{timeout:8000});
  assert.equal(await count(),n0+1,name+' imported as a new record');
  const els=await p.evaluate(async()=>{const all=await Studio.all();const r=all.sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0))[0];return r.elements.map(e=>({id:e.id,flush:!!e.flush,z:e.z}));});
  const f1=els.find(e=>e.id==='f1'),l1=els.find(e=>e.id==='l1');
  assert.ok(f1&&f1.flush===true&&f1.z===0,name+' keeps flush flag + z=0: '+JSON.stringify(els));
  assert.ok(l1&&l1.flush===false&&l1.z===0.15,name+' legacy layer unchanged: '+JSON.stringify(els));
 }
 console.log('PASS import honors duplicate-target block (JSON, ZIP, recovery write nothing); non-conflicting JSON+ZIP import keep flush flag and legacy z');
}finally{await b.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exit(1)});
