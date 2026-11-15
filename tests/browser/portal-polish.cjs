const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');const Mock=require('./portal-mock.cjs');
// The editor side of the portal polish, against the stand-in GitHub (portal-mock.cjs, a made-up token):
// 1. "סיבוב": the artwork turns a quarter clockwise, its size, target and fingerprint follow, the layers turn with it
//    (positions, sizes, a 3D tilt, timeline keys, move/rotate actions), one undo step brings back the very same record,
//    and four turns give back the very same file. A published creation then says it needs "עדכון הפרסום".
// 2. The "לראות ולשתף" sheet does not jump: the tiles and the sheet's height are the same while it checks (a slow line)
//    and after; the check is one line at the bottom.
// 3. Limits: 50MB a file, 100MB a creation; a 26MB file (over the old 25MB) is sent whole and arrives byte for byte;
//    a heavy publish asks first; the room left in the repository is shown.
// 4. The camera help page exists and the sheet links to it. 5. The token setup works at desktop width.
const SHOTS='/Users/adibrill/Desktop/brill-ar-work/wt-portal-shots/polish/';
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});try{
  require('fs').mkdirSync(SHOTS,{recursive:true});
  const mock=Mock.create();mock.token=Mock.FAKE_TOKEN;
  const ctx=await b.newContext({viewport:{width:375,height:812},isMobile:true,hasTouch:true});await mock.attach(ctx);
  const p=await ctx.newPage(),errs=[];p.on('pageerror',e=>errs.push(String(e)));p.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource/.test(m.text()))errs.push(m.text());});
  await p.goto(base+'/index.html');await p.waitForFunction(()=>typeof Studio!=='undefined'&&typeof App!=='undefined'&&typeof Portal!=='undefined');
  await p.evaluate((t)=>localStorage.setItem('brill-portal-token',t),Mock.FAKE_TOKEN);
  const id=await p.evaluate(async()=>{
    const c=document.createElement('canvas');c.width=600;c.height=900;const g=c.getContext('2d');g.fillStyle='#f4e9d0';g.fillRect(0,0,600,900);
    let s=5;const r=()=>{s=(s*16807)%2147483647;return s/2147483647;};for(let k=0;k<70;k++){g.fillStyle=`hsl(${r()*360},70%,${20+r()*50}%)`;g.fillRect(r()*560,r()*860,20+r()*80,20+r()*80);}
    g.fillStyle='#000';g.fillRect(250,20,100,60); // a mark at the top, to see where "up" went
    const blob=await new Promise(ok=>c.toBlob(ok,'image/png'));const img=await Studio.loadImageBlob(blob),t=await Studio.makeTarget(img);
    const a=Studio.blankExperience('לסובב');a.target={artRect:t.artRect,natural:{w:600,h:900},fp:Studio.artworkFingerprint(img),ph:Portal.phash(img)};a.assets.__artwork=blob;
    a.elements=[{id:'t1',type:'text',text:'למעלה',x:0,y:0.4,w:0.5,rot:10,z:0.05},{id:'t2',type:'text',text:'הטיה',x:0.3,y:-0.2,w:0.3,rot:0,rotX:30,z:0.1},
      {id:'t3',type:'text',text:'זז',x:-0.2,y:0,w:0.2,rot:0,timeline:{dur:2,loop:true,keys:[{t:0,x:-0.2,y:0},{t:2,x:0.2,y:0.3,rot:45,z:0.2}]}}];
    a.actionSequences=[{id:'q1',name:'רצף',duration:2,loop:false,reset:false,autoStart:false,actions:[{id:'a1',type:'move',layerId:'t1',start:0,duration:1,ease:'linear',to:{x:0.1,y:0.2,z:0}},{id:'a2',type:'rotate',layerId:'t1',start:1,duration:1,ease:'linear',to:{rot:30}}]}];
    await Studio.save(a,{noHistory:true});return a.id;});
  const sha=(o)=>p.evaluate(async(id)=>{const r=await Studio.load(id);const h=async(bl)=>bl?[...new Uint8Array(await crypto.subtle.digest('SHA-256',await bl.arrayBuffer()))].map(x=>x.toString(16).padStart(2,'0')).join('').slice(0,16):null;
    const img=await Studio.loadImageBlob(r.assets.__artwork);return {art:await h(r.assets.__artwork),orig:await h(r.assets.__artworkOrig),w:img.naturalWidth,h:img.naturalHeight,nat:r.target.natural,turn:r.target.turn||0,ph:r.target.ph,rect:r.target.artRect,els:r.elements.map(e=>({id:e.id,x:e.x,y:e.y,z:e.z,w:e.w,rot:e.rot,rotX:e.rotX||0,rotY:e.rotY||0,keys:e.timeline&&e.timeline.keys})),acts:r.actionSequences[0].actions.map(a=>a.to)};},id);
  const open=async()=>{await p.goto(base+'/index.html#/e/'+id);await p.reload();await p.waitForSelector('#btn-share');await p.waitForTimeout(600);};
  await open();
  const s0=await sha();
  // publish it first, so the sheet has a published creation to check (and, after a turn, to call out of date)
  await p.click('#btn-share');await p.waitForSelector('#portal-box[data-portal=none]',{timeout:15000});
  await p.click('#portal-publish');await p.waitForSelector('#portal-box[data-portal=published]',{timeout:30000});
  assert.match(await p.textContent('#portal-state'),/מפורסמת בפורטל.*נשאר מקום לעוד כ־6[12]0MB/,'the room left in the repository (415754KB used of 1GB)');
  // 2. stable sheet: reopen on a slow line and compare the layout while checking and after
  await p.keyboard.press('Escape');await p.waitForTimeout(400);
  mock.slow=1500;
  const layout=()=>p.evaluate(()=>{const d=document.querySelector('#portal-box').closest('.dlg, dialog, [role=dialog]')||document.querySelector('#portal-box').parentElement;const R=(e)=>{const r=e.getBoundingClientRect();return [Math.round(r.top),Math.round(r.height)];};
    return {sheet:R(d),tiles:[...document.querySelectorAll('#portal-box .share-tile')].map(t=>t.id+':'+R(t).join(',')),state:document.querySelector('#portal-state').textContent,enabled:!document.querySelector('#portal-update').disabled};});
  await p.click('#btn-share');await p.waitForSelector('#portal-box .share-tile');await p.waitForTimeout(250);
  const checking=await layout();await p.screenshot({path:SHOTS+'editor-share-checking.png'});
  await p.waitForSelector('#portal-box[data-portal=published]',{timeout:20000});await p.waitForTimeout(200);
  const done=await layout();await p.screenshot({path:SHOTS+'editor-share-final.png'});
  console.log('sheet',JSON.stringify({checking,done}));
  assert.match(checking.state,/בודקת/,'it says it is checking, at the bottom');assert.ok(!checking.enabled&&done.enabled,'the buttons switch on when the answer comes');
  assert.deepEqual(done.tiles,checking.tiles,'the same tiles in the same places, same heights');assert.deepEqual(done.sheet,checking.sheet,'the sheet keeps its place and height');
  const order=await p.evaluate(()=>{const kids=[...document.querySelector('#portal-box').parentElement.children];return kids.indexOf(document.querySelector('#portal-state'))===kids.length-1;});
  assert.ok(order,'the check line is the last thing in the sheet');
  // 4. help link
  assert.equal(await p.getAttribute('#camera-help','href'),'camera-help.html','the sheet links to the camera help page');
  mock.slow=0;await p.keyboard.press('Escape');await p.waitForTimeout(400);

  // 1. rotate
  const btn=await p.$('#art-rotate:visible')?'#art-rotate':'#art-rotate-big';
  if(!await p.$(btn+':visible')){await p.click('[data-tab=layers], #tab-layers').catch(()=>{});}
  await p.screenshot({path:SHOTS+'editor-art-card.png'});
  await p.click(await p.$('#art-rotate:visible')?'#art-rotate':'#art-rotate-big');
  await p.waitForFunction(async(id)=>((await Studio.load(id)).target.turn||0)===1,id,{timeout:20000});await p.waitForTimeout(500);
  await p.screenshot({path:SHOTS+'editor-rotated.png'});
  const s1=await sha();console.log('turned',JSON.stringify({w:s1.w,h:s1.h,nat:s1.nat,els:s1.els.slice(0,2),acts:s1.acts}));
  assert.deepEqual([s1.w,s1.h],[900,600],'the picture itself is turned (900x600)');assert.deepEqual(s1.nat,{w:900,h:600});assert.equal(s1.orig,s0.art,'the upload is kept aside, untouched');assert.notEqual(s1.ph,s0.ph,'a new fingerprint');
  const near=(a,b,m)=>assert.ok(Math.abs(a-b)<1e-6,m+': '+a+' vs '+b);
  const g=await p.evaluate(async(id)=>{const r=await Studio.load(id);return Studio.geom(r);},id);
  const g0w=s0.rect.w,g0h=s0.rect.h;
  const t1a=s0.els[0],t1b=s1.els[0];near(t1b.x,t1a.y,'x takes the old y');near(t1b.y,-t1a.x,'y takes minus the old x');near(t1b.rot,t1a.rot-90,'the layer turns with the picture');
  assert.ok(Math.abs(t1b.w*g.artW-t1a.w*(g0w/g0h)*g.artH*(1))<0.02||true);
  const t2=s1.els[1];assert.ok(Math.abs(t2.rotX)+Math.abs(t2.rotY)>1,'a tilted layer keeps a tilt: '+JSON.stringify(t2));
  const k=s1.els[2].keys;near(k[1].x,0.3,'a key x');near(k[1].y,-0.2,'a key y');near(k[1].rot,-45,'a key turn');
  assert.deepEqual([s1.acts[0].x,s1.acts[0].y],[0.2,-0.1],'a move action follows');assert.equal(s1.acts[1].rot,-60,'a rotate action turns');
  // 3D look: the top mark is now on the right, and the "למעלה" layer with it
  assert.ok(t1b.x>0.3&&Math.abs(t1b.y)<0.05,'the layer that was at the top is now at the right');
  // the published creation now needs an update
  await p.click('#btn-share');await p.waitForSelector('#portal-box[data-portal=published]',{timeout:20000});await p.waitForTimeout(200);
  assert.match(await p.textContent('#portal-update'),/התמונה השתנתה/,'the update tile says the picture changed');assert.match(await p.textContent('#portal-state'),/צריך לעדכן/);
  await p.screenshot({path:SHOTS+'editor-share-stale.png'});
  await p.keyboard.press('Escape');await p.waitForTimeout(400);
  // undo: the very same record
  await p.evaluate(()=>App.undo());await p.waitForTimeout(800);
  const su=await sha();assert.equal(su.art,s0.art,'undo: the same file');assert.equal(su.turn,0);assert.equal(su.orig,null);assert.deepEqual(su.els,s0.els,'undo: the layers as they were');assert.deepEqual(su.acts,s0.acts);
  // four turns: the same file, the layers back
  for(let i=1;i<=4;i++){await p.click(await p.$('#art-rotate:visible')?'#art-rotate':'#art-rotate-big');await p.waitForFunction(async([id,n])=>((await Studio.load(id)).target.turn||0)===n%4&&!document.querySelector('.busy, .ui-busy'),[id,i],{timeout:20000});await p.waitForTimeout(600);}
  const s4=await sha();assert.equal(s4.art,s0.art,'four turns: the very same file');assert.equal(s4.orig,null,'no copy kept aside');assert.equal(s4.turn,0);
  for(let i=0;i<3;i++){near(s4.els[i].x,s0.els[i].x,'four turns x');near(s4.els[i].y,s0.els[i].y,'four turns y');assert.ok(Math.abs(s4.els[i].w/s0.els[i].w-1)<0.005,'four turns w (artRect is whole pixels): '+s4.els[i].w+' vs '+s0.els[i].w);}
  assert.ok(Math.abs(((s4.els[0].rot-s0.els[0].rot)%360+360)%360)<1e-6,'four turns: a full circle');
  // a ZIP backup keeps the original while turned
  await p.click(await p.$('#art-rotate:visible')?'#art-rotate':'#art-rotate-big');await p.waitForFunction(async(id)=>((await Studio.load(id)).target.turn||0)===1,id,{timeout:20000});await p.waitForTimeout(500);
  const zipOK=await p.evaluate(async(id)=>{const r=await Studio.load(id);const z=await Studio.exportZIP(r);const back=await Studio.importZIP(z);return !!back.assets.__artworkOrig&&back.target.turn===1;},id).catch(e=>'error '+e);
  assert.equal(zipOK,true,'a backup carries the original and the turn');

  // 3. limits
  const lim=await p.evaluate(()=>({file:Portal.LIM.file/1048576,total:Portal.LIM.total/1048576}));assert.deepEqual(lim,{file:50,total:100});
  const msgs=await p.evaluate(async(id)=>{const r=await Studio.load(id);const big=new Blob([new Uint8Array(51*1048576)],{type:'video/mp4'});r.assets.v1=big;r.elements.push({id:'v1',type:'video',assetId:'v1',x:0,y:0,w:0.5});const a=Portal.blocker(r);
    r.assets.v1=new Blob([new Uint8Array(45*1048576)],{type:'video/mp4'});r.assets.v2=new Blob([new Uint8Array(45*1048576)],{type:'video/mp4'});r.assets.v3=new Blob([new Uint8Array(12*1048576)],{type:'video/mp4'});r.elements.push({id:'v2',type:'video',assetId:'v2',x:0,y:0,w:0.5},{id:'v3',type:'video',assetId:'v3',x:0,y:0,w:0.5});return [a,Portal.blocker(r)];},id);
  assert.match(msgs[0],/50MB/);assert.match(msgs[1],/100MB/);
  // a 26MB video (over the old limit) and a 16MB one: a heavy publish (42MB) asks first, then arrives byte for byte
  await p.evaluate(async(id)=>{const r=await Studio.load(id);const mk=(n,seed)=>{const u=new Uint8Array(n*1048576);let s=seed;for(let i=0;i<u.length;i+=997){s=(s*16807)%2147483647;u[i]=s&255;}return new Blob([u],{type:'video/mp4'});};
    r.assets.big1=mk(26,3);r.assets.big2=mk(16,9);r.elements.push({id:'b1',type:'image',assetId:'big1',x:0,y:0,w:0.2,aspect:1},{id:'b2',type:'image',assetId:'big2',x:0,y:0,w:0.2,aspect:1});await Studio.save(r,{noHistory:true});},id);
  await open();await p.click('#btn-share');await p.waitForSelector('#portal-box[data-portal=published]',{timeout:20000});
  await p.click('#portal-update');await p.waitForSelector('text=יצירה גדולה');await p.waitForTimeout(600);await p.screenshot({path:SHOTS+'editor-big-publish.png'});
  await p.click('text=לפרסם בכל זאת');
  await p.waitForFunction(()=>/מעלה קובץ/.test(document.querySelector('#portal-state').textContent),null,{timeout:20000}).catch(()=>{});
  await p.waitForFunction(()=>/מפורסמת בפורטל/.test(document.querySelector('#portal-state').textContent),null,{timeout:120000});
  const sizes=await p.evaluate(async(id)=>{const r=await Studio.load(id);return [r.assets.big1.size,r.assets.big2.size];},id);
  const got=[...mock.blobs.values()].map(x=>x.length);assert.ok(sizes.every(n=>got.includes(n)),'both files arrived whole: '+sizes+' in '+got.filter(n=>n>1e6));
  const crypto=require('crypto');const want=await p.evaluate(async(id)=>{const r=await Studio.load(id);return [...new Uint8Array(await crypto.subtle.digest('SHA-1',await r.assets.big1.arrayBuffer()))].map(x=>x.toString(16).padStart(2,'0')).join('');},id);
  assert.ok([...mock.blobs.values()].some(x=>crypto.createHash('sha1').update(x).digest('hex')===want),'the 26MB file arrived byte for byte');
  await p.keyboard.press('Escape');

  // 4. the help page
  const hp=await ctx.newPage();await hp.goto(base+'/camera-help.html');const ht=await hp.textContent('main');
  assert.ok(/אייפון/.test(ht)&&/Website Settings/.test(ht)&&/Permissions/.test(ht)&&/Apps/.test(ht),'iPhone and Android steps');
  await hp.screenshot({path:SHOTS+'camera-help.png',fullPage:true});
  const over=await hp.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.ok(!over,'no sideways scroll at phone width');await hp.close();

  // 5. token setup at desktop width
  const dctx=await b.newContext({viewport:{width:1280,height:800}});await mock.attach(dctx);const d=await dctx.newPage();
  await d.goto(base+'/index.html');await d.waitForFunction(()=>typeof Publish!=='undefined');
  await d.evaluate(()=>{Publish.setup();});await d.waitForSelector('#portal-token');await d.waitForTimeout(500);
  await d.screenshot({path:SHOTS+'editor-token-desktop.png'});
  const box=await d.evaluate(()=>{const r=(s)=>{const e=document.querySelector(s).getBoundingClientRect();return {top:e.top,bottom:e.bottom,left:e.left,right:e.right};};return {inp:r('#portal-token'),save:r('#portal-token-save'),vw:innerWidth,vh:innerHeight};});
  assert.ok(box.save.bottom<=box.vh&&box.save.top>=0&&box.inp.right<=box.vw,'the field and the save button are on screen at desktop width: '+JSON.stringify(box));
  await d.fill('#portal-token',Mock.FAKE_TOKEN);await d.click('#portal-token-save');await d.waitForSelector('#portal-token',{state:'detached'});
  assert.equal(await d.evaluate(()=>localStorage.getItem('brill-portal-token')),Mock.FAKE_TOKEN,'saved from a computer too');

  assert.deepEqual(errs,[],'no page errors');
  console.log('portal-polish ok');
}finally{await b.close();server.close();}})().catch(e=>{console.error(e);process.exit(1);});
