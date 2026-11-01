const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');
// iPhone failure mode (15:20): FileReader rejects during export -> the toast must name a REAL
// reason (never "undefined"), the button must recover, and the project must stay intact.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});try{
 const p=await b.newPage();await p.goto(base+'/index.html');await p.waitForFunction(()=>document.querySelector('#exp-select').options.length>0);
 const id=await p.evaluate(async()=>{const r=(await Studio.all())[0];return r.id;});
 // a browser without file sharing, so the recovered send ends in a download (desktop Chrome on a Mac would open its share sheet)
 await p.evaluate(()=>{for(const k of ['canShare','share'])Object.defineProperty(navigator,k,{value:undefined,configurable:true});});
 // Simulate the iOS FileReader failure: onerror fires with a DOMException on the reader.
 await p.evaluate(()=>{window.__origRead=FileReader.prototype.readAsDataURL;FileReader.prototype.readAsDataURL=function(){const self=this;Object.defineProperty(self,'error',{value:new DOMException('The operation is insecure.','SecurityError')});setTimeout(()=>self.onerror&&self.onerror(new ProgressEvent('error')),0);};});
 await p.locator('#send-zip').uncheck(); // JSON path (default is now ZIP)
 await p.locator('#btn-send-publish').click();
 await p.waitForFunction(()=>document.querySelector('#msg').textContent.includes('ההכנה לשליחה נכשלה'),undefined,{timeout:10000});
 const toast=await p.evaluate(()=>document.querySelector('#msg').textContent);
 assert.ok(!toast.includes('undefined'),'toast must never show "undefined": '+toast);
 assert.ok(toast.includes('SecurityError')||toast.includes('blob read failed'),'toast names the real reason: '+toast);
 assert.equal(await p.locator('#btn-send-publish').isDisabled(),false,'button re-enabled after failure');
 const intact=await p.evaluate(async id=>{const r=await Studio.load(id);return r&&r.elements.length>=0&&!!r.assets.__artwork;},id);
 assert.ok(intact,'project preserved after failed send');
 // Recovery: restore FileReader, the send flow works again (download fallback path)
 await p.evaluate(()=>{FileReader.prototype.readAsDataURL=window.__origRead;});
 const dl=p.waitForEvent('download',{timeout:10000});await p.locator('#btn-send-publish').click();await dl;
 console.log('PASS send failure shows a real reason (never undefined), recovers, preserves the project');
}finally{await b.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exit(1)});
