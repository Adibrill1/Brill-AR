const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');
// AR lock (steady-target on the image target): the tracker's shaky raw pose is smoothed while the artwork is still,
// followed closely while it moves, snapped on "found", and held on screen briefly after "lost" so a moment of glare
// does not blink the layers off. Synthetic xrimage* events at 30 Hz in headless Chrome - not 8th Wall on an iPhone.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl']});try{
const p=await (await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true})).newPage();const pageErrors=[];p.on('pageerror',e=>pageErrors.push(String(e)));
await p.goto(base+'/index.html');await p.waitForFunction(()=>document.querySelector('#exp-select').options.length>0);await p.waitForTimeout(800);
// a running A-Frame scene to host the component: the editor's own 3D view (a second scene does not start on this page)
const id=await p.evaluate(async()=>{const r=Studio.blankExperience('steady');r.target={artRect:{x:0,y:0,w:768,h:768},natural:{w:768,h:768}};const c=document.createElement('canvas');c.width=c.height=768;r.assets.__artwork=await new Promise(res=>c.toBlob(res));await Studio.save(r);const o=document.createElement('option');o.value=r.id;o.textContent=r.name;document.querySelector('#exp-select').append(o);return r.id;});
await p.locator('#exp-select').selectOption(id);await p.locator('#canvas-wrap').scrollIntoViewIfNeeded();await p.click('#btn-3d');await p.waitForFunction(()=>Editor3D.isActive()&&Editor3D._test.scene()&&Editor3D._test.scene().isPlaying,null,{timeout:20000});
const r=await p.evaluate(async()=>{
  Studio.ensureSteadyTargetComponent();
  const sc=Editor3D._test.scene();
  const t=document.createElement('a-entity');t.setAttribute('steady-target','name: artwork');sc.appendChild(t);
  await new Promise(res=>t.hasLoaded?res():t.addEventListener('loaded',res,{once:true}));
  const o=t.object3D,wait=ms=>new Promise(res=>setTimeout(res,ms)),frame=()=>new Promise(res=>requestAnimationFrame(()=>requestAnimationFrame(res)));
  const S=0.8,send=(type,x,y,z,yaw)=>{const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(0,yaw||0,0));sc.emit(type,{name:'artwork',position:{x,y,z},rotation:{x:q.x,y:q.y,z:q.z,w:q.w},scale:S},false);if(type==='xrimagelost')o.visible=false;else o.visible=true;}; // the visible flag is what xrextras does
  let seed=7;const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647-.5;};
  // found: snaps to the pose
  send('xrimagefound',0,0,-2,0);await frame();
  const snapped={x:o.position.x,z:o.position.z};
  // still artwork, raw pose shaking by ±1% of the artwork size and ±1°
  const rawSteps=[],outSteps=[],outRot=[];let prevRaw=null,prevOut=null;
  for(let i=0;i<60;i++){const rx=rnd()*0.02*S,ry=rnd()*0.02*S,yaw=rnd()*Math.PI/90;send('xrimageupdated',rx,ry,-2,yaw);await wait(33);
    const out=o.position.clone();if(prevRaw)rawSteps.push(Math.hypot(rx-prevRaw[0],ry-prevRaw[1]));if(prevOut&&i>10)outSteps.push(out.distanceTo(prevOut));prevRaw=[rx,ry];prevOut=out;outRot.push(new THREE.Euler().setFromQuaternion(o.quaternion).y);}
  const mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
  // moving artwork: 1 artwork size per second sideways for 1 s, then check how far behind the layers are
  let x=0;for(let i=0;i<30;i++){x+=S/30;send('xrimageupdated',x,0,-2,0);await wait(33);}
  await frame();const lag=Math.abs(x-o.position.x)/S;
  // lost: still on screen for a moment, then hidden
  send('xrimagelost',x,0,-2,0);await wait(120);await frame();const heldVisible=o.visible;
  await wait(500);await frame();const goneAfter=!o.visible;
  // found again somewhere else: snaps there at once (no slide from the old place)
  send('xrimagefound',-1,.5,-3,0);await frame();const resnap=[o.position.x,o.position.y,o.position.z];
  return {snapped,raw:mean(rawSteps),out:mean(outSteps),rotSpread:Math.max(...outRot.slice(10))-Math.min(...outRot.slice(10)),lag,heldVisible,goneAfter,resnap};});
console.log(JSON.stringify(r));
assert.deepEqual(r.snapped,{x:0,z:-2},'found: the layers snap to the artwork pose');
assert.ok(r.out<r.raw*0.35,'still artwork: frame-to-frame shake cut to under a third: raw '+r.raw.toFixed(5)+' -> '+r.out.toFixed(5));
assert.ok(r.rotSpread<Math.PI/90*0.6,'still artwork: the ±1° turn shake is damped: '+r.rotSpread);
assert.ok(r.lag<0.2,'moving artwork: the layers follow within a fifth of the artwork size: '+r.lag.toFixed(3));
assert.ok(r.heldVisible,'lost: still on screen 120 ms later (a moment of glare)');
assert.ok(r.goneAfter,'lost: hidden after the hold');
assert.deepEqual(r.resnap,[-1,.5,-3],'found again: snaps to the new place');
assert.deepEqual(pageErrors,[],'no page errors');
console.log('PASS ar-steady-target: shake damped while still, close follow while moving, snap on found, brief hold on lost');
}finally{await b.close();server.close();}})().catch(e=>{console.error(e&&e.stack||e);process.exit(1)});
