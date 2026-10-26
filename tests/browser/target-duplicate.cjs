const {chromium}=require('playwright-core'),assert=require('assert/strict'),path=require('path'),server=require('../../server/server');
// Duplicate target detection (n:1): separate from quality assessment - a new
// artwork identical/near-identical to another experience's target warns and
// names that experience; a distinct target stays quiet. dHash fingerprint:
// exact match distance 0, resize/recompress near, unrelated far, flat skipped.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});try{const p=await b.newPage({viewport:{width:390,height:844}});for(const f of ['target-a.png','target-a2.png','target-b.png'])await p.route('**/tests/fixtures/'+f,r=>r.fulfill({path:require('path').join(__dirname,'../fixtures',f),contentType:'image/png'}));
 await p.goto(base+'/index.html');await p.waitForSelector('#element-list li');
 const fpdist=await p.evaluate(async()=>{
  const load=async(u)=>Studio.loadImage(await (await fetch(u).then(r=>r.blob()).then(Studio.blobToDataURL)));
  const a=await load('/../tests/fixtures/target-a.png'),a2=await load('/../tests/fixtures/target-a2.png'),b=await load('/../tests/fixtures/target-b.png');
  const flat=document.createElement('canvas');flat.width=flat.height=64;const g=flat.getContext('2d');g.fillStyle='#888';g.fillRect(0,0,64,64);
  const fflat=Studio.artworkFingerprint(flat);
  return {same:Studio.fingerprintDistance(Studio.artworkFingerprint(a),Studio.artworkFingerprint(a)),near:Studio.fingerprintDistance(Studio.artworkFingerprint(a),Studio.artworkFingerprint(a2)),far:Studio.fingerprintDistance(Studio.artworkFingerprint(a),Studio.artworkFingerprint(b)),flatVsA:Studio.fingerprintDistance(fflat,Studio.artworkFingerprint(a)),entropyFlat:fflat.entropy};
 });
 console.log(JSON.stringify(fpdist));
 assert.equal(fpdist.same,0,'identical image distance 0');
 assert.ok(Number.isFinite(fpdist.near)&&Number.isFinite(fpdist.far),'both comparable (finite): '+JSON.stringify(fpdist));
 assert.ok(fpdist.near<=16,'resized near-duplicate within threshold: '+fpdist.near);
 assert.ok(fpdist.far>fpdist.near+20&&fpdist.far>24,'unrelated image clearly distant: '+fpdist.far);
 assert.equal(fpdist.flatVsA,Infinity,'flat image is not comparable');
 // Full editor flow: experience 1 keeps target-a; a second experience with
 // target-a2 must warn and name experience 1; target-b must not warn.
 await p.locator('#file-artwork').setInputFiles(path.resolve('tests/fixtures/target-a.png'));await p.waitForFunction(()=>document.querySelector('#msg').textContent.includes('נשמרה'));
 const first=await p.evaluate(()=>document.querySelector('#exp-select').value);
 await p.evaluate(async(id)=>{const r=await Studio.load(id);r.name='יצירת מקור';await Studio.save(r);await Studio.refreshExpSelectSafely?.();},first);
 await p.evaluate(()=>Studio.save(Studio.blankExperience('בדיקת כפילות')));
 await p.reload();await p.waitForFunction(()=>[...document.querySelectorAll('#exp-select option')].some(o=>o.textContent==='בדיקת כפילות'));
 await p.locator('#exp-select').selectOption({label:'בדיקת כפילות'});
 await p.locator('#file-artwork').setInputFiles(path.resolve('tests/fixtures/target-a2.png'));
 await p.waitForFunction(()=>document.querySelector('#msg').textContent.includes('לא הועלתה'));
 const warn=await p.evaluate(()=>document.querySelector('#msg').textContent);
 assert.ok(warn.includes('יצירת מקור'),'rejection names the conflicting experience: '+warn);
 const after=await p.evaluate(async()=>{const r=await Studio.load(document.querySelector('#exp-select').value);return {art:!!(r.assets&&r.assets.__artwork),fp:!!(r.target&&r.target.fp),name:r.name};});
 assert.deepEqual(after,{art:false,fp:false,name:'בדיקת כפילות'},'rejected upload left the creation untouched: '+JSON.stringify(after));
 // exact same image blocked too
 await p.locator('#file-artwork').setInputFiles(path.resolve('tests/fixtures/target-a.png'));
 await p.waitForFunction(()=>document.querySelector('#msg').textContent.includes('לא הועלתה'));
 // distinct image accepted and fingerprint persisted
 await p.locator('#file-artwork').setInputFiles(path.resolve('tests/fixtures/target-b.png'));
 await p.waitForFunction(()=>document.querySelector('#msg').textContent.includes('נשמרה'));
 const fpSaved=await p.evaluate(async()=>{const r=await Studio.load(document.querySelector('#exp-select').value);return !!(r.target&&r.target.fp);});
 assert.ok(fpSaved,'fingerprint persisted on the accepted creation');
 // replacing a target with a near-copy of its OWN previous target is not a cross-experience conflict
 await p.locator('#file-artwork').setInputFiles(path.resolve('tests/fixtures/target-b.png'));
 await p.waitForFunction(()=>document.querySelector('#msg').textContent.includes('נשמרה'));
 // replacement rejected keeps the previous target and asset
 const before=await p.evaluate(async()=>{const r=await Studio.load(document.querySelector('#exp-select').value);return {fp:r.target.fp.hex,size:r.assets.__artwork.size};});
 await p.locator('#file-artwork').setInputFiles(path.resolve('tests/fixtures/target-a2.png'));
 await p.waitForFunction(()=>document.querySelector('#msg').textContent.includes('לא הועלתה'));
 const kept=await p.evaluate(async()=>{const r=await Studio.load(document.querySelector('#exp-select').value);return {fp:r.target.fp.hex,size:r.assets.__artwork.size};});
 assert.deepEqual(kept,before,'rejected replacement kept previous target and image');
 console.log('PASS duplicate/too-similar target BLOCKS upload and names the other creation; creation untouched; same-record re-upload and distinct image accepted; rejected replacement keeps previous target');
}finally{await b.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exit(1)});
