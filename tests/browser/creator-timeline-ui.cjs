// UI-authored Timeline-course exercise (Artivive "Discover Timeline"/module-4):
// ease curves, overlapping actions on one layer (official ends-later rule),
// unconnected video on its own clock, reset/replay, save/reload persistence.
const {chromium}=require('playwright-core'),assert=require('assert/strict'),path=require('path'),server=require('../../server/server'),waitFor=require('./waitfor.cjs');
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--autoplay-policy=no-user-gesture-required']});try{
const p=await b.newPage({viewport:{width:1280,height:900}});
await p.goto(base+'/index.html');await p.waitForSelector('#element-list li');
await p.locator('#btn-new').click();await p.locator('#file-artwork').setInputFiles(path.resolve('studio/library/star.png'));await p.waitForSelector('#sec-elements:not([hidden])');
const set=async(l,v)=>{await l.fill(v);await l.dispatchEvent('change');};
const add=p.getByRole('button',{name:'+ פעולה על השכבה שנבחרה',exact:true});
const detail=()=>p.locator('.action-details');
// rocket layer
await p.locator('#btn-text').click();await p.waitForSelector('#panel:not([hidden])');
await set(p.locator('#in-text'),'🚀');await set(p.locator('#num-x'),'-.3');
// video layer, deliberately left without any action (own clock, official behavior)
await p.locator('#file-video').setInputFiles(path.resolve('tests/fixtures/clock-12s.mp4'));
await p.waitForFunction(()=>document.querySelectorAll('#element-list li').length===2);
// sequence "תנועה", 3s
await p.getByRole('button',{name:'+ רצף',exact:true}).click();
await set(p.getByLabel('שם הרצף',{exact:true}),'תנועה');
await set(p.getByLabel('משך בשניות',{exact:true}),'3');
// select the rocket
await p.locator('#element-list li').nth(0).click();
// action 1: move 0-2s easeIn to (.3,.2)
await p.getByLabel('סוג פעולה חדשה').selectOption('move');await add.click();
await set(detail().getByLabel('משך בשניות',{exact:true}),'2');
await detail().getByLabel('עקומת מהירות').selectOption('easeIn');
await set(detail().getByLabel('יעד אופקי',{exact:true}),'.3');
await set(detail().getByLabel('יעד אנכי',{exact:true}),'.2');
// action 2: rotate 1-3s elastic to 360 (overlap, different property)
await p.getByLabel('סוג פעולה חדשה').selectOption('rotate');await add.click();
await set(detail().getByLabel('התחלה בשניות',{exact:true}),'1');
await set(detail().getByLabel('משך בשניות',{exact:true}),'2');
await detail().getByLabel('עקומת מהירות').selectOption('elastic');
await set(detail().getByLabel('יעד מעלות',{exact:true}),'360');
// action 3: move 1.5-2.5s linear to (.1,0) - same-property overlap, ends later (wins per official rule)
await p.getByLabel('סוג פעולה חדשה').selectOption('move');await add.click();
await set(detail().getByLabel('התחלה בשניות',{exact:true}),'1.5');
await set(detail().getByLabel('משך בשניות',{exact:true}),'1');
await set(detail().getByLabel('יעד אופקי',{exact:true}),'.1');
await set(detail().getByLabel('יעד אנכי',{exact:true}),'0');
const ids=await p.evaluate(async()=>{const r=await Studio.load(document.querySelector('#exp-select').value);return{id:r.id,rocket:r.elements.find(e=>e.type==='text').id,seq:r.actionSequences[0].id};});
// tap wiring: rocket starts the sequence
await p.locator('#element-list li').nth(0).click();await p.locator('#sel-tap').selectOption('action:'+ids.seq);
await waitFor(p,async ids=>{const r=await Studio.load(ids.id);return r.elements.find(e=>e.id===ids.rocket).onTap==='action:'+ids.seq;},ids);
// persistence through editor reload
await p.goto(base+'/index.html');await p.waitForFunction(()=>document.querySelectorAll('#exp-select option').length>0);
await p.locator('#exp-select').selectOption(ids.id);await p.waitForFunction(()=>document.querySelectorAll('#element-list li').length===2);
const rec=await p.evaluate(async id=>Studio.load(id),ids.id);
assert.deepEqual(rec.actionSequences[0].actions.map(a=>[a.type,a.start,a.duration,a.ease]),[['move',0,2,'easeIn'],['rotate',1,2,'elastic'],['move',1.5,1,'linear']]);
assert.equal(rec.actionSequences[0].duration,3);assert.equal(rec.actionSequences[0].reset,true);
assert.equal(rec.elements.find(e=>e.id===ids.rocket).onTap,'action:'+ids.seq);
console.log('PASS UI-authored timeline scene persisted across reload: curves, overlap order, duration, reset, tap wiring');
// preview: deterministic overlap/curve assertions via seek (engine truth on the UI-authored record)
await p.goto(base+'/preview.html#'+ids.id);
await p.waitForFunction(()=>window.__actionRunner&&document.querySelector('#media-store video'));
await p.waitForFunction(()=>{const v=document.querySelector('#media-store video');return v&&!v.paused&&v.currentTime>.1;});
const pts=await p.evaluate(ids=>{const e=window.__actionRunner;e.pause();
  e.seek(ids.seq,1.25);const a=e.values()[ids.rocket].x;
  e.seek(ids.seq,1.75);const v=e.values()[ids.rocket];const b=v.x,rot=v.rot;
  e.seek(ids.seq,2.75);const c=e.values()[ids.rocket].x;
  e.stop(ids.seq);e.resume();return{a,b,c,rot};},ids);
