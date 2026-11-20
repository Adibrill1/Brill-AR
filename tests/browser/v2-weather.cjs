const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');
// The add sheet without "מהספרייה": a "מזג אוויר" tile (a drawn sun and smoke with kind, size, intensity, tint and
// speed; the ten filmed loops; the six weather particles), stickers under "תמונה", the scenes gone. The sun and smoke
// are pattern layers above the others, valid for publishing, drawn in the flat view, the 3D view and the preview.
// Phone size, touch. Headless Chrome.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
 try{
  const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const p=await ctx.newPage(),errs=[];p.on('pageerror',e=>errs.push(String(e)));p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await p.goto(base+'/index.html');await p.waitForFunction(()=>typeof Studio!=='undefined'&&typeof App!=='undefined');
  const id=await p.evaluate(async()=>{const a=Studio.blankExperience('מזג אוויר');a.target={artRatio:1,artRect:{x:0,y:0,w:300,h:400},natural:{w:300,h:400}};
    const c=document.createElement('canvas');c.width=300;c.height=400;const g=c.getContext('2d');g.fillStyle='#406080';g.fillRect(0,0,300,400);
    a.assets.__artwork=await new Promise(r=>c.toBlob(r));a.elements=[];await Studio.save(a);return a.id;});
  await p.goto(base+'/index.html#/e/'+id);await p.waitForSelector('#btn-add');await p.waitForTimeout(600);
  const layers=async()=>{if(await p.locator('.tab[data-tab="layers"]').isVisible())await p.locator('.tab[data-tab="layers"]').click();};

  // nothing of the library is lost: every entry is reachable from a tile, and the scenes are gone
  const lib=await p.evaluate(()=>{const L=StarterLibrary,reach=new Set([...L.backdrops,...L.weather,...L.weatherParticles,...L.stickers,...L.particleStyles].map(e=>e.id));
    L.entries.filter(e=>e.kind==='model').forEach(e=>reach.add(e.id));return {lost:L.entries.filter(e=>!reach.has(e.id)).map(e=>e.id),scenes:L.entries.filter(e=>e.kind==='scene').length};});
  assert.deepEqual(lib.lost,[],'every library item has a tile');assert.equal(lib.scenes,0,'no scenes');

  await layers();await p.locator('#btn-add').click();await p.waitForSelector('dialog[open] .add-tile');
  assert.equal(await p.locator('dialog[open] .add-library').count(),0,'no "from the library" button');
  assert.deepEqual(await p.locator('dialog[open] .add-tile').evaluateAll(n=>n.map(x=>x.dataset.add)),['image','video','text','pattern','weather','particles','model','sound']);
  await p.locator('dialog[open] .add-tile[data-add="weather"]').click();await p.waitForSelector('dialog[open] .part-tile[data-weather="sun"]');
  const ids=await p.locator('dialog[open] .part-tile[data-weather]').evaluateAll(n=>n.map(x=>x.dataset.weather));
  assert.equal(ids.length,18);assert.deepEqual(ids.slice(0,2),['sun','smoke'],'sun and smoke first');
  assert.equal(await p.locator('dialog[open] .dialog-title, dialog[open] h2').first().textContent().then(t=>t.trim()),'איזה מזג אוויר?');

  // the sun: on top, with its own controls
  await p.locator('dialog[open] .part-tile[data-weather="sun"]').click();
  await p.waitForFunction(()=>App.rec.elements.length===1,null,{timeout:20000});await p.waitForTimeout(500);
  let el=await p.evaluate(()=>{const e=App.rec.elements[0];return {type:e.type,look:e.pattern.look,name:e.name,ok:Studio.validPattern(e),weather:Studio.isWeather(e),sel:App.selId===e.id};});
  assert.deepEqual(el,{type:'pattern',look:'sun',name:'שמש',ok:true,weather:true,sel:true});
  const ins=p.locator('#inspector');
  for(const k of ['שמש קורנת','שמש באובך','הבזק עדשה','שמש שוקעת'])assert.ok(await ins.getByText(k,{exact:true}).count(),'kind '+k);
  for(const l of ['גודל','עוצמה','גוון'])assert.ok(await ins.locator('.ctl-label',{hasText:l}).count(),'control '+l);
  assert.equal(await ins.getByText('גרדיאנט נוזלי').count(),0,'no background looks on a sun');
  await ins.getByText('הבזק עדשה',{exact:true}).click();await p.waitForTimeout(200);
  const pow=ins.locator('input.num[aria-label="עוצמה (מספר)"]');await pow.fill('90');await pow.dispatchEvent('change');
  const sz=ins.locator('input.num[aria-label="גודל (מספר)"]').first();await sz.fill('80');await sz.dispatchEvent('change');await p.waitForTimeout(300);
  el=await p.evaluate(()=>{const e=App.rec.elements[0];return {kind:e.pattern.kind,power:e.pattern.power,w:e.w,square:Math.abs(e.h/e.w-1)<1e-6||null,ok:Studio.validPattern(e)};});
  assert.equal(el.kind,2);assert.equal(el.power,0.9);assert.equal(el.w,0.8);assert.ok(el.ok,'still valid');
  // the tint: a ready swatch sets all three colours
  await ins.locator('.swatches button').nth(3).click();await p.waitForTimeout(200);
  assert.deepEqual(await p.evaluate(()=>App.rec.elements[0].pattern.colors),['#ff7b3a','#ff7b3a','#ff7b3a']);
  // drawn in the flat view: the pixels at the sun's middle are bright
  const mid=await p.evaluate(()=>{const c=document.querySelector('#preview'),e=App.rec.elements[0],g=c.getContext('2d'),d=g.getImageData(0,0,c.width,c.height).data;let m=0;for(let i=0;i<d.length;i+=4)m=Math.max(m,d[i]+d[i+1]+d[i+2]);return m;});
  assert.ok(mid>700,'a bright sun in the flat view ('+mid+')');

  // smoke, and a sticker under "תמונה"
  await layers();await p.locator('#btn-add').click();await p.locator('dialog[open] .add-tile[data-add="weather"]').click();await p.locator('dialog[open] .part-tile[data-weather="smoke"]').click();
  await p.waitForFunction(()=>App.rec.elements.length===2,null,{timeout:20000});await p.waitForTimeout(400);
  for(const k of ['עשן עולה','עשן סמיך','אדים','עשן נודד'])assert.ok(await ins.getByText(k,{exact:true}).count(),'kind '+k);
  await layers();await p.locator('#btn-add').click();await p.locator('dialog[open] .add-tile[data-add="image"]').click();await p.waitForSelector('dialog[open] .part-tile[data-image="own"]');
  assert.equal(await p.locator('dialog[open] .part-tile[data-image]').count(),13,'own picture and twelve stickers');
  await p.locator('dialog[open] .part-tile[data-image="st-heart"]').click();await p.waitForFunction(()=>App.rec.elements.length===3,null,{timeout:20000});
  assert.equal(await p.evaluate(()=>App.rec.elements[2].type),'image');
  const rows=await p.evaluate(()=>[...document.querySelectorAll('.layer-row')].map(r=>r.textContent));
  assert.ok(rows.some(t=>t.includes('מזג אוויר')),'a sun row says weather: '+rows.join(' | '));

  // the 3D view and the preview draw them without errors
  await p.locator('#btn-3d').click();await p.waitForFunction(()=>document.querySelector('#stage').classList.contains('is-3d'),null,{timeout:20000});
  await p.waitForFunction(()=>document.querySelectorAll('#editor-3d-host [studio-weather]').length===2,null,{timeout:20000});await p.waitForTimeout(1500);
  // drawn small (at most 320 pixels a side) and shown on one sheet when flat
  let wx=await p.evaluate(()=>[...document.querySelectorAll('#editor-3d-host [studio-weather]')].map(e=>{const c=e.components['studio-weather'];return {sheets:c.group.children.length,rt:c.targets.map(t=>Math.max(t.width,t.height))};}));
  assert.deepEqual(wx.map(w=>w.sheets),[1,1]);assert.ok(wx.every(w=>w.rt.every(n=>n<=320)),'small pictures '+JSON.stringify(wx));
  // the switch to 3D: the sun gets its glow and lifts off, the smoke stands out in three slices
  for(const id of [0,1]){await p.evaluate((i)=>App.select(App.rec.elements[i].id),id);await p.waitForTimeout(300);await ins.getByText('תלת־ממד',{exact:true}).last().click();await p.waitForTimeout(400);}
  assert.deepEqual(await p.evaluate(()=>App.rec.elements.slice(0,2).map(e=>[e.pattern.depth3d,Studio.validPattern(e)])),[[true,true],[true,true]]);
  await p.waitForFunction(()=>{const n=[...document.querySelectorAll('#editor-3d-host [studio-weather]')].map(e=>e.components['studio-weather'].group&&e.components['studio-weather'].group.children.length);return n.join()==='2,3';},null,{timeout:20000});
  wx=await p.evaluate(()=>{const e=document.querySelector('#editor-3d-host [studio-weather]').components['studio-weather'];return e.group.children.map(m=>+m.position.z.toFixed(3));});
  assert.ok(wx[1]>wx[0],'the sun stands in front of its glow '+wx);
  const q=await ctx.newPage();q.on('pageerror',e=>errs.push('preview: '+e));await q.goto(base+'/preview.html#'+id);
  await q.waitForFunction(()=>document.querySelectorAll('a-scene [studio-weather]').length===2,null,{timeout:30000});await q.waitForTimeout(1500);
  const prog=await q.evaluate(()=>{const r=document.querySelector('a-scene').renderer;return [...document.querySelectorAll('a-scene [studio-weather]')].map(e=>{const c=e.components['studio-weather'],pr=r.properties.get(c.quads[0].mesh.material).currentProgram;return !!pr&&(pr.diagnostics?pr.diagnostics.runnable:true)&&c.t>0;});});
  assert.deepEqual(prog,[true,true],'the shader compiles in the preview and runs');
  assert.equal(errs.filter(e=>!/favicon|404/.test(e)).length,0,'no page errors: '+errs.join(' | '));
  console.log('weather sheet: all checks pass');
 }finally{await b.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
