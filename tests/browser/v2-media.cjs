const {chromium}=require('playwright-core'),assert=require('node:assert/strict'),path=require('node:path');const server=require('../../server/server');
// The new studio: files become layers through the "add" sheet and the real file picker (picture, GIF, video, 3D model),
// a layer is dragged on the stage with the finger or the mouse, and everything survives a reload. Headless Chrome; not an iPhone.
const fx=(n)=>path.join(__dirname,'../fixtures',n);
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});try{
for(const phone of [true,false]){
  const ctx=await b.newContext(phone?{viewport:{width:390,height:844},isMobile:true,hasTouch:true}:{viewport:{width:1280,height:900}});
  const p=await ctx.newPage(),errs=[],tag=phone?'phone':'computer';p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(base+'/index.html');await p.waitForFunction(()=>typeof Studio!=='undefined'&&typeof App!=='undefined');
  const id=await p.evaluate(async()=>{const a=Studio.blankExperience('קבצים');a.target={artRect:{x:0,y:0,w:300,h:400},natural:{w:300,h:400}};
    const c=document.createElement('canvas');c.width=300;c.height=400;const g=c.getContext('2d');g.fillStyle='#204080';g.fillRect(0,0,300,400);
    a.assets.__artwork=await new Promise(r=>c.toBlob(r));await Studio.save(a);return a.id;});
  await p.goto(base+'/index.html#/e/'+id);await p.waitForSelector('#stage-tools:not([hidden])');
  const n=()=>p.evaluate(()=>App.rec.elements.length);
  const addFile=async(tile,file,want)=>{
    if(phone){await p.locator('.tab[data-tab="layers"]').click();await p.waitForTimeout(150);}
    await p.locator('#btn-add').click();
    const [fc]=await Promise.all([p.waitForEvent('filechooser'),p.locator('.add-tile',{has:p.locator('.add-name',{hasText:tile})}).click()]);await fc.setFiles(fx(file));
    await p.waitForFunction((w)=>App.rec.elements.length===w&&!document.querySelector('.busy'),want,{timeout:60000});await p.waitForTimeout(500);
  };
  await addFile('תמונה','red.png',1);await addFile('תמונה','crop-animated.gif',2);await addFile('סרטון','visual-2x1.mp4',3);await addFile('מודל','animated.glb',4);
  const rec=await p.evaluate(()=>Studio.load(App.rec.id));
  assert.deepEqual(rec.elements.map(e=>e.type),['image','image','video','model'],tag+': four layers of the right kinds, in order');
  assert.ok(rec.elements.every(e=>(e.assetId&&rec.assets[e.assetId])),tag+': every layer has its file saved');
  assert.equal(await p.locator('.layer-row').count(),4,tag+': four rows');
  assert.equal(await p.locator('.layer-row').first().locator('.layer-name').textContent().then(s=>!!s),true,tag+': rows are named');

  // drag the first picture on the stage
  if(phone){await p.locator('.tab[data-tab="layers"]').click();}
  await p.locator('.layer-row').last().click();await p.waitForTimeout(400); // the list shows the top layer first; the last row is the first picture
  const sel=await p.evaluate(()=>App.sel().id);assert.equal(sel,rec.elements[0].id,tag+': the bottom row is the first layer');
  const before=await p.evaluate(()=>({x:App.sel().x,y:App.sel().y}));
  const c=await p.locator('#preview').boundingBox(),cx=c.x+c.width/2,cy=c.y+c.height/2;
  if(phone){const cdp=await ctx.newCDPSession(p);const t=(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y,id:1}]});
    await t('touchStart',cx,cy);for(let i=1;i<=6;i++)await t('touchMove',cx+i*6,cy-i*4);await t('touchEnd');}
  else{await p.mouse.move(cx,cy);await p.mouse.down();await p.mouse.move(cx+36,cy-24,{steps:6});await p.mouse.up();}
  await p.waitForTimeout(900);
  const after=await p.evaluate(()=>({x:App.sel()&&App.sel().x,y:App.sel()&&App.sel().y,id:App.sel()&&App.sel().id}));
  assert.ok(after.x>before.x+0.02&&after.y>before.y+0.02,tag+': dragging moves the layer right and up ('+JSON.stringify([before,after])+')');
  const saved=await p.evaluate((i)=>Studio.load(App.rec.id).then(r=>r.elements.find(e=>e.id===i)),after.id);
  assert.ok(Math.abs(saved.x-after.x)<1e-6,tag+': and the new place is saved');
  // a tap on the empty stage lets go of the layer
  if(phone)await p.touchscreen.tap(c.x+4,c.y+4);else await p.mouse.click(c.x+4,c.y+4);await p.waitForTimeout(400);

  // reload: all of it is still there
  await p.reload();await p.waitForSelector('.layer-row');await p.waitForTimeout(800);
  assert.equal(await p.locator('.layer-row').count(),4,tag+': four layers after a reload');
  assert.deepEqual(errs,[],tag+': no page errors');await ctx.close();
}
console.log('PASS v2-media: picture, GIF, video and 3D model through the add sheet and file picker; dragging a layer on the stage; saved across a reload; phone and computer');
}finally{await b.close();server.close();}})().catch(e=>{console.error(e&&e.stack||e);process.exit(1)});
