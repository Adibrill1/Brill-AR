const assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path'),{spawn}=require('child_process');
// Repeated wrong publish tokens: counted per IP BEFORE the token is compared. After AUTH_FAIL_MAX wrong tokens the IP gets 429
// (with Retry-After) for every POST/DELETE, right token included, so guessing stops and there is no right/wrong oracle; nothing
// is written or deleted while locked; another address is not affected; the lock ends with the window; wrong tokens do not use
// the 30/hour publish quota. Node only (no browser).
(async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ar-auth-limit-'));
async function run(env,check){fs.rmSync(dir,{recursive:true,force:true});fs.mkdirSync(dir);
  // listen on '::' when the host has IPv6 so 127.0.0.1 and ::1 are two distinct client addresses
  const child=spawn(process.execPath,['-e',`const s=require('./server/server');s.once('error',()=>s.listen(0,'127.0.0.1',()=>console.log(s.address().port+' v4')));s.listen(0,'::',()=>console.log(s.address().port+' v6'));`],{cwd:path.join(__dirname,'..'),env:{...process.env,PUBLISH_TOKEN:'right-token',STORAGE_DIR:dir,...env},stdio:['ignore','pipe','pipe']});
  try{const [port,fam]=await new Promise((resolve,reject)=>{child.stdout.once('data',d=>resolve(String(d).trim().split(' ')));child.once('error',reject);});
    await check('http://127.0.0.1:'+port,fam==='v6'?'http://[::1]:'+port:null);}
  finally{child.kill();await new Promise(r=>child.once('exit',r));}}
const files=()=>fs.readdirSync(dir).filter(f=>f.endsWith('.json')).length;
const body=id=>JSON.stringify({format:'ar-studio/1',id,elements:[],assets:{}});
const post=(base,token,id='lim-'+Math.random().toString(36).slice(2,8))=>fetch(base+'/api/experiences',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:body(id)});
const del=(base,token,id)=>fetch(base+'/api/experiences/'+id,{method:'DELETE',headers:{authorization:'Bearer '+token}});
try{
// A: defaults (10 wrong per hour)
await run({},async(base,base6)=>{
  for(let i=1;i<=9;i++)assert.equal((await post(base,'wrong-'+i)).status,401,'wrong token #'+i+' -> 401');
  assert.equal(files(),0,'wrong tokens write nothing');
  assert.equal((await post(base,'right-token','keep-me')).status,200,'below the limit the right token still works');
  assert.equal((await del(base,'wrong-10','keep-me')).status,401,'10th wrong token (DELETE) -> 401');
  const r=await post(base,'wrong-11');assert.equal(r.status,429,'11th wrong token -> 429');
  const ra=Number(r.headers.get('retry-after'));assert.ok(ra>0&&ra<=3600,'Retry-After in seconds: '+ra);
  const j=await r.json();assert.equal(j.error,'too many failed attempts');assert.equal(j.retryAfter,ra);
  assert.equal((await post(base,'right-token','new-one')).status,429,'locked: the right token gets the same 429 (no oracle)');
  assert.equal((await del(base,'right-token','keep-me')).status,429,'locked: DELETE refused too');
  assert.equal((await fetch(base+'/api/convert/mov',{method:'POST',headers:{authorization:'Bearer right-token'},body:'x'})).status,429,'locked: every /api/ write refused');
  assert.equal(files(),1,'nothing written or deleted while locked');
  assert.equal((await fetch(base+'/api/experiences/keep-me')).status,200,'public read unaffected');
  if(base6){assert.equal((await post(base6,'right-token','other-ip')).status,200,'another address is not locked');assert.equal(files(),2);}
  else console.log('SKIP second-address case (no IPv6 on this host)');
});
// B: the lock ends with the window
await run({AUTH_FAIL_MAX:'3',AUTH_FAIL_WINDOW_MS:'1500'},async base=>{
  for(let i=1;i<=3;i++)assert.equal((await post(base,'wrong')).status,401);
  assert.equal((await post(base,'wrong')).status,429,'4th wrong -> 429 with AUTH_FAIL_MAX=3');
  assert.equal((await post(base,'right-token')).status,429,'locked inside the window');
  await new Promise(r=>setTimeout(r,1700));
  assert.equal((await post(base,'right-token','after-window')).status,200,'window passed: right token works again');
});
// C: wrong tokens do not use the publish quota (30 per IP per hour)
await run({},async base=>{
  for(let i=0;i<9;i++)assert.equal((await post(base,'wrong')).status,401);
  for(let i=0;i<30;i++)assert.equal((await post(base,'right-token','q-'+i)).status,200,'publish #'+(i+1)+' within quota');
  const r=await post(base,'right-token','q-31');assert.equal(r.status,429,'31st publish -> quota 429');assert.equal((await r.json()).error,'rate limited');
});
console.log('PASS wrong tokens counted before the token check, lock returns 429 for every write (right token included), other address unaffected, lock ends with window, quota separate');
}finally{fs.rmSync(dir,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exit(1)});
