const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');
// An asset read that fails for a moment (or only through FileReader on the stored blob) must not be reported as
// "files not read from the device". A read that keeps failing still is (asset-health.cjs covers that).
async function boot(b,base,mode){
 const ctx=await b.newContext({viewport:{width:390,height:844}});const p=await ctx.newPage();
 await p.addInitScript((mode)=>{
  const tries=new WeakMap();const origRead=FileReader.prototype.readAsDataURL;const OB=window.Blob;
  if(mode==='copy'){window.Blob=function(...a){const b=new OB(...a);Object.defineProperty(b,'__copy',{value:true});return b};window.Blob.prototype=OB.prototype;}
  FileReader.prototype.readAsDataURL=function(blob){
   const n=(tries.get(blob)||0)+1;tries.set(blob,n);
   const fail=(mode==='transient'&&n<=2)||(mode==='copy'&&!blob.__copy)||mode==='always';
   if(fail&&sessionStorage.getItem('arm')==='1'){const r=this;setTimeout(()=>{Object.defineProperty(r,'error',{value:{name:'NotReadableError'}});r.onerror&&r.onerror(new Event('error'))},0);return}
   return origRead.call(this,blob)};
 },mode);
 await p.goto(base+'/index.html');await p.waitForFunction(()=>document.querySelector('#exp-select').options.length>0);await p.waitForTimeout(1500);
 await p.evaluate(()=>sessionStorage.setItem('arm','1'));await p.reload();await p.waitForFunction(()=>document.querySelector('#exp-select').options.length>0);await p.waitForTimeout(3500);
 const msg=await p.evaluate(()=>(document.querySelector('#msg')||{}).textContent||'');
 const warned=await p.evaluate(()=>[...document.querySelectorAll('#element-list li')].filter(l=>l.textContent.includes('⚠')).length);
 await ctx.close();return {msg,warned};
}
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});try{
 const t=await boot(b,base,'transient');assert.ok(!/לא נקראו/.test(t.msg)&&t.warned===0,'two transient read failures are retried, nothing reported: '+JSON.stringify(t));
 const c=await boot(b,base,'copy');assert.ok(!/לא נקראו/.test(c.msg)&&c.warned===0,'FileReader failing on the stored blob only: arrayBuffer copy recovers, nothing reported: '+JSON.stringify(c));
 const a=await boot(b,base,'always');assert.ok(/לא נקראו/.test(a.msg)&&a.warned>0,'a read that keeps failing is still reported (control): '+JSON.stringify(a));
 console.log('PASS hydrate-transient-read (headless; not a phone)');
}finally{await b.close();server.close();}})().catch(e=>{console.error(e&&e.stack||e);process.exit(1)});
