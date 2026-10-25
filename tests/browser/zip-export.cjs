const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server'),waitFor=require('./waitfor.cjs');
// ZIP transport: memory-light export/retrieval (no base64, no giant JSON string).
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--enable-precise-memory-info','--js-flags=--expose-gc']});try{
 const p=await b.newPage();await p.goto(base+'/index.html');await p.waitForFunction(()=>document.querySelector('#exp-select').options.length>0);
 const r=await p.evaluate(async()=>{
   // record with two real assets of distinct bytes
   const png=new Uint8Array(await (await fetch('/library/star.png')).arrayBuffer());
   const bin=new Uint8Array(300000);for(let i=0;i<bin.length;i++)bin[i]=(i*7)%251;
   const rec=Studio.blankExperience('zip test');
   rec.assets.__artwork=new Blob([png],{type:'image/png'});
   rec.assets.a1=new Blob([bin],{type:'application/octet-stream'});
   rec.elements.push(Studio.normEl({id:'e1',type:'image',name:'x',assetId:'a1',x:0,y:0,w:.5}));
   const zipBlob=await Studio.exportZIP(rec);
   // byte-equal round trip through importZIP
   const {record:back}=await Studio.importZIP(zipBlob);
   const eq=async(b1,b2)=>{const u1=new Uint8Array(await b1.arrayBuffer()),u2=new Uint8Array(await b2.arrayBuffer());if(u1.length!==u2.length)return false;for(let i=0;i<u1.length;i++)if(u1[i]!==u2[i])return false;return true;};
   const artOK=await eq(back.assets.__artwork,rec.assets.__artwork);
   const a1OK=await eq(back.assets.a1,rec.assets.a1);
   const typesOK=back.assets.__artwork.type==='image/png'&&back.elements.length===rec.elements.length&&back.name==='zip test';
   // canonical compat: zip -> JSON string passes the existing importer
   const json=await Studio.zipToJSON(zipBlob);
   let importOK=true;try{Studio.importJSON(json,{save:false});}catch(e){importOK=e.message;}
   // size: zip must beat the base64 JSON encoding
   const jsonStr=await Studio.exportJSON(rec);
   const smaller=zipBlob.size<jsonStr.length;
   // JS-heap comparison (headless approximation, precise-memory-info + explicit gc)
   const measure=async(fn)=>{window.gc();await new Promise(r=>setTimeout(r,50));const before=performance.memory.usedJSHeapSize;const out=await fn();window.gc();await new Promise(r=>setTimeout(r,50));const after=performance.memory.usedJSHeapSize;return {peak:Math.max(0,after-before),outSize:out.size??out.length};};
   const totalBytes=png.length+bin.length;
   const mZip=await measure(()=>Studio.exportZIP(rec));
   const mJson=await measure(()=>Studio.exportJSON(rec));
   return {artOK,a1OK,typesOK,importOK,smaller,jsonLen:jsonStr.length,zipSize:zipBlob.size,totalBytes,mZip,mJson};
 });
 assert.ok(r.artOK,'artwork bytes identical through ZIP round trip');
 assert.ok(r.a1OK,'element asset bytes identical through ZIP round trip');
 assert.ok(r.typesOK,'name/type/elements preserved');
 assert.equal(r.importOK,true,'zip->JSON string passes the canonical importer');
 assert.ok(r.smaller,`zip (${r.zipSize}) smaller than base64 JSON (${r.jsonLen})`);
 console.log(`PASS zip transport: byte-exact round trip + canonical compat; sizes zip=${r.zipSize} json=${r.jsonLen} raw=${r.totalBytes}; heap-delta zip=${Math.round(r.mZip.peak/1024)}KB json=${Math.round(r.mJson.peak/1024)}KB (headless approximation)`);
}finally{await b.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exit(1)});
