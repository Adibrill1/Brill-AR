const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');
// The library's nature backdrops ("רקעים מהטבע"): seven filmed-looking loops made for this library (stars, sea, wheat field,
// sunset, clouds, aurora, under water). Each video and thumbnail is there, under 3 MB, square 960x960 and about ten
// seconds long; the add sheet's "רקעים" lists a tile for each, and one tap adds a looping video layer that goes behind
// every other layer (index 0) and covers the whole artwork. Headless Chrome, phone-size.
const IDS=['stars','sea','field','sunset','clouds','aurora','underwater'];
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});try{
  const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const p=await ctx.newPage(),errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(base+'/index.html');await p.waitForFunction(()=>typeof App!=='undefined'&&typeof StarterLibrary!=='undefined');

  // the files
  const files=await p.evaluate(async(ids)=>{const out=[];for(const id of ids){const e=StarterLibrary.backdrops.find(x=>x.id==='bg-'+id);if(!e){out.push({id,missing:true});continue;}
    const r=await fetch('library/'+e.file),blob=await r.blob(),t=await fetch('library/'+e.thumb);
    const v=document.createElement('video');v.muted=true;v.preload='metadata';v.src=URL.createObjectURL(blob);
    await new Promise((ok,no)=>{v.onloadedmetadata=ok;v.onerror=()=>no(new Error(id+': the video does not load'));});
    out.push({id,name:e.name,ok:r.ok,bytes:blob.size,type:blob.type,thumb:t.ok&&(await t.blob()).size>1000,w:v.videoWidth,h:v.videoHeight,secs:v.duration,fill:e.fill,kind:e.kind,group:e.group});}return out;},IDS);
  for(const f of files){
    assert.ok(!f.missing,f.id+' is in the library');assert.ok(f.ok&&f.thumb,f.id+': the video and its thumbnail are there');
    assert.equal(f.kind,'video');assert.equal(f.fill,true);assert.equal(f.group,'backdrop');
    assert.ok(f.bytes<3e6,f.id+': under 3 MB ('+f.bytes+')');assert.equal(f.w,960,f.id+' width');assert.equal(f.h,960,f.id+' height');
    assert.ok(f.secs>=8&&f.secs<=12,f.id+': a loop of 8-12 s ('+f.secs+')');
  }
  assert.equal(new Set(files.map(f=>f.name)).size,IDS.length,'seven different Hebrew names');
  console.log('PASS files:',files.map(f=>f.id+' '+(f.bytes/1e6).toFixed(2)+'MB '+f.secs.toFixed(1)+'s').join(', '));

  // a portrait artwork with nothing on it
  const id=await p.evaluate(async()=>{const a=Studio.blankExperience('רקעים');a.target={artRect:{x:0,y:0,w:300,h:400},natural:{w:300,h:400}};
    const c=document.createElement('canvas');c.width=300;c.height=400;const g=c.getContext('2d');g.fillStyle='#406080';g.fillRect(0,0,300,400);
    a.assets.__artwork=await new Promise(r=>c.toBlob(r));a.elements=[];await Studio.save(a);return a.id;});
  await p.goto(base+'/index.html#/e/'+id);await p.waitForSelector('.tab[data-tab="add"]');await p.waitForTimeout(500);
  const openSheet=async()=>{await p.locator('.tab[data-tab="add"]').click();await p.waitForSelector('dialog[open] .add-grid');
    await p.locator('dialog[open] .add-tile[data-add="pattern"]').click();await p.waitForSelector('.part-tile[data-bg="solid"]');};

  // first a flat colour, so the loop has a layer to go behind
  await openSheet();
  const tiles=await p.locator('.part-tile[data-bg]').evaluateAll(n=>n.map(x=>x.dataset.bg));
  for(const i of IDS)assert.ok(tiles.includes('bg-'+i),'a tile for '+i);
  const names=await p.evaluate((ids)=>ids.map(i=>document.querySelector('.part-tile[data-bg="bg-'+i+'"]').textContent),IDS);
  assert.ok(names[0].includes('כוכבים')&&names[1].includes('ים')&&names[2].includes('חיטה'),'Hebrew names on the tiles: '+names);
  await p.locator('.part-tile[data-bg="solid"]').click();await p.waitForFunction(()=>App.rec.elements.length===1,null,{timeout:15000});await p.waitForTimeout(400);
  console.log('PASS sheet: a tile for each of the seven under "רקעים"');

  // one tap on the sea: a looping video layer at index 0 that covers the artwork
  await openSheet();await p.locator('.part-tile[data-bg="bg-sea"]').click();
  await p.waitForFunction(()=>App.rec.elements.length===2&&App.rec.elements[0].type==='video',null,{timeout:30000});await p.waitForTimeout(800);
  const el=await p.evaluate(async(id)=>{const r=await Studio.load(id),e=r.elements[0],g=Studio.geom(r);
    return {type:e.type,name:e.name,loop:e.loop,x:e.x,y:e.y,w:e.w,h:e.h,rot:e.rot,second:r.elements[1].type,mime:r.assets[e.assetId].type,size:r.assets[e.assetId].size,artW:g.artW,artH:g.artH};},id);
  assert.equal(el.type,'video');assert.equal(el.name,'ים פתוח');assert.equal(el.loop,true,'it loops');assert.equal(el.second,'pattern','the flat colour is now above it');
  assert.ok(/video\/mp4/.test(el.mime)&&el.size>1e5,'the loop itself is stored: '+el.mime+' '+el.size);
  assert.equal(el.x,0);assert.equal(el.y,0);assert.equal(el.rot,0);
  assert.ok(Math.abs(el.w-1)<1e-6&&Math.abs(el.h-1)<1e-6,'it covers the whole artwork: '+el.w+'x'+el.h);
  console.log('PASS editor: one tap puts the sea behind every layer, covering the artwork, on a loop');
  assert.deepEqual(errs,[],'no page errors');
  console.log('PASS library-backdrops');
}finally{await b.close();server.close();}})().catch(e=>{console.error(e&&e.stack||e);process.exit(1)});
