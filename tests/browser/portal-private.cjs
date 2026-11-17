const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');const Mock=require('./portal-mock.cjs');
// Private creations ("פרסום פרטי"), against a stand-in GitHub (portal-mock.cjs; nothing reaches the real service).
// From the editor's share sheet: publish privately -> a link view.html#<id>.<key>. Then: nothing readable is in the
// repository (no name in the catalogue or in any file, the artwork's bytes nowhere, every file of it encrypted); the
// public portal does not list it; the link opens it in the viewer (decrypted: the same artwork, the same text layer);
// the link with its key cut or changed says so; "alone" keeps the public creations out of a private visit; an update keeps
// the link and does not upload unchanged media again; "קישור חדש" makes the old link stop working; removal drops its
// files; a copy of the creation does not carry the link. On another device (no key kept) the link is pasted once.
// Headless Chrome; the camera and the AR engine are not part of this test (portal-viewer / portal-engine cover them).
const SHOTS='/Users/adibrill/Desktop/brill-ar-work/wt-portal-shots/private/';
const ANDROID='Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});try{
  require('fs').mkdirSync(SHOTS,{recursive:true});
  const mock=Mock.create();mock.token=Mock.FAKE_TOKEN;
  const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,userAgent:ANDROID,permissions:['camera','clipboard-read','clipboard-write']});await mock.attach(ctx);
  const errs=[];const watch=(p)=>{p.on('pageerror',e=>errs.push(String(e)));return p;};
  const ed=watch(await ctx.newPage());await ed.goto(base+'/index.html');await ed.waitForFunction(()=>typeof Portal!=='undefined'&&typeof App!=='undefined');
  const NAME='המגנט של נועה',TEXT='מזל טוב נועה';
  // one public creation and the private one (another artwork)
  const ids=await ed.evaluate(async({token,NAME,TEXT})=>{
    localStorage.setItem('brill-portal-token',token);
    const rnd=(s)=>()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
    const art=(seed)=>{const c=document.createElement('canvas');c.width=600;c.height=800;const g=c.getContext('2d'),r=rnd(seed);g.fillStyle=`hsl(${r()*360},40%,70%)`;g.fillRect(0,0,600,800);
      for(let k=0;k<70;k++){g.fillStyle=`hsl(${r()*360},${40+r()*60}%,${15+r()*70}%)`;g.beginPath();g.arc(r()*600,r()*800,8+r()*70,0,7);g.fill();}return c;};
    const mk=async(name,seed,text)=>{const blob=await new Promise(r=>art(seed).toBlob(r,'image/png')),img=await Studio.loadImageBlob(blob),t=await Studio.makeTarget(img);
      const a=Studio.blankExperience(name);a.target={artRect:t.artRect,natural:{w:600,h:800},fp:Studio.artworkFingerprint(img)};a.assets.__artwork=blob;
      a.assets.pic=await new Promise(r=>art(seed+1).toBlob(r,'image/png'));
      a.elements=[{id:'txt',type:'text',text,x:0,y:0.25,w:0.6,rot:0},{id:'img',type:'image',name:'תמונה',assetId:'pic',x:0,y:-0.2,w:0.3,h:0.4,rot:0,z:0.01,aspect:0.75}];await Studio.save(a,{noHistory:true});return a.id;};
    const pub=await mk('ציבורית',11,'שלום'),priv=await mk(NAME,22,TEXT);
    await Portal.publish(await Studio.load(pub));
    return {pub,priv};},{token:Mock.FAKE_TOKEN,NAME,TEXT});

  // 1) publish privately from the share sheet
  await ed.goto(base+'/index.html#/e/'+ids.priv);await ed.reload();await ed.waitForFunction(()=>App.rec&&App.art,null,{timeout:20000});
  const openShare=async()=>{await ed.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(x=>/לראות ולשתף|שיתוף/.test(x.textContent)&&x.offsetParent);if(b)b.click();});
    await ed.waitForSelector('#portal-private, #portal-private-link',{timeout:20000});await ed.waitForFunction(()=>{const b=document.querySelector('#portal-private, #portal-private-link');return b&&!b.disabled;},null,{timeout:20000});};
  await openShare();await ed.evaluate(()=>document.querySelector('#portal-private').scrollIntoView({block:'center'}));await ed.waitForTimeout(700);await ed.screenshot({path:SHOTS+'1-share-sheet.png'});
  await ed.click('#portal-private');await ed.waitForSelector('#portal-private-go');await ed.waitForTimeout(700);await ed.screenshot({path:SHOTS+'2-ask.png'});
  await ed.click('#portal-private-go');
  await ed.waitForSelector('#portal-url',{timeout:30000});await ed.waitForTimeout(700);await ed.screenshot({path:SHOTS+'3-link.png'});
  const url=await ed.textContent('#portal-url');
  const m=/view\.html#([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]{43})$/.exec(url);assert.ok(m,'a private link with a key: '+url);
  const [,pid,key]=m;
  const kept=await ed.evaluate(async(id)=>(await Studio.load(id)).sealed,ids.priv);assert.equal(kept.id,pid);assert.equal(kept.key,key);assert.equal(kept.alone,true);

  // 2) nothing readable in the repository
  const cat=mock.catalogue();
  assert.equal(cat.items.length,1,'the public list has only the public creation');assert.equal(cat.sealed.length,1);
  const se=cat.sealed[0];assert.equal(se.id,pid);assert.ok(!('name' in se)&&!('trigger' in se),'no name, no recognition data in the catalogue');
  assert.ok(!JSON.stringify(cat).includes(NAME),'the name is not in the catalogue');
  const art=Buffer.from(await ed.evaluate(async(id)=>{const b=await (await Studio.load(id)).assets.__artwork.arrayBuffer();return [...new Uint8Array(b)];},ids.priv));
  const files=[se.desc,se.scene,se.thumb,...se.files];
  for(const f of files){const buf=mock.read(f);assert.ok(buf,'uploaded: '+f);
    for(const s of [NAME,TEXT,'ar-studio/1','brill-sealed/1'])assert.ok(!buf.includes(Buffer.from(s)),f+' does not show "'+s+'"');
    assert.ok(!buf.includes(art.subarray(0,64))&&!buf.includes(Buffer.from([0x89,0x50,0x4e,0x47])),f+' holds no picture');}
  for(const c of mock.commits.values())assert.ok(!c.message.includes(NAME),'no name in the history: '+c.message);
  assert.equal(se.files.length,2,'artwork and picture');

  // 3) the viewer: the link opens it (decrypted); the public portal does not know it
  const v=watch(await ctx.newPage());await v.goto(base+'/view.html#'+pid+'.'+key);
  await v.waitForFunction((id)=>window.__portal&&__portal.mounted().includes(id),pid,{timeout:60000});
  const seen=await v.evaluate(async({pid,key})=>{const cat=await Portal.readCatalogue(),it=await Portal.openSealed(cat,{id:pid,key}),rec=await Portal.loadCreation(it);
    return {name:it.name,alone:it.alone,text:rec.elements.find(e=>e.type==='text').text,art:[...new Uint8Array(await rec.assets.__artwork.arrayBuffer())].slice(0,64),type:rec.assets.__artwork.type,thumb:!!it.thumbURL,list:cat.items.map(i=>i.id)};},{pid,key});
  assert.equal(seen.name,NAME);assert.equal(seen.text,TEXT);assert.deepEqual(seen.art,[...art.subarray(0,64)],'the same artwork, decrypted');assert.equal(seen.type,'image/png');assert.ok(seen.thumb);
  assert.ok(!seen.list.includes(pid),'not in the public list');
  assert.deepEqual(await v.evaluate(()=>__portal.mounted()),[pid],'alone: only the private creation in this visit');
  await v.screenshot({path:SHOTS+'4-viewer.png'});await v.close();
  // a cut or changed key
  for(const bad of [key.slice(0,-1)+(key.endsWith('A')?'B':'A'),key.slice(0,20)]){const q=watch(await ctx.newPage());await q.goto(base+'/view.html#'+pid+'.'+bad);
    await q.waitForFunction(()=>['badlink','gone'].includes(document.body.dataset.state),null,{timeout:30000});
    const st=await q.evaluate(()=>document.body.dataset.state);if(bad.length===43){assert.equal(st,'badlink','a wrong key says the link is not whole');await q.screenshot({path:SHOTS+'5-badlink.png'});}else assert.ok(['badlink','gone'].includes(st));await q.close();}

  // 4) update: same link, unchanged media not uploaded again; with the public creations allowed
  const blobsBefore=mock.calls.filter(c=>c.method==='POST'&&c.path==='/git/blobs').length;
  await ed.keyboard.press('Escape');await ed.waitForTimeout(300);
  await ed.evaluate(()=>{App.rec.elements[0].text='מזל טוב נועה!';App.changed();});await ed.evaluate(()=>App.flush&&App.flush());
  await ed.evaluate(()=>{document.querySelectorAll('dialog[open]').forEach(d=>d.close());});await openShare();
  await ed.click('#portal-private-update');await ed.waitForSelector('#portal-private-public');await ed.check('#portal-private-public');await ed.click('#portal-private-go');
  await ed.waitForSelector('#portal-url',{timeout:30000});assert.equal(await ed.textContent('#portal-url'),url,'the update keeps the link');
  const sent=mock.calls.filter(c=>c.method==='POST'&&c.path==='/git/blobs').length-blobsBefore;
  assert.equal(sent,3,'only the creation file, the description and the catalogue are uploaded again: '+sent);
  const cat2=mock.catalogue();assert.equal(cat2.sealed.length,1);assert.notEqual(cat2.sealed[0].desc,se.desc);assert.equal(mock.read(se.desc),null,'the old description is dropped');
  const v2=watch(await ctx.newPage());await v2.goto(base+'/view.html#'+pid+'.'+key);await v2.waitForFunction((id)=>window.__portal&&__portal.mounted().includes(id),pid,{timeout:60000});
  const t2=await v2.evaluate(async({pid,key})=>{const it=await Portal.openSealed(await Portal.readCatalogue(),{id:pid,key});return {alone:it.alone,text:(await Portal.loadCreation(it)).elements.find(e=>e.type==='text').text};},{pid,key});
  assert.deepEqual(t2,{alone:false,text:'מזל טוב נועה!'});await v2.close();

  // 5) another device: no key kept -> the link is pasted once
  await ed.evaluate(async()=>{delete App.rec.sealed;await App.save({noHistory:true});document.querySelectorAll('dialog[open]').forEach(d=>d.close());});await openShare();
  await ed.click('#portal-private-link');await ed.waitForSelector('#portal-private-paste');await ed.fill('#portal-private-paste',base+'/view.html#'+ids.pub+'.'+key);
  await ed.evaluate(()=>[...document.querySelectorAll('dialog[open] .btn.primary')].pop().click());assert.ok(/לא הקישור/.test(await ed.evaluate(()=>[...document.querySelectorAll('dialog[open] .portal-msg')].pop().textContent)),'another link is refused');
  await ed.fill('#portal-private-paste',url);await ed.evaluate(()=>[...document.querySelectorAll('dialog[open] .btn.primary')].pop().click());
  await ed.waitForSelector('#portal-url',{timeout:10000});assert.equal(await ed.textContent('#portal-url'),url);assert.equal((await ed.evaluate(()=>App.rec.sealed)).key,key);

  // 6) a new link: the old one stops working
  await ed.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));await openShare();
  await ed.click('#portal-private-new');await ed.evaluate(()=>[...document.querySelectorAll('dialog[open] .btn.danger')].pop().click());
  await ed.waitForSelector('#portal-private-go');await ed.click('#portal-private-go');
  await ed.waitForFunction((u)=>{const n=document.querySelector('#portal-url');return n&&n.textContent!==u;},url,{timeout:30000});
  const url2=await ed.textContent('#portal-url');assert.notEqual(url2,url);
  const cat3=mock.catalogue();assert.equal(cat3.sealed.length,1);assert.notEqual(cat3.sealed[0].id,pid);
  for(const f of se.files)assert.equal(mock.read(f),null,'the old encrypted files are dropped: '+f);
  const old=watch(await ctx.newPage());await old.goto(base+'/view.html#'+pid+'.'+key);await old.waitForFunction(()=>document.body.dataset.state==='gone',null,{timeout:30000});await old.close();

  // 7) a copy does not carry the link; removal drops the files
  await ed.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));
  await ed.goto(base+'/index.html#/');await ed.waitForTimeout(800);
  await ed.evaluate(async(id)=>{const cur=await Studio.load(id);const now=Date.now();const copy=Object.assign(JSON.parse(JSON.stringify(Object.assign({},cur,{assets:undefined}))),{id:Studio.newId(),assets:Object.assign({},cur.assets)});delete copy.sealed;window.__copyOk=!copy.sealed;},ids.priv);
  const home=require('fs').readFileSync(require('path').join(__dirname,'../../studio/app/home.js'),'utf8');assert.ok(/delete copy\.sealed/.test(home),'the gallery copy drops the private link');
  await ed.goto(base+'/index.html#/e/'+ids.priv);await ed.reload();await ed.waitForFunction(()=>App.rec&&App.art,null,{timeout:20000});await openShare();
  await ed.click('#portal-private-remove');await ed.evaluate(()=>[...document.querySelectorAll('dialog[open] .btn.danger')].pop().click());
  await ed.waitForSelector('#portal-private',{timeout:30000});
  const cat4=mock.catalogue();assert.equal(cat4.sealed.length,0);assert.equal(cat4.items.length,1,'the public creation stays');
  for(const f of [cat3.sealed[0].desc,cat3.sealed[0].scene,...cat3.sealed[0].files])assert.equal(mock.read(f),null,'removed: '+f);
  for(const f of [cat4.items[0].scene,...cat4.items[0].files])assert.ok(mock.read(f),'the public files stay: '+f);

  const bad=errs.filter(e=>!/camera|getUserMedia|NotFound|NotReadable|WebGL|GL_|xrextras|private link/i.test(e));
  assert.deepEqual(bad,[],'no page errors');
  console.log('PASS portal-private');
}finally{await b.close();server.close();}})().catch(e=>{console.error(e);process.exit(1);});
