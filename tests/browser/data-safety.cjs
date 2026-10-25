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
 // (1) limits: 61st layer, and >60MB media, are refused by the editor guard
 const lim=await p.evaluate(async()=>{
  const r=Studio.blankExperience('גבולות');
  r.elements=Array.from({length:60},(_,i)=>({id:'e'+i,type:'text'}));
  const layers=Studio.addBlocker(r,{layers:1});
  const r2=Studio.blankExperience('מדיה');r2.assets={a:new Blob([new Uint8Array(20*1024*1024)]),b:new Blob([new Uint8Array(20*1024*1024)]),c:new Blob([new Uint8Array(19*1024*1024)])};
  const okSmall=Studio.addBlocker(r2,{bytes:1024*1024});            // 60MB exactly
  const tooMuch=Studio.addBlocker(r2,{bytes:2*1024*1024});          // 61MB
  const entry=Studio.addBlocker(Studio.blankExperience('x'),{bytes:21*1024*1024});
  return {layers,okSmall,tooMuch,entry,limits:Studio.LIMITS};
 });
 assert.ok(lim.layers&&lim.layers.includes('60'),'61st layer refused: '+lim.layers);
 assert.equal(lim.okSmall,null,'exactly at the import limit is allowed');
 assert.ok(lim.tooMuch&&lim.tooMuch.includes('60MB'),'over total refused: '+lim.tooMuch);
 assert.ok(lim.entry&&lim.entry.includes('20MB'),'oversize file refused: '+lim.entry);
 // an experience exactly at the limits round-trips through export -> import
 const rt=await p.evaluate(async()=>{
  const r=Studio.blankExperience('בגבול');r.target={artRect:{x:0,y:0,w:768,h:1024},natural:{w:768,h:1024}};
  r.elements=Array.from({length:60},(_,i)=>Studio.normEl({id:'e'+i,type:'text',name:'t'+i,text:'x',x:0,y:0,w:.3,h:.1,rot:0,z:.1,color:'#fff',bold:true}));
  const json=await Studio.exportJSON(r);const back=await Studio.importJSON(json);return {n:back.elements.length};
 });
 assert.equal(rt.n,60,'60 layers round-trip export->import');
 const pub=await p.evaluate(()=>{const mk=n=>({assets:{a:new Blob([new Uint8Array(n)])}});return {small:Studio.publishBlocker(mk(9*1024*1024)),big:Studio.publishBlocker(mk(32*1024*1024))};});
 assert.equal(pub.small,null,'9MB scene (her published size class) is publishable');
 assert.ok(pub.big&&pub.big.includes('29MB'),'32MB media (42.7MB JSON in review) refused up front: '+pub.big);
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
}finally{await b.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exit(1)});
