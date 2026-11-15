const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');const Mock=require('./portal-mock.cjs');
// Publishing on the viewer portal, from the editor, against a stand-in GitHub (portal-mock.cjs: route interception, a
// made-up token; nothing reaches the real service). Covers: the one-time token setup, the trigger fingerprint (exact +
// perceptual: the same picture saved again smaller and recompressed is the same trigger, another picture is not), the
// one-published-per-trigger rule with "להחליף את המפורסמת" keeping the link id, the gallery marks ("מפורסמת", "גרסה 2 מתוך 3"),
// update, removal, a failed upload that leaves the portal as it was, a catalogue changed meanwhile (read again, nothing lost),
// the link + QR, the token kept out of backups, and a restored backup. Phone size, touch. Headless Chrome, not a phone.
const SHOTS='/Users/adibrill/Desktop/brill-ar-work/wt-portal-shots/';
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});try{
  require('fs').mkdirSync(SHOTS,{recursive:true});
  const mock=Mock.create();mock.token=Mock.FAKE_TOKEN;
  const ctx=await b.newContext({viewport:{width:375,height:812},isMobile:true,hasTouch:true,permissions:['clipboard-read','clipboard-write']});await mock.attach(ctx);
  const p=await ctx.newPage(),errs=[];p.on('pageerror',e=>errs.push(String(e)));p.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))errs.push(m.text());});
  await p.goto(base+'/index.html');await p.waitForFunction(()=>typeof Studio!=='undefined'&&typeof App!=='undefined'&&typeof Portal!=='undefined');
  // four creations: A, B (the same artwork file), C (the same picture saved again: 80% size, JPEG), D (another picture)
  const ids=await p.evaluate(async()=>{
    const rnd=(s)=>()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
    const art=(seed,w=600,h=800)=>{const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d'),r=rnd(seed);g.scale(w/600,h/800);g.fillStyle=`hsl(${r()*360},40%,70%)`;g.fillRect(0,0,600,800);
      for(let k=0;k<60;k++){g.fillStyle=`hsl(${r()*360},70%,${20+r()*60}%)`;g.beginPath();g.arc(r()*600,r()*800,10+r()*60,0,7);g.fill();}return c;};
    const toBlob=(c,t,q)=>new Promise(r=>c.toBlob(r,t||'image/png',q));
    const mk=async(name,blob,created)=>{const img=await Studio.loadImageBlob(blob),t=await Studio.makeTarget(img);const a=Studio.blankExperience(name);
      a.target={artRect:t.artRect,natural:{w:img.naturalWidth,h:img.naturalHeight},fp:Studio.artworkFingerprint(img)};a.assets.__artwork=blob;a.createdAt=created;a.updatedAt=created;
      a.elements=[{id:'t1',type:'text',text:name,x:0,y:0.2,w:0.5,rot:0}];await Studio.save(a,{noHistory:true});return a.id;};
    const same=await toBlob(art(7));
    return {A:await mk('גרסה ראשונה',same,1000),B:await mk('גרסה שנייה',same,2000),C:await mk('שמורה מחדש',await toBlob(art(7,480,640),'image/jpeg',0.7),3000),D:await mk('יצירה אחרת',await toBlob(art(99)),4000)};
  });
  // fingerprint: exact and perceptual
  const fp=await p.evaluate(async(ids)=>{const t={};for(const k of Object.keys(ids))t[k]=await Portal.trigger(await Studio.load(ids[k]));
    return {AB:Portal.sameTrigger(t.A,t.B),ABsha:t.A.sha===t.B.sha,AC:Portal.sameTrigger(t.A,t.C),ACsha:t.A.sha===t.C.sha,AD:Portal.sameTrigger(t.A,t.D),dist:Studio.fingerprintDistance({hex:t.A.fp,entropy:t.A.fpe},{hex:t.C.fp,entropy:t.C.fpe}),distD:Studio.fingerprintDistance({hex:t.A.fp,entropy:t.A.fpe},{hex:t.D.fp,entropy:t.D.fpe}),ph:[t.A.ph,t.C.ph,t.D.ph]};},ids);
  console.log('fingerprint',JSON.stringify(fp));
  assert.ok(fp.AB&&fp.ABsha,'the same file: the same trigger (exact hash)');
  assert.ok(fp.AC&&!fp.ACsha,'the same picture saved again smaller as JPEG: a different file but the same trigger (perceptual)');
  assert.ok(!fp.AD,'another picture is another trigger');

  // gallery: A, B and C are versions of one artwork
  await p.goto(base+'/index.html#/');await p.waitForSelector('.card');await p.waitForTimeout(400);
  const marks=()=>p.evaluate(()=>[...document.querySelectorAll('.card')].filter(c=>c.querySelector('.card-name')).map(c=>({name:c.querySelector('.card-name').textContent,pub:!!c.querySelector('[data-mark=published]'),ver:(c.querySelector('[data-mark=version]')||{}).textContent||''})));
  let mk=await marks();
  assert.equal(mk.find(x=>x.name==='גרסה ראשונה').ver,'גרסה 1 מתוך 3');assert.equal(mk.find(x=>x.name==='גרסה שנייה').ver,'גרסה 2 מתוך 3');assert.equal(mk.find(x=>x.name==='שמורה מחדש').ver,'גרסה 3 מתוך 3');
  assert.equal(mk.find(x=>x.name==='יצירה אחרת').ver,'','another artwork has no version mark');
  assert.ok(mk.every(x=>!x.pub),'nothing published yet');

  // open A, share sheet: no token yet -> "פרסום בפורטל" opens the setup
  const share=async(id)=>{await p.goto(base+'/index.html#/e/'+id);await p.reload();await p.waitForSelector('#btn-share');await p.waitForTimeout(500);await p.click('#btn-share');await p.waitForSelector('#portal-box button',{timeout:15000});await p.waitForTimeout(300);};
  await share(ids.A);
  await p.click('#portal-publish');await p.waitForSelector('#portal-token');await p.waitForTimeout(600);
  await p.screenshot({path:SHOTS+'editor-token-setup.png'});
  const steps=await p.locator('.portal-steps li').allTextContents();assert.ok(steps.length>=6&&steps.some(s=>s.includes('Contents'))&&steps.some(s=>s.includes('Brill-AR')),'the steps name the repository and the Contents permission');
  await p.fill('#portal-token','hello');await p.click('#portal-token-save');await p.waitForTimeout(200);
  assert.match(await p.textContent('#portal-token-msg'),/לא נראה כמו טוקן/,'a wrong shape is refused before any request');
  await p.fill('#portal-token',Mock.FAKE_TOKEN);await p.click('#portal-token-save');
  await p.waitForSelector('#portal-token',{state:'detached'});
  assert.equal(await p.evaluate(()=>localStorage.getItem('brill-portal-token')),Mock.FAKE_TOKEN,'kept on this phone');
  await p.waitForSelector('#portal-box[data-portal=none]',{timeout:15000});
  await p.screenshot({path:SHOTS+'editor-share-publish.png'});

  // publish A
  await p.click('#portal-publish');await p.waitForSelector('#portal-box[data-portal=published]',{timeout:30000});
  let cat=mock.catalogue();assert.equal(cat.items.length,1);const pubId=cat.items[0].id;
  assert.equal(pubId,ids.A,'the first publish takes the creation id as its link id');assert.equal(cat.items[0].src,ids.A);
  for(const f of [cat.items[0].scene,...cat.items[0].files,cat.items[0].thumb])assert.ok(mock.read(f),'file on the branch: '+f);
  const scene=JSON.parse(mock.read(cat.items[0].scene).toString());assert.equal(scene.format,'ar-studio/1');assert.ok(scene.assets.__artwork.file.startsWith('m/'),'media as references');
  assert.ok(!JSON.stringify(scene).includes('data:'),'no embedded media in the creation file');
  assert.ok(cat.items[0].trigger.f.length>1000,'recognition data in the catalogue');
  assert.equal(mock.commitCount(),1,'one publish = one commit');
  await p.screenshot({path:SHOTS+'editor-share-published.png'});
  // link + QR
  await p.click('#portal-link');await p.waitForSelector('.portal-qr');
  assert.equal(await p.textContent('#portal-url'),'https://adibrill1.github.io/Brill-AR/view.html#'+encodeURIComponent(pubId));
  const qr=await p.evaluate(()=>{const i=document.querySelector('.portal-qr');return {w:i.naturalWidth,src:i.src.slice(0,22)};});assert.ok(qr.w>=300&&qr.src==='data:image/png;base64,','a QR picture made on the phone');
  await p.screenshot({path:SHOTS+'editor-link-qr.png'});
  await p.keyboard.press('Escape');await p.keyboard.press('Escape');await p.waitForTimeout(200);

  // B (same artwork): offered to replace the published one
  await share(ids.B);await p.waitForSelector('#portal-box[data-portal=other]',{timeout:15000});
  assert.match(await p.textContent('#portal-box'),/גרסה ראשונה/,'names the published one');
  await p.screenshot({path:SHOTS+'editor-share-replace.png'});
  const before=mock.files();
  await p.click('#portal-replace');await p.waitForSelector('#portal-box[data-portal=published]',{timeout:30000});
  cat=mock.catalogue();assert.equal(cat.items.length,1,'still one per trigger');assert.equal(cat.items[0].id,pubId,'the link id stays');assert.equal(cat.items[0].src,ids.B,'now B is the published one');
  const oldScene=[...before.keys()].find(k=>k.startsWith('c/'));assert.ok(!mock.read(oldScene),'the replaced creation file is gone');
  assert.ok(mock.read(cat.items[0].files.find(f=>f.endsWith('.png'))),'the shared artwork file stays (same content, same name)');
  await p.keyboard.press('Escape');

  // C (same picture, another file): publishing straight away asks first
  await share(ids.C);await p.waitForSelector('#portal-box[data-portal=other]');
  await p.keyboard.press('Escape');
  // D: publish, while "another phone" changes the catalogue just before the branch moves -> read again, both kept
  await share(ids.D);await p.waitForSelector('#portal-box[data-portal=none]');
  mock.beforeRef=()=>mock.sneak((files,put)=>{const c=JSON.parse(mock.read('index.json').toString());c.items.push({...c.items[0],id:'other-phone-1',src:'zzz',name:'מטלפון אחר',trigger:{...c.items[0].trigger,sha:'f'.repeat(64),fp:'0'.repeat(60)}});files.set('index.json',put(JSON.stringify(c)));});
  await p.click('#portal-publish');await p.waitForSelector('#portal-box[data-portal=published]',{timeout:30000});
  cat=mock.catalogue();assert.deepEqual(cat.items.map(i=>i.src).sort(),[ids.B,ids.D,'zzz'].sort(),'nothing lost when the catalogue changed meanwhile');
  // a failed upload: the branch does not move, the catalogue stays as it was
  const headBefore=mock.head(),catBefore=JSON.stringify(mock.catalogue());
  await p.evaluate(async(id)=>{const r=await Studio.load(id);r.elements[0].text='שינוי';await Studio.save(r);},ids.D);
  mock.failures.push({when:({method,path})=>method==='POST'&&path==='/git/trees',status:500});
  await p.keyboard.press('Escape');await share(ids.D);await p.waitForSelector('#portal-box[data-portal=published]');
  await p.click('#portal-update');await p.waitForSelector('.toast.error',{timeout:20000});
  assert.match(await p.textContent('.toast.error'),/GitHub לא קיבל|לא הצליח/);
  assert.equal(mock.head(),headBefore,'a failed publish leaves the branch where it was');assert.equal(JSON.stringify(mock.catalogue()),catBefore,'and the catalogue untouched');
  // update now works
  await p.waitForSelector('#portal-update:not([disabled])');await p.click('#portal-update');await p.waitForFunction(()=>document.querySelector('.toast:not(.error)')&&/עודכן/.test(document.querySelector('.toast:not(.error)').textContent),null,{timeout:30000});
  cat=mock.catalogue();const d=cat.items.find(i=>i.src===ids.D);assert.ok(JSON.parse(mock.read(d.scene).toString()).elements[0].text==='שינוי','the update is what viewers get');
  // remove D
  await p.waitForSelector('#portal-remove:not([disabled])');await p.click('#portal-remove');await p.click('.dlg .btn.danger');
  await p.waitForSelector('#portal-box[data-portal=none]',{timeout:30000});
  cat=mock.catalogue();assert.ok(!cat.items.some(i=>i.src===ids.D),'removed from the catalogue');assert.ok(!mock.read(d.scene),'its files are gone');
  await p.keyboard.press('Escape');

  // gallery marks: B published (from the catalogue), versions still marked
  await p.goto(base+'/index.html#/');await p.waitForSelector('.card');await p.waitForFunction(()=>document.querySelector('[data-mark=published]'),null,{timeout:15000});
  mk=await marks();assert.deepEqual(mk.filter(x=>x.pub).map(x=>x.name),['גרסה שנייה'],'only B is marked published');await p.evaluate(()=>document.querySelectorAll('.toast,.busy').forEach(t=>t.remove()));
  await p.screenshot({path:SHOTS+'editor-gallery-marks.png'});
  // the token never rides a backup; a restored backup of B is a new creation: not marked, and offered to replace
  const zipText=await p.evaluate(async(id)=>{const z=await Studio.exportZIP(await Studio.load(id));const t=new TextDecoder('latin1').decode(new Uint8Array(await z.arrayBuffer()));const r=await Studio.importZIP(z);return {has:t.includes('github_pat_'),restored:r.id};},ids.B);
  assert.equal(zipText.has,false,'no token in the backup');
  await p.goto(base+'/index.html#/');await p.waitForTimeout(800);mk=await marks();
  assert.equal(mk.filter(x=>x.pub).length,1,'the restored copy is not marked published (the catalogue names B)');
  await share(zipText.restored);await p.waitForSelector('#portal-box[data-portal=other]');
  await p.keyboard.press('Escape');
  // forget the token
  await share(ids.D);await p.click('#portal-settings');await p.click('#portal-token-forget');await p.locator('dialog.dlg').last().locator('.btn.danger').click();await p.waitForTimeout(300);
  assert.equal(await p.evaluate(()=>localStorage.getItem('brill-portal-token')),null,'the token can be deleted');
  assert.deepEqual(errs,[],'no errors');
  console.log('portal-publish ok');
}finally{await b.close();server.close();}})().catch(e=>{console.error(e);process.exit(1);});
