const {chromium}=require('playwright-core'),assert=require('assert/strict'),server=require('../../server/server');
// Data-safety repairs from the Claude Code review of 320c0ae:
//  (2) delete must not be resurrected by an in-flight save
//  (3) slider drag = one save / one undo step
//  (1) editor refuses to build what import would reject (layers, total media) and import errors say why
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});try{
 const p=await b.newPage({viewport:{width:390,height:844}});p.on('pageerror',e=>console.log('PAGE',e.message));
 await p.goto(base+'/index.html');await p.waitForSelector('#element-list li');
 // (2) delete vs in-flight save
 const del=await p.evaluate(async()=>{
  const r=Studio.blankExperience('למחיקה');r.elements=[{id:'t',type:'text',name:'t',text:'x',x:0,y:0,w:.5,h:.2,rot:0,z:.1,color:'#fff',bold:true}];await Studio.save(r);
  const pending=Studio.save({...r,name:'late save'});   // in flight, not awaited
  await Studio.del(r.id);                                // must wait for it, then delete
  await pending.catch(()=>{});
  await new Promise(x=>setTimeout(x,300));
  const late=Studio.save({...r,name:'later still'}).then(()=>1);await late;
  return {present:!!(await Studio.load(r.id)),inList:(await Studio.all()).some(x=>x.id===r.id)};
 });
 assert.equal(del.present,false,'deleted experience stays deleted after in-flight and late saves');
 assert.equal(del.inList,false);
 // (1) limits (read from Studio.LIMITS): 61st layer, over-total media and an oversize file are refused by the editor guard
 const lim=await p.evaluate(async()=>{
  const r=Studio.blankExperience('גבולות');
  r.elements=Array.from({length:60},(_,i)=>({id:'e'+i,type:'text'}));
  const layers=Studio.addBlocker(r,{layers:1});
  const MiB=1024*1024,M=Studio.LIMITS.maxEntryBytes,T=Studio.LIMITS.maxMediaBytes,sizes=[];for(let left=T-MiB;left>0;left-=M)sizes.push(Math.min(M,left));
  const r2=Studio.blankExperience('מדיה');r2.assets={};r2.elements=sizes.map((n,i)=>{r2.assets['k'+i]=new Blob([new Uint8Array(n)]);return {id:'k'+i,type:'image',assetId:'k'+i};});
  const okSmall=Studio.addBlocker(r2,{bytes:MiB});                  // exactly the total limit
  const tooMuch=Studio.addBlocker(r2,{bytes:2*MiB});                // 1MiB over
  const entry=Studio.addBlocker(Studio.blankExperience('x'),{bytes:M+MiB});
  return {layers,okSmall,tooMuch,entry,limits:Studio.LIMITS};
 });
 assert.ok(lim.layers&&lim.layers.includes('60'),'61st layer refused: '+lim.layers);
 assert.equal(lim.okSmall,null,'exactly at the import limit is allowed');
 assert.ok(lim.tooMuch&&lim.tooMuch.includes(Math.round(lim.limits.maxMediaBytes/1048576)+'MB'),'over total refused: '+lim.tooMuch);
 assert.ok(lim.entry&&lim.entry.includes(Math.round(lim.limits.maxEntryBytes/1048576)+'MB'),'oversize file refused: '+lim.entry);
 // an experience exactly at the limits round-trips through export -> import
 const rt=await p.evaluate(async()=>{
  const r=Studio.blankExperience('בגבול');r.target={artRect:{x:0,y:0,w:768,h:1024},natural:{w:768,h:1024}};
  r.elements=Array.from({length:60},(_,i)=>Studio.normEl({id:'e'+i,type:'text',name:'t'+i,text:'x',x:0,y:0,w:.3,h:.1,rot:0,z:.1,color:'#fff',bold:true}));
  const json=await Studio.exportJSON(r);const back=await Studio.importJSON(json);return {n:back.elements.length};
 });
 assert.equal(rt.n,60,'60 layers round-trip export->import');
 const pub=await p.evaluate(()=>{const mk=n=>({elements:[{id:"a",type:"image",assetId:"a"}],assets:{a:new Blob([new Uint8Array(n)])}});return {small:Studio.publishBlocker(mk(9*1024*1024)),big:Studio.publishBlocker(mk(32*1024*1024))};});
 assert.equal(pub.small,null,'9MB scene (her published size class) is publishable');
 assert.ok(pub.big&&/\d+\.\d+MB/.test(pub.big),'32MB media (42.7MB JSON in review) refused up front with the exact size: '+pub.big);

 // ---- exact boundaries: serialized size, import limits, round trips at the limit ----
 const bd=await p.evaluate(async()=>{
  const mk=(sizes,types)=>{const r=Studio.blankExperience('גבול');r.target={artRect:{x:0,y:0,w:768,h:1024},natural:{w:768,h:1024}};r.assets={};r.elements=[];
   sizes.forEach((n,i)=>{const a='a'+i;r.assets[a]=new Blob([new Uint8Array(n)],{type:(types&&types[i])||'image/png'});r.elements.push(Studio.normEl({id:'e'+i,type:'image',name:'i'+i,assetId:a,x:0,y:0,w:.3,h:.3,rot:0,z:.1,aspect:1}));});return r;};
  const out={};
  // exact predicted JSON size == real exportJSON bytes (UTF-8, Hebrew name)
  const r1=mk([1000,1001,1002]);const j1=await Studio.exportJSON(r1);out.sizeMatch=[Studio.exportJSONSize(r1),new Blob([j1]).size];
  // entries exactly at the per-file limit fill the total limit exactly and import via JSON and ZIP
  const M=Studio.LIMITS.maxEntryBytes,N=Studio.LIMITS.maxMediaBytes/M;out.n=N;const r2=mk(Array.from({length:N},()=>M));out.restoreAt=Studio.restoreBlocker(r2);
  try{const back=await Studio.importJSON(await Studio.exportJSON(r2),{save:false});out.jsonAt=back.elements.length;}catch(e){out.jsonAt='ERR '+e.message;}
  try{const back=await Studio.importZIP(await Studio.exportZIP(r2),{save:false});out.zipAt=back.elements.length;}catch(e){out.zipAt='ERR '+e.message;}
  out.jsonAtSize=Studio.exportJSONSize(r2);out.pubAt=Studio.publishBlocker(r2);
  // one byte over: flagged by restoreBlocker, exports still carry everything
  const r3=mk([M+1]);out.restoreOver=Studio.restoreBlocker(r3);out.warnOver=Studio.exportWarning(r3);
  const j3=await Studio.exportJSON(r3);out.overExportHasAsset=j3.includes('"a0":"data:image/png;base64,');
  // publish cap decided on exact serialized bytes: find the largest size under 40MiB and one over
  const cap=40*1024*1024;let lo=0,hi=40*1024*1024;const base=Studio.exportJSONSize(mk([0]));
  const under=Math.floor((cap-base)*3/4)-3,over=under+8;
  out.pubUnder=[Studio.exportJSONSize(mk([under]))<=cap,Studio.publishBlocker(mk([under]))];
  out.pubOver=[Studio.exportJSONSize(mk([over]))>cap,!!Studio.publishBlocker(mk([over]))];
  // 28MB media is publishable (rough 29MB rule would have been right, 30MB is the real edge)
  out.pub30=Studio.publishBlocker(mk([20*1024*1024,9*1024*1024+700*1024]));
  // orphan assets (not exported) do not count toward the backup limit
  const r4=mk([1000]);r4.assets.orphan=new Blob([new Uint8Array(30*1024*1024)]);out.orphan=Studio.restoreBlocker(r4);
  // 122nd media file refused
  const r5=mk(Array.from({length:60},()=>10));r5.elements.forEach((e,i)=>{r5.assets['s'+i]=new Blob([new Uint8Array(10)]);e.particles={spriteAssetId:'s'+i};});r5.assets.__artwork=new Blob([new Uint8Array(10)]);out.assets121=Studio.addBlocker(r5,{bytes:10});
  return out;
 });
 assert.equal(bd.sizeMatch[0],bd.sizeMatch[1],'predicted publish size equals exportJSON bytes exactly: '+bd.sizeMatch);
 assert.ok(Number.isInteger(bd.n)&&bd.n>=1,'total limit is a whole number of per-file limits: '+bd.n);
 assert.equal(bd.restoreAt,null,'exactly the total limit (per-file-sized entries) is restorable');
 assert.equal(bd.jsonAt,bd.n,'entries at the per-file limit import via JSON: '+bd.jsonAt);
 assert.equal(bd.zipAt,bd.n,'same via ZIP: '+bd.zipAt);
 assert.ok(bd.restoreOver&&bd.warnOver.includes('לא נחתך'),'over-limit entry is flagged on export, not silently truncated');
 assert.ok(bd.overExportHasAsset,'over-limit export still contains the full asset');
 assert.ok(bd.pubUnder[0]&&bd.pubUnder[1]===null,'just under 40MiB serialized is publishable '+bd.pubUnder);
 assert.ok(bd.pubOver[0]&&bd.pubOver[1],'just over 40MiB serialized is blocked '+bd.pubOver);
 assert.equal(bd.orphan,null,'orphan assets are not exported so not counted');
 assert.ok(bd.assets121&&bd.assets121.includes('121'),'122nd media file refused');
 console.log('PASS boundaries: exact size, total-limit JSON+ZIP round trip, over-limit warned, publish edge exact',JSON.stringify({jsonAtSize:bd.jsonAtSize,pubAt:bd.pubAt,pub30:bd.pub30}));
 console.log('PASS delete not resurrected; add guards match import limits; 60-layer round trip');
 // (3) slider: one save per drag, one undo step
 await p.evaluate(async()=>{const r=Studio.blankExperience('סליידר');r.target={artRect:{x:0,y:0,w:768,h:1024},natural:{w:768,h:1024}};await Studio.save(r);});
 await p.reload();await p.waitForFunction(()=>[...document.querySelectorAll('#exp-select option')].some(o=>o.textContent==='סליידר'));
 await p.locator('#exp-select').selectOption({label:'סליידר'});
 await p.getByRole('button',{name:/טקסט/}).first().click();
 await p.waitForSelector('#sl-scale',{state:'visible'});
 const before=await p.evaluate(()=>Studio.historyState(document.querySelector('#exp-select').value));
 const res=await p.evaluate(async()=>{
  const id=document.querySelector('#exp-select').value;let saves=0;const orig=Studio.save;
  const s=document.querySelector('#sl-scale');
  const start=performance.now();
  for(let i=0;i<30;i++){s.value=(.1+i*.01).toFixed(2);s.dispatchEvent(new Event('input',{bubbles:true}));}
  s.dispatchEvent(new Event('change',{bubbles:true}));
  await new Promise(r=>setTimeout(r,1200));
  const rec=await Studio.load(id);
  return {w:rec.elements[rec.elements.length-1].w,ms:performance.now()-start};
 });
 assert.ok(Math.abs(res.w-0.39)<1e-6,'final slider value persisted: '+res.w);
 const undoSteps=await p.evaluate(async()=>{const id=document.querySelector('#exp-select').value;let n=0;while(Studio.historyState(id).undo&&n<30){await Studio.restoreHistory(id,'undo');n++;}return n;});
 assert.ok(undoSteps<=4,'30-tick drag created at most a few undo steps (was 20+ filling history): '+undoSteps);
 const rec0=await p.evaluate(async()=>{const id=document.querySelector('#exp-select').value;const r=await Studio.load(id);return r.elements.length;});
 console.log('PASS slider drag: final value persisted, undo steps for 30 ticks =',undoSteps,'(elements after full undo:',rec0+')');

 // ---- durable delete: late saves beyond 15s, pending slider timer, reload ----
 await p.reload();await p.waitForSelector('#exp-select option',{state:'attached'});
 const dd=await p.evaluate(async()=>{
  const r=Studio.blankExperience('מחיקה עמידה');await Studio.save(r);const id=r.id;
  await Studio.del(id);
  const realNow=Date.now;Date.now=()=>realNow()+60000;try{await Studio.save({...r,name:'מאוחר'});}finally{Date.now=realNow;}
  await new Promise(x=>setTimeout(x,200));return {id,present:!!(await Studio.load(id))};
 });
 assert.equal(dd.present,false,'save 60s after delete does not resurrect');
 await p.reload();await p.waitForSelector('#exp-select option',{state:'attached'});
 assert.equal(await p.evaluate(async id=>!!(await Studio.load(id)),dd.id),false,'still deleted after reload');
 // pending slider timer + delete from the UI
 await p.evaluate(async()=>{const r=Studio.blankExperience('סליידר ומחיקה');r.target={artRect:{x:0,y:0,w:768,h:1024},natural:{w:768,h:1024}};await Studio.save(r);});
 await p.reload();await p.waitForFunction(()=>[...document.querySelectorAll('#exp-select option')].some(o=>o.textContent==='סליידר ומחיקה'));
 await p.locator('#exp-select').selectOption({label:'סליידר ומחיקה'});
 await p.getByRole('button',{name:/טקסט/}).first().click();await p.waitForSelector('#sl-scale',{state:'visible'});
 const sid=await p.evaluate(()=>document.querySelector('#exp-select').value);
 p.once('dialog',d=>d.accept());
 await p.evaluate(()=>{const s=document.querySelector('#sl-scale');s.value='0.5';s.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#btn-del-exp').click();});
 await p.waitForTimeout(1800);
 assert.equal(await p.evaluate(async id=>!!(await Studio.load(id)),sid),false,'delete with a pending slider timer stays deleted');
 await p.reload();await p.waitForSelector('#exp-select option',{state:'attached'});
 assert.equal(await p.evaluate(async id=>!!(await Studio.load(id)),sid),false,'...and after reload');
 console.log('PASS durable delete: 60s-late save, pending slider timer, reload');
 // ---- long slow drag = ONE undo step; stale timer cannot write into another project ----
 await p.evaluate(async()=>{const r=Studio.blankExperience('גרירה איטית');r.target={artRect:{x:0,y:0,w:768,h:1024},natural:{w:768,h:1024}};await Studio.save(r);const o=Studio.blankExperience('אחר');o.target=r.target;await Studio.save(o);});
 await p.reload();await p.waitForFunction(()=>[...document.querySelectorAll('#exp-select option')].some(o=>o.textContent==='גרירה איטית'));
 await p.locator('#exp-select').selectOption({label:'גרירה איטית'});
 await p.getByRole('button',{name:/טקסט/}).first().click();await p.waitForSelector('#sl-scale',{state:'visible'});
 await p.waitForTimeout(500);
 const slow=await p.evaluate(async()=>{
  const id=document.querySelector('#exp-select').value;const s=document.querySelector('#sl-scale');
  const w0=(await Studio.load(id)).elements.slice(-1)[0].w;
  for(let i=0;i<5;i++){s.value=(.4+i*.05).toFixed(2);s.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(r=>setTimeout(r,750));} // > debounce each tick: several saves
  s.dispatchEvent(new Event('change',{bubbles:true}));await new Promise(r=>setTimeout(r,500));
  const w1=(await Studio.load(id)).elements.slice(-1)[0].w;
  await Studio.restoreHistory(id,'undo');const w2=(await Studio.load(id)).elements.slice(-1)[0].w;
  return {w0,w1,w2};
 });
 assert.ok(Math.abs(slow.w1-0.6)<1e-6,'slow drag final value saved '+slow.w1);
 assert.ok(Math.abs(slow.w2-slow.w0)<1e-6,'one undo returns to the pre-drag value (one gesture = one undo): '+JSON.stringify(slow));
 // stale timer: input then switch project immediately; the other project must be untouched
 const sw=await p.evaluate(async()=>{
  const sel=document.querySelector('#exp-select');const a=sel.value;const other=[...sel.options].find(o=>o.textContent==='אחר').value;
  const before=JSON.stringify((await Studio.load(other)).elements);
  const s=document.querySelector('#sl-scale');s.value='0.9';s.dispatchEvent(new Event('input',{bubbles:true}));
  sel.value=other;sel.dispatchEvent(new Event('change',{bubbles:true}));
  await new Promise(r=>setTimeout(r,1500));
  return {otherSame:JSON.stringify((await Studio.load(other)).elements)===before,aW:(await Studio.load(a)).elements.slice(-1)[0].w};
 });
 assert.ok(sw.otherSame,'switching with a pending slider timer does not write into the other project');
 assert.ok(Math.abs(sw.aW-0.9)<1e-6,'the edit was flushed to the project it belonged to before switching: '+sw.aW);
 console.log('PASS slow drag = 1 undo step; switch with pending timer flushes to the right project');
}finally{await b.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exit(1)});
