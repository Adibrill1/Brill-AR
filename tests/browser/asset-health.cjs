const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server'),waitFor=require('./waitfor.cjs');
// Dead stored assets (iOS picker backing evicted): editor must load, name the lost asset,
// the send button must refuse before a doomed export, and copy-on-import must store
// page-owned bytes (Blob, not the picker's File).
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});try{
 const p=await b.newPage();await p.goto(base+'/index.html');await p.waitForFunction(()=>document.querySelector('#exp-select').options.length>0);
 // copy-on-import: artwork stored as page-owned Blob with identical bytes
 const art=await p.evaluate(async()=>{const before=(await Studio.all())[0];const resp=await fetch('/library/star.png');const f=await resp.blob();const file=new File([f],'star.png',{type:'image/png'});
   const dt=new DataTransfer();dt.items.add(file);const input=document.querySelector('#file-artwork');input.files=dt.files;input.dispatchEvent(new Event('change'));
   await new Promise(r=>setTimeout(r,2500));
   const rec=(await Studio.all()).find(r=>r.id===before.id);const stored=rec.assets.__artwork;
   return {ctor:stored.constructor.name,isFile:stored instanceof File,bytes:stored.size===file.size};});
assert.equal(art.isFile,false,'stored artwork is a page-owned Blob, not the picker File');assert.ok(art.bytes,'byte count preserved');
 // dead asset, in-session (a fake blob can't round-trip through IDB/structuredClone):
 // patch Studio.load so the next experience switch carries an unreadable asset
 await p.evaluate(()=>{const orig=Studio.load;Studio.load=async id=>{const r=await orig(id);if(r&&!r.assets.dead1){r.assets.dead1={size:1234,type:'image/png',slice(){return {arrayBuffer:()=>Promise.reject(new DOMException('backing gone','NotReadableError'))};}};r.elements.push(Studio.normEl({id:'dz',type:'image',name:'תמונה שבורה',assetId:'dead1',x:0,y:0,w:.3}));}return r;};});
 await p.locator('#exp-select').dispatchEvent('change');
 await waitFor(p,async()=>document.querySelector('#msg').textContent.includes('לא נקראו מהמכשיר'),undefined,10000);
 assert.ok((await p.evaluate(()=>document.querySelector('#msg').textContent)).includes('תמונה שבורה'),'load names the lost asset');
 // send button refuses preflight and does NOT download
 await p.locator('#btn-send-publish').click();
 await waitFor(p,async()=>document.querySelector('#msg').textContent.includes('לא קריאים יותר'),undefined,10000);
 assert.equal(await p.evaluate(()=>document.querySelector('#msg').textContent.includes('שום דבר לא נשלח')),true,'honest refusal, nothing sent');
 assert.equal(await p.locator('#btn-send-publish').isDisabled(),false,'button re-enabled after refusal');
 // assetHealth as a pure check: dead vs healthy with reasons
 const health=await p.evaluate(()=>Studio.assetHealth({assets:{dead1:{size:9,type:'image/png',slice:()=>({arrayBuffer:()=>Promise.reject(new DOMException('x','NotReadableError'))})},good:new Blob(['x'],{type:'text/plain'})}}));
 assert.ok(health.find(h=>h.id==='dead1'&&!h.ok&&h.reason==='NotReadableError'),'health names the dead asset and reason');
 assert.ok(health.find(h=>h.id==='good'&&h.ok),'healthy assets reported healthy');
 console.log('PASS dead assets: editor loads + names losses, send refuses honestly, health distinguishes dead vs healthy, copy-on-import stores owned bytes');
}finally{await b.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exit(1)});
