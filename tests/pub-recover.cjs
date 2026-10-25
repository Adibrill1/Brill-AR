const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),os=require('os'),http=require('http'),{execFile}=require('child_process');
// pub-recover / pub-manifest: durable published-scene set across clean checkouts, integrity aborts.
// NOTE: the fixture server lives in THIS process - children must run ASYNC (execFileSync would
// block the event loop and deadlock the child's fetch).
const run=(script,env)=>new Promise(res=>{execFile('node',[path.join(__dirname,'../scripts/'+script)],{env:{...process.env,...env}},(e,stdout,stderr)=>res({code:e?(e.code||1):0,stdout:String(stdout),stderr:String(stderr)}));});
(async()=>{
 const remote=fs.mkdtempSync(path.join(os.tmpdir(),'pub-remote-'));
 fs.writeFileSync(path.join(remote,'alpha.json'),JSON.stringify({format:'ar-studio/1',id:'alpha',elements:[]}));
 fs.writeFileSync(path.join(remote,'beta.json'),JSON.stringify({format:'ar-studio/1',id:'beta',elements:[{id:'x'}]}));
 let r=await run('pub-manifest.cjs',{PUB_DIR:remote});assert.equal(r.code,0,'manifest generation: '+r.stderr);
 r=await run('pub-manifest.cjs',{PUB_DIR:remote});assert.equal(r.code,0);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(remote,'manifest.json'),'utf8')).scenes.map(s=>s.id),['alpha','beta'],'manifest.json must never list itself as a scene (regression: second generation included it)');
 const srv=http.createServer((req,res2)=>{const f=path.join(remote,decodeURIComponent(req.url.replace('/pub/','')));if(fs.existsSync(f)){res2.writeHead(200);res2.end(fs.readFileSync(f));}else{res2.writeHead(404);res2.end();}});
 await new Promise(r2=>srv.listen(0,'127.0.0.1',r2));const site='http://127.0.0.1:'+srv.address().port;
 const local=fs.mkdtempSync(path.join(os.tmpdir(),'pub-local-')); // clean-checkout simulation: no pub dir at all
 r=await run('pub-recover.cjs',{PUB_SITE:site,PUB_DIR:local});assert.equal(r.code,0,'clean recovery: '+r.stderr);
 for(const id of ['alpha','beta'])assert.equal(fs.readFileSync(path.join(local,id+'.json'),'utf8'),fs.readFileSync(path.join(remote,id+'.json'),'utf8'),'byte-identical recovery of '+id);
 console.log('PASS clean-checkout recovery restores every published scene byte-identically');
 fs.appendFileSync(path.join(remote,'beta.json'),' '); // tamper after manifest was generated
 r=await run('pub-recover.cjs',{PUB_SITE:site,PUB_DIR:local});
 assert.ok(r.code!==0&&r.stderr.includes('integrity check')&&r.stderr.includes('beta'),'tampered published scene must abort the deploy: '+r.stderr);
 console.log('PASS tampered published scene aborts recovery (deploy blocked)');
 fs.unlinkSync(path.join(remote,'manifest.json')); // lost manifest
 r=await run('pub-recover.cjs',{PUB_SITE:site,PUB_DIR:local});
 assert.ok(r.code!==0&&r.stderr.includes('no /pub/manifest.json'),'local scenes without a remote manifest must abort: '+r.stderr);
 console.log('PASS local scenes with a lost remote manifest abort (no silent drop)');
 const empty=fs.mkdtempSync(path.join(os.tmpdir(),'pub-empty-'));
 r=await run('pub-recover.cjs',{PUB_SITE:site,PUB_DIR:empty});assert.equal(r.code,0,'empty no-op: '+r.stderr);
 console.log('PASS empty remote + empty local is a clean no-op');
 await new Promise(r2=>srv.close(r2));
})().catch(e=>{console.error(e);process.exit(1)});