assert.ok(Math.abs(pts.a-(-.065625))<1e-9,'first move alone at 1.25s, easeIn: '+pts.a);
assert.ok(Math.abs(pts.b-.053125)<1e-9,'later-ending move governs at 1.75s (chains from .0375): '+pts.b);
assert.ok(Math.abs(pts.c-.1)<1e-9,'later-ending move holds its end at 2.75s: '+pts.c);
assert.ok(Math.abs(pts.rot-360)<1e-6,'elastic rotate applies on the same layer during the overlap: '+pts.rot);
console.log('PASS deterministic overlap rule (ends-later governs, chains from current value) and ease curves through the UI-authored scene',pts);
// deterministic mid-overlap frame at phone size
await p.setViewportSize({width:390,height:844});
await p.evaluate(ids=>{const e=window.__actionRunner;e.pause();e.seek(ids.seq,1.75);},ids);
await p.waitForTimeout(200);await p.screenshot({path:'/downloads/creator-timeline-ui-390.png'});
await p.evaluate(ids=>{window.__actionRunner.stop(ids.seq);window.__actionRunner.resume();},ids);
// real-time reset/replay + independent media clock
const v0=await p.evaluate(()=>document.querySelector('#media-store video').currentTime);
await p.evaluate(ids=>{document.querySelector('[data-el-id="'+ids.rocket+'"]').emit('click');},ids);
await p.waitForFunction(ids=>window.__actionRunner.isPlaying(ids.seq),ids);
await p.waitForFunction(ids=>!window.__actionRunner.isPlaying(ids.seq),ids,{timeout:10000});
const after=await p.evaluate(ids=>({v:window.__actionRunner.values()[ids.rocket]||null,vid:document.querySelector('#media-store video').currentTime,paused:document.querySelector('#media-store video').paused}),ids);
assert.equal(after.v,null,'reset releases the rocket values at sequence end');
assert.ok(!after.paused&&after.vid>3,'unconnected video keeps its own clock past the 3s sequence: '+JSON.stringify(after));
await p.evaluate(ids=>{document.querySelector('[data-el-id="'+ids.rocket+'"]').emit('click');},ids);
await p.waitForFunction(ids=>window.__actionRunner.isPlaying(ids.seq),ids);
const vid2=await p.evaluate(()=>({t:document.querySelector('#media-store video').currentTime,paused:document.querySelector('#media-store video').paused}));
assert.ok(!vid2.paused&&vid2.t>=after.vid,'replay leaves the independent video clock uninterrupted');
await p.waitForFunction(ids=>!window.__actionRunner.isPlaying(ids.seq),ids,{timeout:10000});
console.log('PASS reset/replay identical and unconnected video independent of timeline duration',{v0,after,vid2});
}finally{await b.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exit(1)});
