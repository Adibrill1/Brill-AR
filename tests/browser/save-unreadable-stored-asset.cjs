const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');
// A stored asset that cannot be read for a moment (the undo comparison reads it) must not fail the save of an
// unrelated edit, must not alter any stored asset byte, and a save that truly fails must leave the stored record
// untouched and keep the edit in memory for a retry.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});try{
const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage();
await p.addInitScript(()=>{const o=Blob.prototype.arrayBuffer;Blob.prototype.arrayBuffer=function(){if(sessionStorage.getItem('arm')==='1')return Promise.reject(new DOMException('The requested file could not be read','NotReadableError'));return o.call(this)}});
await p.goto(base+'/index.html');await p.waitForFunction(()=>document.querySelector('#exp-select').options.length>0);await p.waitForTimeout(1500);
const r=await p.evaluate(async()=>{
 const hash=async rec=>{const h={};for(const [k,v] of Object.entries(rec.assets)){const ab=new Uint8Array(await v.arrayBuffer());let x=0;for(let i=0;i<ab.length;i++)x=(x*31+ab[i])>>>0;h[k]=[ab.length,x]}return JSON.stringify(h)};
 const out={};const rec=(await Studio.all())[0];const h0=await hash(rec);const x0=rec.elements[0].x||0;
 // 1. unreadable during the undo comparison
 rec.elements[0].x=x0+0.05;sessionStorage.setItem('arm','1');
 try{await Studio.save(rec);out.save1='ok'}catch(e){out.save1='FAIL '+e.message}
 sessionStorage.removeItem('arm');
 const st=(await Studio.all())[0];out.stored1=st.elements[0].x;out.bytes1=(await hash(st))===h0;out.undo1=Studio.historyState(rec.id).undo;
 // 2. a save that really fails: stored record untouched, edit stays in memory, retry works
 rec.elements[0].x=x0+0.1;Studio._testFailSave('disk full');
 try{await Studio.save(rec);out.save2='ok'}catch(e){out.save2='FAIL'}
 const st2=(await Studio.all())[0];out.stored2=st2.elements[0].x;out.mem2=rec.elements[0].x;out.err2=Studio.saveState(rec.id).lastError;
 Studio._testFailSave(null);
 try{await Studio.save(rec);out.retry='ok'}catch(e){out.retry='FAIL '+e.message}
 const st3=(await Studio.all())[0];out.stored3=st3.elements[0].x;out.bytes3=(await hash(st3))===h0;out.x0=x0;return out});
console.log(JSON.stringify(r));
assert.equal(r.save1,'ok','an unreadable stored asset during the undo comparison must not fail the save');
assert.equal(r.stored1,r.x0+0.05,'the edit was stored');assert.ok(r.bytes1,'stored asset bytes unchanged after that save');assert.ok(r.undo1,'an undo step was kept');
assert.equal(r.save2,'FAIL');assert.equal(r.stored2,r.x0+0.05,'a failed save leaves the stored record as it was');assert.equal(r.mem2,r.x0+0.1,'the edit stays in memory');
assert.equal(r.retry,'ok');assert.equal(r.stored3,r.x0+0.1,'retry stores the kept edit');assert.ok(r.bytes3,'asset bytes unchanged after retry');
console.log('PASS save-unreadable-stored-asset (headless; not a phone)');
}finally{await b.close();server.close();}})().catch(e=>{console.error(e&&e.stack||e);process.exit(1)});
