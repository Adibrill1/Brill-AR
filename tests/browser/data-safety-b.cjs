const {chromium}=require('playwright-core'),assert=require('assert/strict'),server=require('../../server/server');
// Multi-tab delete, share-activation prep, recovery import for over-limit backups.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});try{
 const ctx=await b.newContext({viewport:{width:390,height:844}});const A=await ctx.newPage(),B=await ctx.newPage();
 for(const p of [A,B]){p.on('pageerror',e=>console.log('PAGE',e.message));await p.goto(base+'/index.html');await p.waitForSelector('#exp-select option',{state:'attached'});}
 // multi-tab delete: B has the record loaded, A deletes it, B's late save must not resurrect it
 const id=await A.evaluate(async()=>{const r=Studio.blankExperience('שני חלונות');await Studio.save(r);return r.id;});
 await B.evaluate(async id=>{window.__r=await Studio.load(id);},id);
 await A.evaluate(async id=>{await Studio.del(id);},id);
 const res=await B.evaluate(async()=>{try{await Studio.save({...window.__r,name:'מאוחר'});return 'saved';}catch(e){return 'refused:'+e.message;}});
 assert.equal(res,'refused:deleted in another tab');
 assert.equal(await A.evaluate(async id=>!!(await Studio.load(id)),id),false,'not resurrected by the other tab');
 assert.equal(await B.evaluate(()=>Studio.saveState(window.__r.id).lastError),null,'no sticky save error / unload guard for a record deleted elsewhere');
 console.log('PASS multi-tab delete not resurrected');
 // a brand-new record in the same tab still saves (first save has no before)
 assert.equal(await B.evaluate(async()=>{const r=Studio.blankExperience('חדש');await Studio.save(r);return !!(await Studio.load(r.id));}),true);
 // recovery import: 80-layer backup refused normally, imported as copy with recovery; original untouched
 const rv=await A.evaluate(async()=>{
  const r=Studio.blankExperience('גדול');r.target={artRect:{x:0,y:0,w:768,h:1024},natural:{w:768,h:1024}};
  r.elements=Array.from({length:80},(_,i)=>Studio.normEl({id:'e'+i,type:'text',name:'t'+i,text:'x',x:0,y:0,w:.3,h:.1,rot:0,z:.1,color:'#fff',bold:true}));
  const zip=await Studio.exportZIP(r),json=await Studio.exportJSON(r),out={warn:!!Studio.exportWarning(r)};
  for(const [k,f] of [['zip',()=>Studio.importZIP(zip,{save:false})],['json',()=>Studio.importJSON(json,{save:false})]]){
   try{await f();out[k+'Normal']='imported';}catch(e){out[k+'Normal']='refused';}
   try{const x=await (k==='zip'?Studio.importZIP(zip,{save:false,recovery:true}):Studio.importJSON(json,{save:false,recovery:true}));out[k+'Rec']=x.elements.length;}catch(e){out[k+'Rec']='ERR '+e.message;}
  }
  // limits restored after a recovery import
  try{await Studio.importZIP(zip,{save:false});out.after='imported';}catch{out.after='refused';}
  return out;});
 assert.equal(rv.warn,true);assert.equal(rv.zipNormal,'refused');assert.equal(rv.jsonNormal,'refused');assert.equal(rv.zipRec,80);assert.equal(rv.jsonRec,80);assert.equal(rv.after,'refused','normal limits back after recovery import');
 console.log('PASS recovery import: 80-layer backup refused normally, restored as copy via recovery (zip+json), limits reset',JSON.stringify(rv));
 // share activation: first tap loses activation (NotAllowedError) -> file kept; second tap calls share synchronously
 await A.reload();await A.waitForSelector('#exp-select option',{state:'attached'});
 await A.evaluate(()=>{window.__calls=[];navigator.canShare=d=>true;let n=0;navigator.share=async d=>{window.__calls.push({sync:window.__inClick===true,file:d.files[0].name});if(n++===0){const e=new Error('no activation');e.name='NotAllowedError';throw e;}};});
 await A.evaluate(()=>document.querySelector('#send-zip').checked=true);
 await A.evaluate(()=>document.querySelector('#btn-send-publish').click());
 await A.waitForFunction(()=>document.querySelector('#msg').textContent.includes('הקובץ מוכן'),undefined,{timeout:15000});
 assert.equal(await A.evaluate(()=>window.__calls.length),1);
 const sync=await A.evaluate(()=>{const btn=document.querySelector('#btn-send-publish');window.__inClick=true;btn.click();const calledSync=window.__calls.length===2;window.__inClick=false;return calledSync;});
 assert.ok(sync,'second tap calls navigator.share synchronously (no await before it)');
 console.log('PASS share: activation-lost first tap keeps the built file, second tap shares synchronously');
}finally{await b.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exit(1)});
