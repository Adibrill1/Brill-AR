const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');
// Wait/cut toggle for timed model clips: a wait-mode action must not cut the
// previous clip mid-play - it becomes eligible at the previous clip's real end
// (from clipDurations captured at authoring). A cut-mode action (default)
// switches at its own start. Verified through the real engine + apply driver
// (startActionDriver) on the multiclip fixture (two 2s clips).
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});try{const p=await b.newPage({viewport:{width:800,height:600}});p.on('pageerror',e=>console.log('PAGE',e.message));await p.route('**/tests/fixtures/multiclip.glb',r=>r.fulfill({path:require('path').join(__dirname,'../fixtures/multiclip.glb'),contentType:'model/gltf-binary'}));await p.goto(base+'/preview.html');await p.evaluate(async()=>{
 document.querySelectorAll('#err,#hint,#topbar').forEach(n=>n.remove());const rec=Studio.blankExperience('clip wait');rec.target={artRect:{x:0,y:0,w:768,h:1024},natural:{w:768,h:1024}};
 rec.assets.model=await fetch('/../tests/fixtures/multiclip.glb').then(r=>r.blob());
 const info=await Studio.modelClipInfo(rec.assets.model);
 window.__durations=info.map(c=>c.duration);
 const el={id:'m',type:'model',assetId:'model',x:0,y:0,w:.5,rot:0,modelLoop:false,clipDurations:window.__durations};
 rec.elements=[el];
 rec.actionSequences=[{id:'s',name:'s',duration:12,loop:false,reset:true,autoStart:true,actions:[
  {id:'a',layerId:'m',type:'model',start:0,duration:10,ease:'linear',to:{clip:0,speed:1,loop:false}},
  {id:'b',layerId:'m',type:'model',start:1,duration:5,ease:'linear',to:{clip:1,speed:1,loop:false,mode:'wait'}},
  {id:'c',layerId:'m',type:'model',start:3.5,duration:5,ease:'linear',to:{clip:0,speed:1,loop:false}}
 ]}];
 const scene=document.createElement('a-scene');scene.setAttribute('embedded','');scene.setAttribute('renderer','preserveDrawingBuffer: true; colorManagement: true');scene.style.cssText='position:fixed;inset:0';const light=document.createElement('a-light');light.setAttribute('type','ambient');light.setAttribute('intensity','1');scene.append(light);const camera=document.createElement('a-entity');camera.setAttribute('camera','');camera.setAttribute('position','0 0 2');scene.append(camera);const rig=document.createElement('a-entity');rig.id='rig';scene.append(rig);rig.append(Studio.buildElementEntity(rec,el,0,'preview'));document.body.append(scene);
 window.__rec=rec;window.__rig=rig;
 });await p.waitForFunction(()=>document.querySelector('[model-clips]')?.components['model-clips']?.mixer);
 const out=await p.evaluate(async()=>{
  const engine=Studio.startActionDriver(window.__rec,window.__rig,[],{paused:true});
  const inner=document.querySelector('[model-clips]');
  const at=async(t)=>{engine.seek('s',t);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(r))));const comp=inner.components['model-clips'];return {clip:Number(inner.getAttribute('model-clips').clip),time:comp&&comp.mixer?comp.mixer.time:null};};
  return {durations:window.__durations,t15:await at(1.5),t25:await at(2.5),t375:await at(3.75)};
 });
 console.log(JSON.stringify(out));
 assert.deepEqual(out.durations.map(d=>Math.round(d*100)/100),[2,2],'fixture clip durations read: '+out.durations);
 assert.equal(out.t15.clip,0,'t=1.5: wait action started at 1 but previous clip plays until its real end (2s): '+JSON.stringify(out.t15));
 assert(Math.abs(out.t15.time-1.5)<0.2,'t=1.5: previous clip clock continues: '+out.t15.time);
 assert.equal(out.t25.clip,1,'t=2.5: wait action took over at the real clip end (2s), not at its start (1s): '+JSON.stringify(out.t25));
 assert(Math.abs(out.t25.time-0.5)<0.2,'t=2.5: new clip clock counts from the deferred start: '+out.t25.time);
 assert.equal(out.t375.clip,0,'t=3.75: cut action at 3.5 interrupts the playing clip immediately: '+JSON.stringify(out.t375));
 assert(Math.abs(out.t375.time-0.25)<0.2,'t=3.75: cut clip clock from its own start: '+out.t375.time);
 console.log('PASS wait defers to real clip end; cut interrupts immediately');}finally{await b.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exit(1)});
