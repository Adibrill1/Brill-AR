const {chromium}=require('playwright-core'),assert=require('node:assert/strict'),crypto=require('crypto');const server=require('../../server/server');
// Layers by Claude: from the "פירוק לשכבות" sheet she sends a picture and her words; the request lands encrypted on the
// branch "layer-requests" (only Claude's private key opens it); Claude's answer, encrypted with the request's key, is
// picked up and the layers go into the same creation as one group, far to near. GitHub is stood in for (never the
// real service); the test makes its own key pair. Phone, touch.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
 const {publicKey,privateKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
 // a tiny GitHub: one branch, files by path
 const files=new Map(),blobs=new Map(),trees=new Map(),commits=new Map();let head=null,n=0;
 const sha=()=>crypto.createHash('sha1').update('x'+(n++)).digest('hex');
 const cors={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,PATCH'};
 async function gh(route){const req=route.request(),url=new URL(req.url()),m=req.method(),p=url.pathname.replace('/repos/Adibrill1/Brill-AR','');
  if(m==='OPTIONS')return route.fulfill({status:204,headers:cors});
  const js=(s,o)=>route.fulfill({status:s,contentType:'application/json',headers:cors,body:JSON.stringify(o)}),body=req.postData()?JSON.parse(req.postData()):null;
  assert.equal(req.headers()['authorization'],'Bearer github_pat_TEST_ONLY_NOT_REAL_000000000000');
  if(p==='/git/ref/heads/layer-requests')return head?js(200,{object:{sha:head}}):js(404,{message:'Not Found'});
  if(p.startsWith('/git/commits/')&&m==='GET')return js(200,{tree:{sha:commits.get(p.split('/').pop()).tree}});
  if(p==='/git/blobs'){const s=sha();blobs.set(s,Buffer.from(body.content,'base64'));return js(201,{sha:s});}
  if(p==='/git/trees'){const s=sha(),t=new Map(body.base_tree?trees.get(body.base_tree):[]);for(const e of body.tree)t.set(e.path,e.sha);trees.set(s,t);return js(201,{sha:s});}
  if(p==='/git/commits'){const s=sha();commits.set(s,{tree:body.tree});return js(201,{sha:s});}
  if(p==='/git/refs'&&m==='POST'){head=body.sha;return js(201,{});}
  if(p==='/git/refs/heads/layer-requests'&&m==='PATCH'){head=body.sha;return js(200,{});}
  if(p.startsWith('/contents/')){const path=decodeURIComponent(p.slice(10)),t=head?trees.get(commits.get(head).tree):new Map(),s=t.get(path);
   return s?route.fulfill({status:200,contentType:'application/octet-stream',headers:cors,body:files.get(path)||blobs.get(s)}):js(404,{message:'Not Found'});}
  return js(500,{message:'unexpected '+m+' '+p});}
 const tree=()=>head?trees.get(commits.get(head).tree):new Map(),read=(path)=>blobs.get(tree().get(path));
 const unlock=(raw,buf)=>{const d=crypto.createDecipheriv('aes-256-gcm',raw,buf.subarray(0,12));d.setAuthTag(buf.subarray(buf.length-16));return Buffer.concat([d.update(buf.subarray(12,buf.length-16)),d.final()]);};
 const lock=(raw,buf)=>{const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',raw,iv);const o=Buffer.concat([c.update(buf),c.final()]);return Buffer.concat([iv,o,c.getAuthTag()]);};
 try{
  const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});await ctx.route('https://api.github.com/**',gh);
  const p=await ctx.newPage(),errs=[];p.on('pageerror',e=>errs.push(String(e)));p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await p.goto(base+'/index.html');await p.waitForFunction(()=>typeof Studio!=='undefined'&&typeof Desk!=='undefined');
  const id=await p.evaluate(async(jwk)=>{localStorage.setItem('brill-portal-token','github_pat_TEST_ONLY_NOT_REAL_000000000000');Desk.testKey(jwk);
    const a=Studio.blankExperience('לוויתן');a.target={artRatio:0.75,artRect:{x:0,y:0,w:300,h:400},natural:{w:300,h:400}};
    const c=document.createElement('canvas');c.width=300;c.height=400;const g=c.getContext('2d');g.fillStyle='#204070';g.fillRect(0,0,300,400);
    a.assets.__artwork=await new Promise(r=>c.toBlob(r,'image/png'));a.elements=[];await Studio.save(a);return a.id;},publicKey.export({format:'jwk'}));
  await p.goto(base+'/index.html#/e/'+id);await p.waitForSelector('#btn-add');await p.waitForTimeout(600);
  await p.evaluate((jwk)=>{Desk.testKey(jwk);Splitter.fake={depth:(c)=>({w:c.width,h:c.height,data:new Uint8Array(c.width*c.height).fill(100)})};},publicKey.export({format:'jwk'}));
  if(await p.locator('.tab[data-tab="layers"]').isVisible())await p.locator('.tab[data-tab="layers"]').click();
  await p.locator('#btn-add').click();await p.locator('dialog[open] .add-tile[data-add="split"]').click();await p.locator('dialog[open] .add-tile[data-split="art"]').click();
  await p.locator('#split-claude-words').fill('רקע, לוויתן, טקסט');await p.locator('#split-claude-send').click();
  await p.waitForFunction(()=>/אצל Claude/.test(document.querySelector('#split-claude-msg').textContent),null,{timeout:20000});
  // Claude's side: the request opens only with the private key
  const rid=[...tree().keys()].find(k=>k.endsWith('/req.bin')).split('/')[1];
  assert.deepEqual([...tree().keys()].sort(),['r/'+rid+'/key.bin','r/'+rid+'/pic.bin','r/'+rid+'/req.bin']);
  const raw=crypto.privateDecrypt({key:privateKey,padding:crypto.constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},read('r/'+rid+'/key.bin'));
  const req=JSON.parse(unlock(raw,read('r/'+rid+'/req.bin')));assert.equal(req.words,'רקע, לוויתן, טקסט');assert.equal(req.name,'לוויתן');
  const pic=unlock(raw,read('r/'+rid+'/pic.bin'));assert.equal(pic.subarray(1,4).toString(),'PNG','the picture comes through');
  assert.ok(!read('r/'+rid+'/req.bin').includes(Buffer.from('לוויתן')),'nothing readable on the branch');
  // the answer: three layers
  const pngs=await p.evaluate(async()=>{const out=[];for(const col of ['#204070','#30a0d0','#ffffff']){const c=document.createElement('canvas');c.width=300;c.height=400;const g=c.getContext('2d');g.fillStyle=col;g.fillRect(col==='#204070'?0:100,100,100,100);out.push((await new Promise(r=>c.toBlob(r,'image/png'))).arrayBuffer().then(a=>Array.from(new Uint8Array(a))));}return Promise.all(out);});
  const t=tree();const put=(path,buf)=>{const s=sha();blobs.set(s,buf);t.set(path,s);};
  ['רקע','לוויתן','טקסט'].forEach((nm,i)=>put('r/'+rid+'/L'+i+'.bin',lock(raw,Buffer.from(pngs[i]))));
  put('r/'+rid+'/done.bin',lock(raw,Buffer.from(JSON.stringify({layers:['רקע','לוויתן','טקסט'].map((nm,i)=>({name:nm,file:'L'+i+'.bin'})),spread:0.3,note:'הלוויתנים בשכבה אחת'}))));
  await p.keyboard.press('Escape');
  const got=await p.evaluate(()=>Desk.check());assert.equal(got,1,'one answer picked up');
  const r=await p.evaluate(()=>{const els=App.rec.elements,g=els.find(e=>e.type==='group');return {names:els.filter(e=>e.type==='image').map(e=>e.name),zs:els.filter(e=>e.type==='image').map(e=>e.z),g:g&&g.name,spread:g&&g.split&&g.split.spread,pending:Desk.list().length,assets:els.filter(e=>e.type==='image').every(e=>App.rec.assets[e.assetId] instanceof Blob)};});
  assert.deepEqual(r.names,['רקע','לוויתן','טקסט']);assert.ok(r.zs[0]===0&&r.zs[1]>0&&r.zs[2]>r.zs[1],'far to near '+r.zs);
  assert.equal(r.g,'שכבות מ־Claude');assert.equal(r.spread,0.3);assert.equal(r.pending,0,'nothing left waiting');assert.ok(r.assets);
  await p.reload();await p.waitForSelector('#btn-add');assert.equal(await p.evaluate(()=>App.rec.elements.filter(e=>e.type==='image').length),3,'saved');
  assert.equal(errs.filter(e=>!/favicon|404|Failed to load resource/.test(e)).length,0,'no page errors: '+errs.join(' | '));
  console.log('layers by Claude: all checks pass');
 }finally{await b.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
