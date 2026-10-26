// Phone header undo/redo buttons forward to the real undo/redo (same state), work from every tab, and mirror the real disabled state.
const {chromium}=require('playwright-core'),assert=require('assert/strict'),server=require('../../server/server');
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
const p=await (await b.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true})).newPage();let pageErrors=0;p.on('pageerror',()=>pageErrors++);
await p.goto(base+'/index.html');await p.waitForFunction(()=>document.querySelector('#exp-select').options.length>0);await p.waitForTimeout(800);
const st=()=>p.evaluate(async()=>{const l=await Studio.all();const r=l.find(x=>x.id===document.querySelector('#exp-select').value);return {n:r.elements.length,u:document.getElementById('hdr-undo').disabled,r:document.getElementById('hdr-redo').disabled,ru:document.getElementById('btn-undo').disabled,rr:document.getElementById('btn-redo').disabled}});
let s=await st();assert.equal(s.u,true);assert.equal(s.r,true);const n0=s.n;
await p.click('#btn-text');await p.waitForTimeout(800);s=await st();assert.equal(s.n,n0+1);assert.equal(s.u,false,'header undo enabled after an edit');assert.equal(s.u,s.ru,'mirrors the real undo state');
await p.click('#shell-tabs [data-tab=check]');await p.click('#hdr-undo');await p.waitForTimeout(800);s=await st();assert.equal(s.n,n0,'undo from the Check tab removed the new layer (persisted)');assert.equal(s.r,false,'redo enabled');assert.equal(s.r,s.rr);
await p.click('#shell-tabs [data-tab=create]');await p.click('#hdr-redo');await p.waitForTimeout(800);s=await st();assert.equal(s.n,n0+1,'redo from the Create tab restored it');
console.log('PASS header undo/redo drive the real history from any tab and mirror its disabled state');
await p.setViewportSize({width:1280,height:800});await p.waitForTimeout(300);assert.equal(await p.evaluate(()=>getComputedStyle(document.getElementById('hdr-history')).display),'none','not shown on desktop');
console.log('PASS hidden on desktop');
assert.equal(pageErrors,0);await b.close();server.close();})().catch(e=>{console.error(e);process.exit(1)});
