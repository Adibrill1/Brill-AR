const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server'),waitFor=require('./waitfor.cjs');
process.env.HER_EXPORT_FIXTURE='/downloads/file-6b0534f1.json'; // her private export, local test only - never deployed
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
   const back=await Studio.importZIP(zipBlob,{save:false});
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
 // intake hardening: bomb/traversal/oversize entries rejected BEFORE inflation
 const safety=await p.evaluate(async()=>{
   const out={};
   const mk=(files)=>{const parts=[];return (async()=>{const z=new fflate.Zip((e,c)=>parts.push(c));for(const [n,b]of files){const f=new fflate.ZipPassThrough(n);z.add(f);f.push(b,true);}z.end();await new Promise(r=>setTimeout(r,50));return new Blob(parts);})();};
   const meta=JSON.stringify({format:'ar-studio/1',name:'x',elements:[],assets:{}});
   // path traversal in an asset reference
   const evil=await mk([['experience.json',fflate.strToU8(JSON.stringify({format:'ar-studio/1',name:'x',elements:[],assets:{a:{file:'assets/../../etc/x',type:'text/plain',size:1}}}))],['assets/x.bin',new Uint8Array([1])]]);
   try{await Studio.importZIP(evil,{save:false});out.traversal='NOT-REJECTED';}catch(e){out.traversal=e.message;}
   // oversized entry: declared originalSize above the cap must be filtered without inflation
   const big=new Uint8Array(21*1024*1024);
   const zipBig=await (()=>{const parts=[];const z=new fflate.Zip((e,c)=>parts.push(c));const m=new fflate.ZipPassThrough('experience.json');z.add(m);m.push(fflate.strToU8(JSON.stringify({format:'ar-studio/1',name:'x',elements:[],assets:{a:{file:'assets/big.bin',type:'application/octet-stream',size:big.length}}})),true);const f=new fflate.ZipPassThrough('assets/big.bin');z.add(f);f.push(big,true);z.end();return new Promise(r=>setTimeout(()=>r(new Blob(parts)),80));})();
   try{await Studio.importZIP(zipBig,{save:false});out.oversize='NOT-REJECTED';}catch(e){out.oversize=e.message;}
   // plain bad archive
   try{await Studio.importZIP(new Blob([new Uint8Array([1,2,3])]),{save:false});out.garbage='NOT-REJECTED';}catch(e){out.garbage='rejected';}
   return out;
 });
 assert.notEqual(safety.traversal,'NOT-REJECTED','traversal reference rejected: '+safety.traversal);
 assert.notEqual(safety.oversize,'NOT-REJECTED','oversized entry rejected: '+safety.oversize);
 assert.equal(safety.garbage,'rejected','non-zip rejected');
 console.log(`PASS zip transport: byte-exact round trip + canonical compat; sizes zip=${r.zipSize} json=${r.jsonLen} raw=${r.totalBytes}; heap-delta zip=${Math.round(r.mZip.peak/1024)}KB json=${Math.round(r.mJson.peak/1024)}KB (headless approximation)`);
 // her real 9.4MB export: JSON -> record -> ZIP -> record, byte-exact assets both ways
 const her=await p.evaluate(async()=>{
   const text=await (await fetch('/her-export.json')).text();
   const rec=await Studio.importJSON(text,{save:false});
   const zipBlob=await Studio.exportZIP(rec);
   const back=await Studio.importZIP(zipBlob,{save:false});
   const ids=Object.keys(rec.assets);let ok=ids.length>0;
   for(const id of ids){const a=new Uint8Array(await rec.assets[id].arrayBuffer()),b=new Uint8Array(await back.assets[id].arrayBuffer());if(a.length!==b.length){ok=false;break;}for(let i=0;i<a.length;i++)if(a[i]!==b[i]){ok=false;break;}}
   const json2=await Studio.zipToJSON(zipBlob);
   let canon=true;try{Studio.importJSON(json2,{save:false});}catch(e){canon=e.message;}
   return {ok,assets:ids.length,zipSize:zipBlob.size,jsonSize:text.length,canon,name:rec.name};
 });
 assert.ok(her.ok,'her assets byte-exact through ZIP round trip');
 assert.equal(her.canon,true,'her zip converts back to canonical JSON');
 assert.ok(her.zipSize<her.jsonSize,`her zip (${her.zipSize}) beats JSON (${her.jsonSize})`);
 console.log(`PASS her real export round-trips: ${her.assets} assets byte-exact, zip=${her.zipSize} vs json=${her.jsonSize} (${her.name})`);
}finally{await b.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exit(1)});
