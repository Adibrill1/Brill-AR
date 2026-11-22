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
  assert.deepEqual(await p.locator('dialog[open] .add-tile').evaluateAll(n=>n.map(x=>x.dataset.add)),['image','video','text','pattern','weather','particles','codefx','model','sound','split']);
  await p.locator('dialog[open] .add-tile[data-add="weather"]').click();await p.waitForSelector('dialog[open] .part-tile[data-weather="sun"]');
  const ids=await p.locator('dialog[open] .part-tile[data-weather]').evaluateAll(n=>n.map(x=>x.dataset.weather));
  assert.equal(ids.length,22);assert.deepEqual(ids.slice(0,3),['sun','smoke','fire'],'sun, smoke and fire first');
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
  // the rays: length and density on the radiant sun and the lens flare, not on the hazy one
  await ins.getByText('שמש קורנת',{exact:true}).click();await p.waitForTimeout(300);
  for(const l of ['אורך הקרניים','צפיפות הקרניים'])assert.ok(await ins.locator('.ctl-label',{hasText:l}).count(),'control '+l);
  const rl=ins.locator('input.num[aria-label="אורך הקרניים (מספר)"]');await rl.fill('90');await rl.dispatchEvent('change');
  const rd=ins.locator('input.num[aria-label="צפיפות הקרניים (מספר)"]');await rd.fill('20');await rd.dispatchEvent('change');await p.waitForTimeout(200);
  assert.deepEqual(await p.evaluate(()=>{const q=App.rec.elements[0].pattern;return [q.rayLen,q.rayDen,Studio.validPattern(App.rec.elements[0])];}),[0.9,0.2,true]);
  await ins.getByText('שמש באובך',{exact:true}).click();await p.waitForTimeout(300);
  assert.equal(await ins.locator('.ctl-label',{hasText:'אורך הקרניים'}).count(),0,'no rays on a hazy sun');
  await ins.getByText('הבזק עדשה',{exact:true}).click();await p.waitForTimeout(300);
  // drawn in the flat view: the pixels at the sun's middle are bright
  const mid=await p.evaluate(()=>{const c=document.querySelector('#preview'),e=App.rec.elements[0],g=c.getContext('2d'),d=g.getImageData(0,0,c.width,c.height).data;let m=0;for(let i=0;i<d.length;i+=4)m=Math.max(m,d[i]+d[i+1]+d[i+2]);return m;});
  assert.ok(mid>700,'a bright sun in the flat view ('+mid+')');

  // fire: four kinds, its own tints, drawn bright in the flat view, valid; then taken away again
  await layers();await p.locator('#btn-add').click();await p.locator('dialog[open] .add-tile[data-add="weather"]').click();await p.locator('dialog[open] .part-tile[data-weather="fire"]').click();
  await p.waitForFunction(()=>App.rec.elements.length===2,null,{timeout:20000});await p.waitForTimeout(500);
  for(const k of ['להבת נר','מדורה','קיר אש','גחלים לוחשות'])assert.ok(await ins.getByText(k,{exact:true}).count(),'kind '+k);
  assert.ok(await ins.locator('.ctl-label',{hasText:'גובה הלהבה'}).count(),'flame height');
  for(const kind of ['להבת נר','מדורה']){await ins.getByText(kind,{exact:true}).click();await p.waitForTimeout(500);
    const f=await p.evaluate(()=>{const e=App.rec.elements[1],g0=Studio.patternFrame(e,120,160,3),c=document.createElement('canvas');c.width=g0.width;c.height=g0.height;c.getContext('2d').drawImage(g0,0,0);const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let m=0,n=0;for(let i=0;i<d.length;i+=4){if(d[i+3]>40){n++;m=Math.max(m,d[i]+d[i+1]);}}return {m,n,ok:Studio.validPattern(e),look:e.pattern.look};});
    assert.ok(f.ok&&f.look==='fire'&&f.m>380&&f.n>50,'a bright '+kind+' '+JSON.stringify(f));}
  await p.evaluate(async()=>{await App.removeLayer(App.rec.elements[1].id);});await p.waitForFunction(()=>App.rec.elements.length===1);await p.waitForTimeout(300);
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
  // the switch to 3D: the sun lifts off in front of its glow, the smoke stands out in three slices from one base
  for(const id of [0,1]){await p.evaluate((i)=>App.select(App.rec.elements[i].id),id);await p.waitForTimeout(300);await ins.getByText('תלת־ממד',{exact:true}).last().click();await p.waitForTimeout(400);}
  assert.deepEqual(await p.evaluate(()=>App.rec.elements.slice(0,2).map(e=>[e.pattern.depth3d,Studio.validPattern(e)])),[[true,true],[true,true]]);
  await p.waitForFunction(()=>{const n=[...document.querySelectorAll('#editor-3d-host [studio-weather]')].map(e=>e.components['studio-weather'].group&&e.components['studio-weather'].group.children.length);return n.join()==='2,3';},null,{timeout:20000});
  wx=await p.evaluate(()=>{const [s,k]=[...document.querySelectorAll('#editor-3d-host [studio-weather]')].map(e=>e.components['studio-weather'].group.children);
    const base=k.map(m=>{const a=m.geometry.attributes.position;let lo=[];for(let i=0;i<a.count;i++)if(a.getY(i)<-0.4*m.geometry.parameters.height)lo.push(+(a.getX(i)+m.position.x).toFixed(4)+'/'+(+(a.getZ(i)+m.position.z).toFixed(4)));return lo.join();});
    const top=k.map(m=>{const a=m.geometry.attributes.position;let z=0;for(let i=0;i<a.count;i++)z=Math.max(z,a.getZ(i));return z;});
    return {sunZ:s[1].position.z-s[0].position.z,pre:s.concat(k).every(m=>m.material.premultipliedAlpha&&!m.material.depthTest),base,top};});
  assert.ok(wx.sunZ>0&&wx.pre,'the sun stands in front of its glow, never cut by the artwork '+JSON.stringify(wx));
  assert.equal(new Set(wx.base).size,1,'the smoke slices share one base '+JSON.stringify(wx.base));assert.ok(wx.top[2]>wx.top[1]&&wx.top[1]>wx.top[0],'and fan out as they rise');
  // a filmed loop and a weather particle layer get the same switch
  await p.locator('#btn-2d').click();await p.waitForTimeout(600);
  for(const [tile,type] of [['wr-rain-light','video'],['pw-snow','particles']]){
    await layers();await p.locator('#btn-add').click();await p.locator('dialog[open] .add-tile[data-add="weather"]').click();
    const n=await p.evaluate(()=>App.rec.elements.length);const t=p.locator('dialog[open] .part-tile[data-weather="'+tile+'"]');
    if(!await t.count()){const all=await p.locator('dialog[open] .part-tile[data-weather]').evaluateAll(x=>x.map(y=>y.dataset.weather));throw new Error('no tile '+tile+' in '+all);}
    await t.click();await p.waitForFunction((k)=>App.rec.elements.length===k+1,n,{timeout:30000});await p.waitForTimeout(500);
    assert.equal(await p.evaluate(()=>App.sel().type),type);
    await ins.getByText('תלת־ממד',{exact:true}).first().click();await p.waitForTimeout(300);
  }
  const deep=await p.evaluate(()=>{const v=App.rec.elements[3],q=App.rec.elements[4];return [v.depth3d,q.particles.depth3d];});
  assert.deepEqual(deep,[true,true],'both are set to 3D');
  await p.locator('#btn-3d').click();await p.waitForFunction(()=>document.querySelector('#stage').classList.contains('is-3d'),null,{timeout:20000});
  await p.waitForFunction(()=>{const v=document.querySelector('#editor-3d-host [studio-depth-copies]');return v&&v.components['studio-depth-copies'].copies.length===2;},null,{timeout:20000});
  const dz=await p.evaluate(()=>{const v=document.querySelector('#editor-3d-host [studio-depth-copies]'),c=v.components['studio-depth-copies'].copies,src=v.getObject3D('mesh');
    const pt=document.querySelector('#editor-3d-host [particles]'),a=pt.components.particles.data.depth;
    return {z:c.map(m=>m.position.z),same:c.every(m=>m.material===src.material),pd:a};});
  assert.ok(dz.z[0]>0&&dz.z[1]>dz.z[0]&&dz.same,'the loop stands out in copies that share its colour removal '+JSON.stringify(dz));
  assert.ok(dz.pd>0,'the particles spread in depth');
  assert.equal(await p.evaluate(()=>{try{Studio.validateExportObject?0:0;return Studio.validParticles?Studio.validParticles(App.rec.elements[4]):true;}catch(e){return String(e);}}),true);
  const q=await ctx.newPage();q.on('pageerror',e=>errs.push('preview: '+e));await q.goto(base+'/preview.html#'+id);
  await q.waitForFunction(()=>document.querySelectorAll('a-scene [studio-weather]').length===2&&document.querySelector('a-scene [studio-depth-copies]'),null,{timeout:30000});await q.waitForTimeout(1500);
  const prog=await q.evaluate(()=>{const r=document.querySelector('a-scene').renderer;return [...document.querySelectorAll('a-scene [studio-weather]')].map(e=>{const c=e.components['studio-weather'],pr=r.properties.get(c.quads[0].mesh.material).currentProgram;return !!pr&&(pr.diagnostics?pr.diagnostics.runnable:true)&&c.t>0;});});
  assert.deepEqual(prog,[true,true],'the shader compiles in the preview and runs');
  assert.equal(errs.filter(e=>!/favicon|404/.test(e)).length,0,'no page errors: '+errs.join(' | '));
  console.log('weather sheet: all checks pass');
 }finally{await b.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
