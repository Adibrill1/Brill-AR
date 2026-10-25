/* Minimal repro: playwright-core's page.waitForFunction must NOT be used with async
 * predicates in this environment. Async predicate gating on a 700ms-delayed flag
 * resolves in ~30ms (the pending Promise is truthy; its value is never inspected).
 * Sync predicate on the same flag waits correctly. waitfor.cjs polls node-side instead. */
const {chromium}=require('playwright-core'),server=require('../server/server');
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));
console.log('playwright-core',require('playwright-core/package.json').version);
const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
console.log('browser',b.browserType().name(),b.version());
const p=await b.newPage();await p.goto('http://127.0.0.1:'+server.address().port+'/index.html');
await p.evaluate(()=>{window.hit=false;setTimeout(()=>{window.hit=true},700);});
let t=Date.now();await p.waitForFunction(async()=>{await new Promise(r=>setTimeout(r,10));return window.hit;},undefined,{timeout:5000});
console.log('async-predicate elapsed',Date.now()-t,'ms (expected ~700 if awaited)');
await p.evaluate(()=>{window.hit=false;setTimeout(()=>{window.hit=true},700);});
t=Date.now();await p.waitForFunction(()=>window.hit,undefined,{timeout:5000});
console.log('sync-predicate elapsed',Date.now()-t,'ms');
await b.close();await new Promise(r=>server.close(r));})().catch(e=>{console.error(e);process.exit(1)});
