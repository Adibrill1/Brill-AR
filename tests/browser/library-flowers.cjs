const {chromium}=require('playwright-core'),assert=require('node:assert/strict'),path=require('node:path');const server=require('../../server/server');
// Four flowers on the 3D shelf's "צמחים ופרחים": a dandelion (Poly Haven, CC0) and a rose, a tulip and a sunflower made for
// this library. Each file is there with its thumbnail, under 3 MB, with one "Loop" clip that bends it by morph targets
// (a breeze); the shelf lists all four as plants; one tap adds a model layer that plays "Loop", and the camera-free
// preview builds it and runs its clip. Headless Chrome, phone-size.
const IDS=['ph-dandelion_01','fl-rose','fl-tulip','fl-sunflower'];
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});try{
  const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const p=await ctx.newPage(),errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(base+'/index.html');await p.waitForFunction(()=>typeof App!=='undefined'&&typeof StarterLibrary!=='undefined');

  // the files: GLB with a Loop clip driving morph weights, thumbnails, sizes
  const files=await p.evaluate(async(ids)=>{const out=[];for(const id of ids){const e=StarterLibrary.entries.find(x=>x.id===id);
    const r=await fetch('library/'+e.file),buf=await r.arrayBuffer(),dv=new DataView(buf),jl=dv.getUint32(12,true),doc=JSON.parse(new TextDecoder().decode(new Uint8Array(buf,20,jl)));
    const t=await fetch('library/'+e.thumb);
    out.push({id,kind:e.kind,clip:e.clip,cat:StarterLibrary.cat3d(e),bytes:buf.byteLength,magic:dv.getUint32(0,true)===0x46546C67,thumb:t.ok,
      anims:(doc.animations||[]).map(a=>a.name),weights:(doc.animations||[]).some(a=>a.channels.some(c=>c.target.path==='weights')),
      morphs:(doc.meshes||[]).some(m=>m.primitives.some(q=>q.targets&&q.targets.length))});}return out;},IDS);
  for(const f of files){
    assert.ok(f.magic&&f.thumb,f.id+': the model and its thumbnail are there');assert.equal(f.kind,'model');
    assert.ok(f.bytes<3e6,f.id+': under 3 MB ('+f.bytes+')');assert.equal(f.clip,'Loop');assert.deepEqual(f.anims,['Loop'],f.id+': one clip, "Loop"');
    assert.ok(f.weights&&f.morphs,f.id+': the clip bends it by morph targets');assert.equal(f.cat,'plant',f.id+': listed with the plants');
  }
  console.log('PASS files:',files.map(f=>f.id+' '+(f.bytes/1e6).toFixed(2)+'MB').join(', '));

  // the 3D shelf: the plants include the four
  const id=await p.evaluate(async()=>{const a=Studio.blankExperience('פרחים');a.target={artRect:{x:0,y:0,w:300,h:400},natural:{w:300,h:400}};
    const c=document.createElement('canvas');c.width=300;c.height=400;const g=c.getContext('2d');g.fillStyle='#406080';g.fillRect(0,0,300,400);
    a.assets.__artwork=await new Promise(r=>c.toBlob(r));a.elements=[];await Studio.save(a);return a.id;});
  await p.goto(base+'/index.html#/e/'+id);await p.waitForSelector('.tab[data-tab="add"]');await p.waitForTimeout(500);
  await p.locator('.tab[data-tab="add"]').click();await p.waitForSelector('dialog[open] .add-grid');
  await p.locator('dialog[open] .add-tile[data-add="model"]').click();await p.waitForSelector('#starter-library[open]');
  await p.locator('#starter-library .library-filters button[data-group="plant"]').click();
  const shown=await p.locator('#starter-library .library-card:not([hidden])').evaluateAll(n=>n.map(x=>x.dataset.libraryId));
  for(const i of IDS)assert.ok(shown.includes(i),i+' on the plants shelf');
  const names=await p.evaluate((ids)=>ids.map(i=>document.querySelector('#starter-library .library-card[data-library-id="'+i+'"]').textContent),IDS);
  assert.ok(names[1].includes('ורד')&&names[2].includes('צבעוני')&&names[3].includes('חמנייה')&&names[0].includes('שן הארי'),'Hebrew names: '+names);
  console.log('PASS shelf: the four flowers under "צמחים ופרחים" ('+shown.length+' plants)');

  // one tap adds a model layer playing Loop
  await p.locator('#starter-library .library-card[data-library-id="fl-rose"]').click();
  await p.waitForFunction(()=>App.rec&&App.rec.elements.length===1,null,{timeout:30000});await p.waitForTimeout(800);
  const el=await p.evaluate(async(id)=>{const r=await Studio.load(id),e=r.elements[0];return {type:e.type,name:e.name,clip:e.modelClip,mime:r.assets[e.assetId].type};},id);
  assert.equal(el.type,'model');assert.equal(el.name,'ורד אדום');assert.equal(el.clip,0,'on its one clip, Loop');assert.equal(el.mime,'model/gltf-binary');
  console.log('PASS editor: one tap adds the rose as a model layer on its Loop clip');

  // the camera-free preview runs the clip
  const q=await ctx.newPage();q.on('pageerror',e=>errs.push(String(e)));await q.goto(base+'/preview.html#'+id);
  await q.waitForFunction(()=>{const c=document.querySelector('[model-clips]')?.components['model-clips'];return c&&c.mixer&&c.mixer.time>0;},null,{timeout:40000});
  const t1=await q.evaluate(()=>document.querySelector('[model-clips]').components['model-clips'].mixer.time);await q.waitForTimeout(800);
  const t2=await q.evaluate(()=>document.querySelector('[model-clips]').components['model-clips'].mixer.time);
  assert.ok(t2>t1,'the breeze plays ('+t1+' -> '+t2+')');await q.close();
  console.log('PASS preview: the rose sways');
  assert.deepEqual(errs,[],'no page errors');
  console.log('PASS library-flowers');
}finally{await b.close();server.close();}})().catch(e=>{console.error(e&&e.stack||e);process.exit(1)});
