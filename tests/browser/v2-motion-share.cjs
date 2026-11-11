const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');
// The new studio: a motion path (start, a second step, hide from a step, delete the path), the ready-made motion chips,
// the flat/3D switch, the library, and "see and share" (backup file ready, try without a camera, and the way back from
// the preview to the same creation). Phone and computer. Headless Chrome; not an iPhone.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});try{
for(const phone of [true,false]){
  const ctx=await b.newContext(phone?{viewport:{width:390,height:844},isMobile:true,hasTouch:true}:{viewport:{width:1280,height:900}});
  const p=await ctx.newPage(),errs=[],tag=phone?'phone':'computer';p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(base+'/index.html');await p.waitForFunction(()=>typeof Studio!=='undefined'&&typeof App!=='undefined');
  const id=await p.evaluate(async()=>{const a=Studio.blankExperience('תנועה');a.target={artRect:{x:0,y:0,w:300,h:400},natural:{w:300,h:400}};
    const c=document.createElement('canvas');c.width=300;c.height=400;const g=c.getContext('2d');g.fillStyle='#204080';g.fillRect(0,0,300,400);g.fillStyle='#ffcc00';g.fillRect(40,60,120,90);
    a.assets.__artwork=await new Promise(r=>c.toBlob(r));
    a.elements=[{id:'t1',name:'כותרת',type:'text',text:'שלום',color:'#ffffff',x:0,y:0,w:.5,rot:0}];a.elements.forEach(Studio.normEl);await Studio.save(a);return a.id;});
  const el=()=>p.evaluate(()=>Studio.load(App.rec.id).then(r=>r.elements[0]));
  const btn=(t)=>p.locator('#inspector button',{hasText:t}).first();
  await p.goto(base+'/index.html#/e/'+id);await p.waitForSelector('.layer-row');
  await p.locator('.layer-row').click();await p.locator('.tab[data-tab="motion"]').click();await p.waitForTimeout(300);

  // a ready-made motion
  await p.locator('#inspector .chip',{hasText:'ריחוף'}).click();await p.waitForTimeout(800);
  assert.equal((await el()).anim,'float',tag+': the float chip is saved');
  // a motion path
  await btn('להתחיל מסלול תנועה').click();await p.waitForTimeout(800);
  let e=await el();assert.equal(e.timeline.keys.length,1,tag+': the path starts with one step');assert.equal(e.anim,'none',tag+': and replaces the ready-made motion');
  assert.ok(await p.locator('#time-chip').isVisible(),tag+': the stage says it is stopped at a moment');
  assert.equal(await p.locator('.tl-key').count(),1,tag+': one diamond');
  await p.evaluate(()=>App.freeze(2));await p.waitForTimeout(200);
  await btn('שלב חדש כאן').click();await p.waitForTimeout(800);
  e=await el();assert.deepEqual(e.timeline.keys.map(k=>k.t),[0,2],tag+': a second step at 2 seconds');
  assert.equal(await p.locator('.tl-key').count(),2,tag+': two diamonds');
  await btn('להסתיר מכאן').click();await p.waitForTimeout(800);
  e=await el();assert.equal(e.timeline.keys[1].visible,false,tag+': hidden from the second step');
  assert.equal(await p.locator('.tl-key.hide').count(),1,tag+': and the diamond shows it');
  await btn('להראות מכאן').click();await p.waitForTimeout(600);
  assert.notEqual((await el()).timeline.keys[1].visible,false,tag+': shown again');
  // play: the stage goes back to live
  await p.locator('.tl-play').click();await p.waitForTimeout(400);
  assert.equal(await p.locator('#time-chip').isVisible(),false,tag+': playing hides the "stopped" chip');
  // delete the whole path (asks first)
  await btn('מחיקת כל המסלול').click();await p.locator('dialog[open] .btn.danger, dialog[open] .btn.primary').last().click();await p.waitForTimeout(800);
  assert.equal((await el()).timeline,undefined,tag+': the path is gone');
  assert.equal(await p.locator('.tl-key').count(),0,tag+': and the track with it');

  // flat / 3D
  await p.locator('#btn-3d').click();await p.waitForFunction(()=>document.querySelector('#stage').classList.contains('is-3d'),null,{timeout:20000});
  assert.ok(await p.locator('#editor-3d-host').isVisible(),tag+': the 3D view opens');
  assert.equal(await p.locator('#btn-snap').isVisible(),false,tag+': flat-only tools step aside');
  await p.locator('#btn-2d').click();await p.waitForTimeout(600);
  assert.equal(await p.evaluate(()=>document.querySelector('#stage').classList.contains('is-3d')),false,tag+': back to flat');

  // the library adds a layer
  if(phone)await p.locator('.tab[data-tab="layers"]').click();
  await p.locator('#btn-add').click();await p.locator('.add-library').click();await p.waitForSelector('#starter-library[open] .library-card');
  await p.locator('#starter-library .library-card').first().click();
  await p.waitForFunction(()=>App.rec.elements.length===2,null,{timeout:30000});await p.waitForTimeout(800);
  assert.equal(await p.locator('.layer-row').count(),2,tag+': the library item became a layer');

  // see and share
  await p.locator('#btn-share').click();await p.waitForSelector('dialog[open] .share-tile');
  await p.waitForFunction(()=>[...document.querySelectorAll('dialog[open] .share-tile')].every(t=>!t.disabled),null,{timeout:30000});
  assert.match(await p.locator('.share-state').textContent(),/גודל הקובץ/,tag+': the backup file is ready');
  const [dl]=await Promise.all([p.waitForEvent('download'),p.locator('.share-tile',{hasText:'שמירת גיבוי'}).click()]);
  assert.match(dl.suggestedFilename(),/\.zip$/,tag+': a zip comes down');
  await p.locator('.share-tile',{hasText:'לנסות בלי מצלמה'}).click();await p.waitForURL(/preview\.html#/);
  assert.ok(p.url().endsWith('#'+id),tag+': the preview opens on this creation');
  // the old-style address (the way the player and preview link back) opens the same creation
  await p.goto(base+'/index.html#'+id);await p.waitForSelector('#editor:not([hidden]) .layer-row');
  assert.equal(await p.locator('#rec-name').inputValue(),'תנועה',tag+': back in the same creation');
  // the backup opens as a new creation
  const zipPath=await dl.path();await p.locator('#btn-back').click();await p.waitForSelector('#home-grid:not([hidden])');
  const [fc]=await Promise.all([p.waitForEvent('filechooser'),p.locator('#btn-import').click()]);await fc.setFiles({name:'backup.zip',mimeType:'application/zip',buffer:require('node:fs').readFileSync(zipPath)});
  await p.waitForFunction(()=>document.querySelectorAll('article.card').length===2,null,{timeout:30000});
  assert.deepEqual(errs,[],tag+': no page errors');await ctx.close();
}
console.log('PASS v2-motion-share: motion chips, path (start/step/hide/play/delete), flat and 3D, library item, share sheet with backup, preview and the way back, opening a backup; phone and computer');
}finally{await b.close();server.close();}})().catch(e=>{console.error(e&&e.stack||e);process.exit(1)});
