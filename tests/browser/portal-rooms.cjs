const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');const Mock=require('./portal-mock.cjs');
// Rooms on the portal (stand-in GitHub, portal-mock.cjs). Ten creations are published (more than a "small" catalogue):
// four in "חדר א", two in "חדר ב", four without a room. In the share sheet a published creation gets a room: only the
// catalogue changes (no file is uploaded again), and the rooms already used are offered. In the viewer: a creation
// opened by link downloads the others of its room ahead (into Cache Storage) and nothing else; one without a room, its
// catalogue neighbours; a second visit takes the creation's files from Cache Storage (no download); a browser asking
// to save data downloads nothing ahead; a creation over the size limit is not fetched ahead; a catalogue written before
// rooms existed (no room fields) still works.
const SHOTS='/Users/adibrill/Desktop/brill-ar-work/wt-portal-shots/rooms/';
const ANDROID='Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required']});try{
  require('fs').mkdirSync(SHOTS,{recursive:true});
  const mock=Mock.create();mock.token=Mock.FAKE_TOKEN;
  const errs=[];const watch=(p)=>{p.on('pageerror',e=>errs.push(String(e)));return p;};
  const ectx=await b.newContext({viewport:{width:375,height:812},isMobile:true,hasTouch:true});await mock.attach(ectx);
  const ed=watch(await ectx.newPage());await ed.goto(base+'/index.html');await ed.waitForFunction(()=>typeof Portal!=='undefined'&&typeof App!=='undefined');
  const rooms=['חדר א','חדר א','חדר א','חדר א','חדר ב','חדר ב','','','',''];
  const ids=await ed.evaluate(async([token,rooms])=>{localStorage.setItem('brill-portal-token',token);
    const rnd=(s)=>()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
    const art=(seed)=>{const c=document.createElement('canvas');c.width=600;c.height=800;const g=c.getContext('2d'),r=rnd(seed);g.fillStyle=`hsl(${r()*360},40%,70%)`;g.fillRect(0,0,600,800);
      for(let k=0;k<60;k++){g.fillStyle=`hsl(${r()*360},${40+r()*60}%,${15+r()*70}%)`;g.beginPath();g.arc(r()*600,r()*800,8+r()*70,0,7);g.fill();}return c;};
    const out=[];
    for(let i=0;i<rooms.length;i++){const blob=await new Promise(r=>art(500+i).toBlob(r,'image/png')),img=await Studio.loadImageBlob(blob),t=await Studio.makeTarget(img);
      const a=Studio.blankExperience('יצירה '+(i+1));a.target={artRect:t.artRect,natural:{w:600,h:800},fp:Studio.artworkFingerprint(img)};a.assets.__artwork=blob;
      a.elements=[{id:'txt',type:'text',text:'שלום '+(i+1),x:0,y:0,w:0.6,rot:0}];await Studio.save(a,{noHistory:true});await Portal.publish(a,{room:rooms[i]});out.push(a.id);}
    return out;},[Mock.FAKE_TOKEN,rooms]);
  let cat=mock.catalogue();assert.equal(cat.items.length,10);
  assert.deepEqual(ids.map(id=>cat.items.find(i=>i.id===id).room||''),rooms,'rooms stored in the catalogue entries');
  assert.ok(!('room' in cat.items.find(i=>i.id===ids[8])),'no room: no field at all (old catalogues look the same)');

  // the share sheet: a published creation without a room gets one; only the catalogue changes
  await ed.goto(base+'/index.html#/e/'+ids[6]);await ed.reload();await ed.waitForSelector('#btn-share');await ed.waitForTimeout(500);await ed.click('#btn-share');
  await ed.waitForSelector('#portal-box[data-portal=published]',{timeout:20000});
  assert.equal(await ed.inputValue('#portal-room'),'');
  assert.deepEqual(await ed.$$eval('#portal-rooms option',o=>o.map(x=>x.value)),['חדר א','חדר ב'],'the rooms already used are offered, most used first');
  assert.equal(await ed.isVisible('#portal-room-save'),false,'no save button until something changed');
  await ed.screenshot({path:SHOTS+'share-room-empty.png'});
  await ed.fill('#portal-room','  חדר   ב ');assert.equal(await ed.isVisible('#portal-room-save'),true);
  await ed.screenshot({path:SHOTS+'share-room-typed.png'});
  const blobsBefore=mock.calls.filter(c=>c.method==='POST'&&c.path==='/git/blobs').length;
  await ed.click('#portal-room-save');
  await ed.waitForFunction(()=>document.querySelector('#portal-room')&&document.querySelector('#portal-room').value==='חדר ב'&&document.querySelector('#portal-box').dataset.portal==='published',null,{timeout:20000});
  cat=mock.catalogue();assert.equal(cat.items.find(i=>i.id===ids[6]).room,'חדר ב','saved, tidied (one line, single spaces)');
  assert.equal(mock.calls.filter(c=>c.method==='POST'&&c.path==='/git/blobs').length-blobsBefore,1,'only the catalogue was uploaded, no media again');
  assert.equal(await ed.isVisible('#portal-room-save'),false);
  await ed.screenshot({path:SHOTS+'share-room-saved.png'});
  // an update of the creation keeps its room
  await ed.click('#portal-update');await ed.waitForFunction(()=>document.querySelector('#portal-box').dataset.portal==='published'&&!document.querySelector('#portal-update').disabled,null,{timeout:30000});
  assert.equal(mock.catalogue().items.find(i=>i.id===ids[6]).room,'חדר ב','an update keeps the room');
  // and it can leave the room again
  await ed.fill('#portal-room','');await ed.click('#portal-room-save');
  await ed.waitForFunction(()=>document.querySelector('#portal-room').value===''&&!document.querySelector('#portal-room-save').offsetParent,null,{timeout:20000});
  assert.ok(!('room' in mock.catalogue().items.find(i=>i.id===ids[6])),'room removed');

  // the viewer
  const viewer=async(id,init)=>{const c=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,userAgent:ANDROID,permissions:['camera']});await mock.attach(c);
    await c.addInitScript(()=>{const md=navigator.mediaDevices;if(md){const o=md.getUserMedia.bind(md);md.getUserMedia=(x)=>{if(x&&x.video&&x.video.facingMode)delete x.video.facingMode;return o(x);};}});
    if(init)await c.addInitScript(init);
    return c;};
  const open=async(c,id)=>{const p=watch(await c.newPage()),raws=[];p.on('request',r=>{if(r.url().startsWith('https://raw.githubusercontent.com/'))raws.push(r.url().split('/published/')[1]);});
    await p.goto(base+'/view.html#'+id);await p.waitForFunction((id)=>window.__portal&&__portal.mounted().includes(id),id,{timeout:60000});return {p,raws};};
  const filesOf=(id)=>{const it=cat.items.find(i=>i.id===id);return [it.scene,...it.files];};
  cat=mock.catalogue();
  // 1) a creation of "חדר א" by link: the other three of the room come ahead, nothing else
  const v1=await viewer();let {p,raws}=await open(v1,ids[0]);
  await p.waitForFunction((n)=>__portal.ahead().ids.length>=n,3,{timeout:30000});await p.waitForTimeout(1500);
  let ah=await p.evaluate(()=>__portal.ahead());console.log('room A',JSON.stringify(ah));
  assert.deepEqual(ah.ids.slice().sort(),[ids[1],ids[2],ids[3]].sort(),'the rest of the room, and only it');
  for(const id of [ids[1],ids[2],ids[3]])for(const f of filesOf(id))assert.ok(raws.includes(f),'downloaded ahead: '+f);
  for(const id of ids.slice(4))assert.ok(!raws.includes(cat.items.find(i=>i.id===id).scene),'another room or none: not downloaded');
  assert.ok(ah.at>=1&&ah.at<=2&&ah.budget>0&&ah.spent<=ah.budget,'limits: '+JSON.stringify(ah));
  const boxed=await p.evaluate(async(fs)=>{const c=await caches.open('brill-portal-files-v1');const r=[];for(const f of fs)r.push(!!(await c.match(Portal.raw()+f)));return r;},filesOf(ids[2]));
  assert.ok(boxed.every(Boolean),'kept in Cache Storage');
  await p.close();
  // 2) the second visit (the same phone): a room member opens without downloading its files
  ({p,raws}=await open(v1,ids[2]));
  assert.ok(raws.includes('index.json'),'the catalogue is read fresh');
  assert.deepEqual(raws.filter(f=>filesOf(ids[2]).includes(f)),[],'its files came from Cache Storage');
  await p.close();await v1.close();
  // 3) without a room: the catalogue's neighbours
  const v2=await viewer();({p,raws}=await open(v2,ids[8]));
  await p.waitForFunction(()=>__portal.ahead().ids.length>=3,null,{timeout:30000});
  ah=await p.evaluate(()=>__portal.ahead());console.log('no room',JSON.stringify(ah));
  const i8=cat.items.findIndex(i=>i.id===ids[8]);
  assert.deepEqual(ah.ids.slice().sort(),[cat.items[i8+1],cat.items[i8-1],cat.items[i8+2]].filter(Boolean).map(i=>i.id).sort(),'neighbours');
  await p.close();await v2.close();
  // 4) the browser asks to save data: nothing ahead
  const v3=await viewer(null,()=>{Object.defineProperty(navigator,'connection',{configurable:true,get:()=>({saveData:true,type:'cellular',effectiveType:'4g'})});});
  ({p,raws}=await open(v3,ids[0]));await p.waitForTimeout(4000);
  ah=await p.evaluate(()=>__portal.ahead());assert.deepEqual(ah.ids,[],'save data: nothing downloaded ahead');assert.equal(ah.budget,0);
  assert.ok(!raws.includes(cat.items.find(i=>i.id===ids[1]).scene),'not even the scene file');
  await p.close();await v3.close();
  // 5) a big creation in the room is not fetched ahead (over the per-creation limit); cellular: one at a time, smaller budget
  mock.sneak((files,put)=>{const c=JSON.parse(mock.read('index.json').toString());c.items.find(i=>i.id===ids[2]).bytes=200*1048576;files.set('index.json',put(JSON.stringify(c)));});
  const v4=await viewer(null,()=>{Object.defineProperty(navigator,'connection',{configurable:true,get:()=>({saveData:false,type:'cellular',effectiveType:'4g'})});});
  ({p,raws}=await open(v4,ids[0]));await p.waitForFunction(()=>__portal.ahead().ids.length>=2,null,{timeout:30000});await p.waitForTimeout(1500);
  ah=await p.evaluate(()=>__portal.ahead());console.log('cellular',JSON.stringify(ah));
  assert.deepEqual(ah.ids.slice().sort(),[ids[1],ids[3]].sort(),'the big one is left for when it is met');assert.equal(ah.at,1);assert.equal(ah.budget,40*1048576);
  await p.close();await v4.close();
  // 6) a catalogue from before rooms (no room fields anywhere) still opens and behaves as before
  mock.sneak((files,put)=>{const c=JSON.parse(mock.read('index.json').toString());c.items.forEach(i=>{delete i.room;});files.set('index.json',put(JSON.stringify(c)));});
  const v5=await viewer();({p,raws}=await open(v5,ids[0]));await p.waitForFunction(()=>__portal.ahead().ids.length>=1,null,{timeout:30000});await p.close();await v5.close();
  assert.deepEqual(errs,[],'no page errors');
  console.log('portal-rooms ok');
}finally{await b.close();server.close();}})().catch(e=>{console.error(e);process.exit(1);});
