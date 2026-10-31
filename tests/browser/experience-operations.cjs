const {chromium}=require('playwright-core'),assert=require('node:assert/strict'),server=require('../../server/server'),waitFor=require('./waitfor.cjs');
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});try{
 for(const mode of (process.env.QA_MODE?[process.env.QA_MODE]:['new','delete','export','failed-selection'])){
 const p=await b.newPage({acceptDownloads:true});if(process.env.QA_PRIOR)await p.route('**/editor.js?*',r=>r.fulfill({body:require('child_process').execFileSync('git',['show','093b741:studio/editor.js'],{encoding:'utf8'}),contentType:'application/javascript'}));await p.goto('http://127.0.0.1:'+server.address().port+'/index.html');await p.waitForFunction(()=>document.querySelector('#exp-select').options.length>0);
 const id=await p.evaluate(async()=>{const r=Studio.blankExperience('Original');r.target={artRect:{x:0,y:0,w:768,h:1024},natural:{w:768,h:1024}};await Studio.save(r);document.querySelector('#exp-select').add(new Option(r.name,r.id));return r.id;});if(mode==='failed-selection'){
 await p.evaluate(id=>{const orig=Studio.load;let failed=false;Studio.load=async key=>{if(key===id&&!failed){failed=true;throw Error('injected failed read');}return orig(key);};},id);
 await p.locator('#exp-select').selectOption(id);await p.waitForTimeout(80);await p.locator('#exp-select').selectOption(id);await p.waitForTimeout(150);await p.locator('#btn-text').click();await p.waitForTimeout(120);
 assert.equal(await p.evaluate(async id=>(await Studio.load(id)).elements.length,id),1,'selection queue recovers after rejected read');console.log('PASS failed selection does not poison later selection');await p.close();continue;
 }
 await p.locator('#exp-select').selectOption(id);
 const baseline=await p.evaluate(async id=>(await Studio.all()).filter(r=>r.id!==id).map(r=>({id:r.id,n:r.elements.length,name:r.name})),id);
 await p.evaluate(()=>{const orig=Studio.prepareModelBlob;Studio.prepareModelBlob=async f=>{window.importStarted=true;await new Promise(r=>setTimeout(r,350));return orig(f);}; /* wraps the FULL rc80 pipeline the editor actually calls; the old partial hook returned the parsed doc instead of the file */window.exported=null;const ex=Studio.exportJSON;Studio.exportJSON=async r=>{window.exported=JSON.parse(await ex(r));return JSON.stringify(window.exported);};});
 await p.locator('#file-model').setInputFiles(require('path').join(__dirname,'../fixtures/multiclip.glb'));await p.waitForFunction(()=>window.importStarted);
 if(mode==='delete')p.once('dialog',d=>d.accept());
 await p.locator(mode==='new'?'#btn-new':mode==='delete'?'#btn-del-exp':'#btn-export').click();
 if(mode==='new')await p.waitForFunction(()=>document.querySelector('#msg').textContent.includes('התחילי'),undefined,{timeout:25000}); /* btn-new's op is queued behind the import; its message means the queue drained (import finished on the original first) */
 if(mode==='delete')await waitFor(p,async rid=>!(await Studio.load(rid)),id); /* delete op queued behind import: gone means drained */
 if(mode==='export')await waitFor(p,async rid=>window.exported&&(await Studio.load(rid)).elements.length>0,id);
 if(mode==='new')await p.screenshot({path:'/downloads/core-new-empty.png',fullPage:true});
 const out=await p.evaluate(async id=>{const orig=await Studio.load(id),all=await Studio.all();return{original:orig?orig.elements.length:null,others:all.filter(r=>r.id!==id).map(r=>({id:r.id,n:r.elements.length,name:r.name})),exported:window.exported&&{id:window.exported.id,n:window.exported.elements.length}};},id);
 if(mode==='new'){assert.equal(out.original,1,'model must stay on original');assert(out.others.some(r=>r.n===0&&r.name==='יצירה חדשה'),'new experience stays empty');}
 if(mode==='delete'){assert.equal(out.original,null,'confirmed originating record deleted after pending import');assert.deepEqual(out.others,baseline,'deletion must not attach pending model to another record');}
 if(mode==='export'){assert.deepEqual(out.exported,{id,n:1},'export must include preceding pending import');}
 console.log('PASS pending import then '+mode,out);await p.close();
 }
}finally{await b.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exit(1)});
