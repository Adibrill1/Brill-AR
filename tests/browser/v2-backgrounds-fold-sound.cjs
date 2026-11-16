const {chromium}=require('playwright-core'),assert=require('node:assert/strict'),path=require('node:path');const server=require('../../server/server');
// On a phone-size screen: (1) the add sheet's "רקעים" offers a flat colour and a moving pattern (and the library's
// nature loops when there are any); a flat colour is one colour behind the layers with a short panel of its own;
// (2) the drawn "weather" group is gone from the library; (3) the design page's groups fold at a tap, four of them
// start folded, and the choice is remembered; (4) a video with a soundtrack is heard while editing, at the layer's
// loudness, the loudness control changes it at once, and the speaker button silences the editor; the preview and
// the camera start each layer at its own loudness too.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--autoplay-policy=user-gesture-required']});try{
  const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const p=await ctx.newPage(),errs=[];p.on('pageerror',e=>errs.push(String(e)));
  const shot=async(n)=>{if(process.env.SHOTS)await p.screenshot({path:process.env.SHOTS+'/'+n+'.png'});};
  const fx=(f)=>path.join(__dirname,'../fixtures/'+f);
  await p.goto(base+'/index.html');await p.waitForFunction(()=>typeof App!=='undefined');await p.evaluate(()=>{location.hash='';localStorage.removeItem('brill-folds');localStorage.removeItem('brill-edit-sound');});await p.reload();
  await p.locator('#btn-new, #btn-new-empty').locator('visible=true').first().click();await p.waitForSelector('#btn-empty-art');
  {const [fc]=await Promise.all([p.waitForEvent('filechooser'),p.locator('#btn-empty-art').click()]);await fc.setFiles(fx('target-a.png'));await p.waitForSelector('.crop-dlg[open] .crop-box img');await p.locator('#crop-ok').click();}
  await p.waitForFunction(()=>App.rec&&App.rec.target,null,{timeout:30000});await p.waitForTimeout(1000);
  const titles=()=>p.locator('#inspector .group-title').evaluateAll(n=>n.map(x=>x.textContent));
  const folded=()=>p.locator('#inspector section.group.folded').evaluateAll(n=>n.map(x=>x.dataset.group));
  const stored=()=>p.evaluate(()=>Studio.load(App.rec.id));

  // 2. the library: no drawn weather
  const lib=await p.evaluate(()=>({w:StarterLibrary.entries.filter(e=>e.group==='weather').length,ids:StarterLibrary.entries.filter(e=>/^fx3d-w-/.test(e.id)).length,real:StarterLibrary.entries.filter(e=>e.group==='weather-real').length,cats:StarterLibrary.cats3d.map(c=>c[0])}));
  assert.equal(lib.w,0);assert.equal(lib.ids,0);assert.equal(lib.real,16,'the realistic weather stays');assert.ok(!lib.cats.includes('weather'));
  assert.equal(await p.evaluate(async()=>(await fetch('library/models/fx3d-w-sun.glb')).status),404,'its files are gone');

  // 1. backgrounds
  await p.locator('.tab[data-tab="add"]').click();await p.waitForSelector('dialog[open] .add-grid');
  assert.equal((await p.locator('dialog[open] .add-tile[data-add="pattern"] .add-name').textContent()).trim(),'רקעים');await shot('add-sheet-backgrounds');
  await p.locator('dialog[open] .add-tile[data-add="pattern"]').click();await p.waitForSelector('.part-tile[data-bg="solid"]');
  const tiles=await p.locator('.part-tile[data-bg]').evaluateAll(n=>n.map(x=>x.dataset.bg));
  assert.deepEqual(tiles.slice(0,2),['solid','pattern']);assert.equal(tiles.length,2+await p.evaluate(()=>StarterLibrary.backdrops.length),'and one tile for every nature loop');await shot('backgrounds-sheet');
  await p.locator('.part-tile[data-bg="solid"]').click();await p.waitForFunction(()=>App.sel()&&App.sel().type==='pattern',null,{timeout:15000});await p.waitForTimeout(600);
  let el=await p.evaluate(()=>App.sel());assert.equal(el.pattern.look,'solid');assert.equal(el.w,1);assert.equal(await p.evaluate(()=>App.rec.elements[0].id===App.selId),true,'behind the layers');
  let t=await titles();assert.deepEqual(t.slice(0,4),['צבע','צורה','שקיפות','מראה אחר'],'its own short panel: '+t);
  // one colour for the whole layer; the picture drawn is that colour everywhere
  await p.evaluate(()=>{const x=App.sel();x.pattern=Object.assign({},x.pattern,{colors:['#00c060','#00c060','#00c060']});App.changed(true);});await p.waitForTimeout(400);
  const flat=await p.evaluate(()=>{const c=Studio.patternFrame(App.sel(),64,64,3),g=document.createElement('canvas');g.width=g.height=64;const q=g.getContext('2d');q.drawImage(c,0,0,64,64);const d=q.getImageData(0,0,64,64).data;let lo=[255,255,255],hi=[0,0,0];for(let i=0;i<d.length;i+=4)for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],d[i+k]);hi[k]=Math.max(hi[k],d[i+k]);}return {lo,hi};});
  assert.ok(flat.hi.every((v,k)=>v-flat.lo[k]<=2)&&Math.abs(flat.lo[1]-192)<6&&flat.lo[0]<6,'one flat colour: '+JSON.stringify(flat));
  assert.equal(await p.evaluate(()=>Studio.validPattern(App.sel())),true);
  assert.equal((await stored()).elements[0].pattern.look,'solid');
  // the moving pattern still comes from the same sheet
  await p.locator('.tab[data-tab="add"]').click();await p.locator('dialog[open] .add-tile[data-add="pattern"]').click();await p.locator('.part-tile[data-bg="pattern"]').click();
  await p.waitForFunction(()=>App.sel()&&App.sel().type==='pattern'&&App.sel().pattern.look!=='solid',null,{timeout:15000});await p.waitForTimeout(500);

  // 3. folding
  await p.locator('.tab[data-tab="add"]').click();await p.locator('dialog[open] .add-tile[data-add="text"]').click();await p.waitForTimeout(900);
  assert.deepEqual((await folded()).sort(),['מקום וגודל','סדר השכבות','עומק והטיה','שקיפות'].sort(),'four groups start folded');
  assert.equal(await p.locator('#inspector input.range[aria-label="ימינה / שמאלה"]').isVisible(),false,'a folded group hides its controls');
  assert.equal(await p.locator('#in-text').isVisible(),true,'the others are open');await shot('design-folded');
  await p.locator('#inspector section.group[data-group="מקום וגודל"] .group-fold').click();
  assert.equal(await p.locator('#inspector input.range[aria-label="ימינה / שמאלה"]').isVisible(),true,'a tap opens it');
  await p.locator('#inspector section.group[data-group="טקסט"] .group-fold').click();assert.equal(await p.locator('#in-text').isVisible(),false,'and any group can be folded');
  await p.evaluate(()=>App.select(null));await p.waitForTimeout(200);await p.evaluate(()=>App.select(App.rec.elements.find(e=>e.type==='text').id));await p.waitForTimeout(300);
  assert.ok(!(await folded()).includes('מקום וגודל')&&(await folded()).includes('טקסט'),'remembered while editing');
  await p.reload();await p.waitForFunction(()=>typeof App!=='undefined'&&App.rec&&App.rec.target,null,{timeout:30000});await p.waitForTimeout(600);
  await p.evaluate(()=>{App.select(App.rec.elements.find(e=>e.type==='text').id);App.setTab('style');});await p.waitForTimeout(400);
  assert.ok(!(await folded()).includes('מקום וגודל')&&(await folded()).includes('טקסט')&&(await folded()).includes('שקיפות'),'and after coming back: '+await folded());
  await p.locator('#inspector section.group[data-group="טקסט"] .group-fold').click();

  // 4. sound while editing
  assert.equal(await p.evaluate(()=>App.soundReady),true,'the taps so far have let the sound start');
  await p.locator('.tab[data-tab="add"]').click();await p.waitForSelector('dialog[open] .add-grid');
  {const [fc]=await Promise.all([p.waitForEvent('filechooser'),p.locator('dialog[open] .add-tile[data-add="video"]').click()]);await fc.setFiles(fx('tone-video.mp4'));}
  await p.waitForFunction(()=>App.sel()&&App.sel().type==='video'&&!document.querySelector('.busy'),null,{timeout:30000});await p.waitForTimeout(800);
  const snd=()=>p.evaluate(()=>App.soundState().filter(s=>s.tag==='VIDEO'));
  await p.locator('#stage').click({position:{x:20,y:20}});await p.waitForTimeout(400);
  let s=await snd();assert.equal(s.length,1);assert.equal(s[0].muted,false,'the video is not silenced: '+JSON.stringify(s));assert.equal(s[0].gain,1,'at full loudness');assert.equal(s[0].paused,false);
  // real signal, not only settings: the audio graph carries sound
  const level=()=>p.evaluate(async()=>{const v=Object.values(App.media).find(m=>m.tagName==='VIDEO');if(!v||!v.__gain)return -1;const a=v.__gain.context.createAnalyser();a.fftSize=2048;v.__gain.connect(a);let peak=0;const buf=new Float32Array(a.fftSize);for(let i=0;i<12;i++){await new Promise(r=>setTimeout(r,60));a.getFloatTimeDomainData(buf);for(const x of buf)peak=Math.max(peak,Math.abs(x));}v.__gain.disconnect(a);return peak;});
  const loud=await level();
  await p.evaluate(()=>{App.select(App.rec.elements.find(e=>e.type==='video').id);App.setTab('style');});await p.waitForSelector('#inspector input.range[aria-label="עוצמת קול"]');
  await p.evaluate(()=>{const r=document.querySelector('#inspector input.range[aria-label="עוצמת קול"]');r.value=0.25;r.dispatchEvent(new Event('input',{bubbles:true}));r.dispatchEvent(new Event('change',{bubbles:true}));});await p.waitForTimeout(400);
  s=await snd();assert.ok(Math.abs(s[0].gain-0.25)<1e-6,'the loudness control is heard at once: '+JSON.stringify(s));
  const quiet=await level();
  if(loud>=0&&loud>0.01)assert.ok(quiet<loud*0.5&&quiet>0,'and the signal itself is quieter: '+loud+' -> '+quiet);
  assert.ok(Math.abs((await stored()).elements.find(e=>e.type==='video').volume-0.25)<1e-6,'and saved');
  await p.evaluate(()=>App.setPane('layers'));await p.locator('#btn-sound').click();await p.waitForTimeout(300);
  s=await snd();assert.equal(s[0].gain,0,'the speaker button silences the editor');assert.equal(s[0].muted,true);assert.equal(s[0].paused,false,'the picture keeps playing');
  assert.equal(await p.locator('#btn-sound').getAttribute('aria-pressed'),'false');await shot('sound-button-off');
  await p.locator('#btn-sound').click();await p.waitForTimeout(300);s=await snd();assert.ok(Math.abs(s[0].gain-0.25)<1e-6&&s[0].muted===false,'and brings it back');
  // a frozen video is silent
  await p.evaluate(()=>App.setStill(App.rec.elements.find(e=>e.type==='video').id,true));await p.waitForTimeout(700);
  assert.ok((await snd()).every(x=>x.muted||x.gain===0||x.paused),'a frozen video makes no sound');
  await p.evaluate(()=>App.setStill(App.rec.elements.find(e=>e.type==='video').id,false));await p.waitForTimeout(700);

  // the preview: the layer starts at its own loudness there too
  const id=await p.evaluate(async()=>{await App.save();return App.rec.id;});
  const routed=await p.evaluate(()=>{const mk=(vol)=>{const v=document.createElement('video');return {kind:'video',node:v,el:vol==null?{id:'x'}:{id:'x',volume:vol}};},ms=[mk(0.25),mk(null),mk(0),mk(7)];
    Studio.connectSpatialAudio({hasLoaded:true,camera:null},document.body,ms);return ms.map(m=>m.three?m.three.gain.gain.value:null);});
  assert.deepEqual(routed,[0.25,1,0,1],'preview and camera: every layer starts at its own loudness');
  assert.deepEqual(errs,[],'no errors');
  console.log('PASS v2-backgrounds-fold-sound (signal '+loud.toFixed(3)+' -> '+quiet.toFixed(3)+')');
}finally{await b.close();server.close();}})().catch(e=>{console.error(e);process.exit(1);});
