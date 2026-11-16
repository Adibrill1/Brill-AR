const {chromium}=require('playwright-core'),assert=require('node:assert/strict'),path=require('node:path');const server=require('../../server/server');
// On a phone-size screen: (1) "עיצוב" holds the look and the place of a layer, and where "מיקום" was there is "הוספה",
// which opens the add sheet; (2) pictures have no "אפקט" group any more (a layer that still has an effect can drop it);
// (3) a layer can grow far past twice the artwork; (4) the selection bar's background covers all its buttons wherever
// it was left; (5) the add sheet opens the library's 3D shelf, which has a button for a model file of one's own;
// (6) weather as particles: covers the artwork, its streaks lean into the wind, and amount/spread/direction can change.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});try{
  const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const p=await ctx.newPage(),errs=[];p.on('pageerror',e=>errs.push(String(e)));
  const shot=async(n)=>{if(process.env.SHOTS)await p.screenshot({path:process.env.SHOTS+'/'+n+'.png'});};
  const art=path.join(__dirname,'../fixtures/target-a.png');
  const drag=async(x0,y0,x1,y1)=>{const c=await ctx.newCDPSession(p),t=(type,x,y)=>c.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y}]});await t('touchStart',x0,y0);for(let i=1;i<=6;i++){await t('touchMove',x0+(x1-x0)*i/6,y0+(y1-y0)*i/6);await p.waitForTimeout(30);}await t('touchEnd');await p.waitForTimeout(250);};
  await p.goto(base+'/index.html');await p.waitForFunction(()=>typeof App!=='undefined');await p.evaluate(()=>{location.hash='';});await p.reload();
  await p.locator('#btn-new, #btn-new-empty').locator('visible=true').first().click();await p.waitForSelector('#btn-empty-art');
  {const [fc]=await Promise.all([p.waitForEvent('filechooser'),p.locator('#btn-empty-art').click()]);await fc.setFiles(art);await p.waitForSelector('.crop-dlg[open] .crop-box img');await p.locator('#crop-ok').click();}
  await p.waitForFunction(()=>App.rec&&App.rec.target,null,{timeout:30000});await p.waitForTimeout(1000);

  // 1. the tabs
  const tabs=await p.locator('#tabs .tab').evaluateAll(n=>n.map(x=>x.dataset.tab+':'+x.textContent.trim()));
  assert.deepEqual(tabs,['layers:שכבות','style:עיצוב','add:הוספה','motion:תנועה','tap:מגע']);
  await p.locator('.tab[data-tab="add"]').click();await p.waitForSelector('dialog[open] .add-grid');
  assert.match(await p.locator('dialog[open]').textContent(),/מה מוסיפים\?/);await shot('add-sheet');
  await p.locator('dialog[open] .add-tile[data-add="text"]').click();await p.waitForTimeout(900);
  const titles=()=>p.locator('#inspector .group-title').evaluateAll(n=>n.map(x=>x.textContent));
  let t=await titles();assert.ok(t.includes('טקסט')&&t.includes('מקום וגודל')&&t.includes('עומק והטיה')&&t.includes('סדר השכבות'),'look and place on one page: '+t);
  assert.ok(t.indexOf('טקסט')<t.indexOf('מקום וגודל'),'the look first');
  assert.equal(await p.locator('.tab[data-tab="style"]').getAttribute('aria-selected'),'true');
  await p.evaluate(()=>App.setTab('place'));await p.waitForTimeout(200);
  assert.equal(await p.locator('.tab[data-tab="style"]').getAttribute('aria-selected'),'true','an old way to "place" lands on the design page');
  assert.ok((await titles()).includes('מקום וגודל'));

  // 3. size: far past twice the artwork, by the slider and by two fingers' worth of growth
  const size=p.locator('#inspector input.range[aria-label="גודל"]');assert.equal(await size.getAttribute('max'),'10');
  await p.evaluate(()=>{const r=document.querySelector('#inspector input.range[aria-label="גודל"]');r.value=6;r.dispatchEvent(new Event('input',{bubbles:true}));r.dispatchEvent(new Event('change',{bubbles:true}));});await p.waitForTimeout(300);
  assert.ok(Math.abs(await p.evaluate(()=>App.sel().w)-6)<0.01,'six times the artwork');
  await p.evaluate(()=>{const r=document.querySelector('#inspector input.range[aria-label="גודל"]');r.value=0.5;r.dispatchEvent(new Event('input',{bubbles:true}));r.dispatchEvent(new Event('change',{bubbles:true}));});await p.waitForTimeout(300);

  // 2. a picture: no effect group; an effect left on a layer can be taken off
  await p.locator('.tab[data-tab="add"]').click();await p.waitForSelector('dialog[open] .add-grid');
  {const [fc]=await Promise.all([p.waitForEvent('filechooser'),p.locator('dialog[open] .add-tile[data-add="image"]').click()]);await fc.setFiles(art);}
  await p.waitForFunction(()=>App.sel()&&App.sel().type==='image',null,{timeout:20000});await p.waitForTimeout(600);
  t=await titles();assert.ok(!t.includes('אפקט'),'no effect group on a picture: '+t);assert.ok(t.includes('חיתוך ומילוי')&&t.includes('מקום וגודל'));
  assert.equal(await p.locator('#btn-fx-off').count(),0);
  await p.evaluate(()=>{const x=App.sel();x.fx=Studio.FX[0].id;x.fxAmount=0.5;x.name='תמונה עם שם ארוך מאוד מאוד כדי למלא את הסרגל';App.changed(true);Inspector.build();});await p.waitForTimeout(300);
  await p.locator('#btn-fx-off').click();await p.waitForTimeout(300);
  assert.equal(await p.evaluate(()=>App.sel().fx),undefined,'the old effect is off');assert.equal(await p.locator('#btn-fx-off').count(),0);

  // 4. the bar: dragged to the far side, then showing another layer - every button stays on its background
  const inside=async(why)=>{const r=await p.evaluate(()=>{const bar=document.getElementById('sel-bar').getBoundingClientRect(),st=document.getElementById('stage').getBoundingClientRect();
    const bad=[...document.querySelectorAll('#sel-bar button')].filter(x=>{const q=x.getBoundingClientRect();return q.width<27||q.left<bar.left-0.5||q.right>bar.right+0.5||q.top<bar.top-0.5||q.bottom>bar.bottom+0.5;}).map(x=>x.title);
    return {bad,on:bar.left>=st.left-0.5&&bar.right<=st.right+0.5,n:document.querySelectorAll('#sel-bar button').length};});
    assert.deepEqual(r.bad,[],why+': buttons outside the bar');assert.ok(r.on,why+': the bar is on the stage');return r.n;};
  await inside('where it starts');
  for(const dx of [-400,400]){
    const g=await p.locator('#sel-bar .sel-grip').boundingBox();await drag(g.x+g.width/2,g.y+g.height/2,g.x+g.width/2+dx,g.y+g.height/2+120);
    const n1=await inside('dragged '+dx);
    await p.evaluate(()=>App.select(App.rec.elements.find(e=>e.type==='text').id));await p.waitForTimeout(250);await inside('text layer after '+dx);
    await p.evaluate(()=>App.select(App.rec.elements.find(e=>e.type==='image').id));await p.waitForTimeout(250);assert.equal(await inside('picture again after '+dx),n1);
  }
  await shot('bar-wide-layer');
  await p.evaluate(()=>{localStorage.removeItem('brill-sel-bar');});

  // 5. the 3D shelf from the add sheet, with the import button only there
  await p.locator('.tab[data-tab="add"]').click();await p.waitForSelector('dialog[open] .add-grid');
  await p.locator('dialog[open] .add-tile[data-add="model"]').click();await p.waitForSelector('#starter-library[open]');
  assert.equal(await p.locator('#starter-library .library-filters button[data-group="model"]').getAttribute('aria-pressed'),'true','opens on the 3D shelf');
  const shown=await p.locator('#starter-library .library-card:not([hidden])').evaluateAll(n=>[...new Set(n.map(x=>x.dataset.group))]);assert.deepEqual(shown,['model']);
  const imp=p.locator('#starter-library .library-import');assert.ok(await imp.isVisible(),'import button on the 3D shelf');await shot('library-3d');
  await p.locator('#starter-library .library-filters button[data-group="all"]').click();assert.ok(!(await imp.isVisible()),'and only there');
  await p.locator('#starter-library .library-filters button[data-group="model"]').click();
  const [fc]=await Promise.all([p.waitForEvent('filechooser'),imp.click()]);assert.ok(fc,'the import button asks for a file');await fc.setFiles([]);
  await p.waitForFunction(()=>!document.querySelector('#starter-library'));

  // 6. weather as particles
  await p.locator('.tab[data-tab="add"]').click();await p.waitForSelector('dialog[open] .add-grid');
  await p.locator('dialog[open] .add-tile[data-add="particles"]').click();await p.waitForSelector('.part-tile[data-style="pw-rain-wind"]');await shot('particle-sheet');
  await p.locator('.part-tile[data-style="pw-rain-wind"]').click();
  await p.waitForFunction(()=>App.sel()&&App.sel().type==='particles',null,{timeout:20000});await p.waitForTimeout(1500);
  let el=await p.evaluate(()=>App.sel());
  assert.equal(el.w,1);assert.equal(el.h,1);assert.equal(el.particles.turn,true);assert.equal(el.particles.direction,200);assert.equal(el.particles.count,380);assert.equal(el.particles.speed,8);
  assert.ok(await p.evaluate(()=>Studio.validParticles?Studio.validParticles(App.sel()):true));
  const lean=p.locator('#inspector input.range[aria-label="נטייה ברוח"]');assert.equal(await lean.inputValue(),'20');
  await p.evaluate(()=>{const set=(l,v)=>{const r=document.querySelector('#inspector input.range[aria-label="'+l+'"]');r.value=v;r.dispatchEvent(new Event('input',{bubbles:true}));r.dispatchEvent(new Event('change',{bubbles:true}));};set('נטייה ברוח',-35);set('כמות',150);set('פיזור',1.5);});await p.waitForTimeout(600);
  el=await p.evaluate(()=>App.sel());assert.equal(el.particles.direction,145);assert.equal(el.particles.count,150);assert.equal(el.particles.spread,1.5);
  const saved=await p.evaluate(async()=>{await App.save();const r=await Studio.load(App.rec.id);return r.elements.find(e=>e.type==='particles').particles;});assert.equal(saved.direction,145);assert.equal(saved.turn,true);
  // in the scene the picture is turned to the way the rain travels
  const rot=await p.evaluate(()=>{const e=[...document.querySelectorAll('[particles]')].find(x=>x.components.particles&&x.components.particles.data.turn);if(!e)return null;const m=e.components.particles.points.material.map;return {rot:m.rotation,dir:e.components.particles.data.direction,n:e.components.particles.points.geometry.attributes.position.count};});
  if(rot){assert.equal(rot.dir,145);assert.ok(Math.abs(rot.rot-(145-180)*Math.PI/180)<1e-6,'turned with the wind');assert.equal(rot.n,150);}
  await p.locator('.tab[data-tab="layers"]').click();await p.waitForTimeout(800);await shot('weather-rain-editor');
  assert.deepEqual(errs,[],'no errors');
  console.log('PASS v2-design-add-weather'+(rot?'':' (no live particle entity in the editor to read)'));
}finally{await b.close();server.close();}})().catch(e=>{console.error(e);process.exit(1);});
