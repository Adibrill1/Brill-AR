const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');
// (1) rotation snaps to multiples of 90° within 6° (rule + rotation slider; typed numbers stay exact),
// (2) media survive AR tracking flicker: a target loss pauses only after 1s, content hiding still pauses at once,
// (3) sound: a visible "tap for sound" button, and a touch unmutes every video (also a paused one, unlocked silently),
// (4) a 30MB video fits the per-file limit, 50MB+1 does not. Headless desktop Chrome with simulated media; not an iPhone.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});try{
const p=await (await b.newContext({viewport:{width:1280,height:900}})).newPage();const pageErrors=[];p.on('pageerror',e=>pageErrors.push(String(e)));
await p.goto(base+'/index.html');await p.waitForFunction(()=>document.querySelector('#exp-select').options.length>0);await p.waitForTimeout(1200);
// (1) rule
const snap=await p.evaluate(()=>[87,83,-92,176,3,-3,45,93.5,-180,268,84].map(d=>Studio.snapAngle(d)));
assert.deepEqual(snap,[90,83,-90,180,0,0,45,90,-180,270,90],'snapAngle '+snap);assert.ok(Object.is(snap[5],0),'no -0');
// (1) slider: select a layer, drag the rotation slider near 90 -> 90; far from it -> exact
await p.click('#element-list li');await p.waitForSelector('#sl-rot',{state:'attached'});
const rot=async v=>{await p.evaluate(v=>{const s=document.querySelector('#sl-rot');s.value=String(v);s.dispatchEvent(new Event('input',{bubbles:true}));s.dispatchEvent(new Event('change',{bubbles:true}));},v);await p.waitForTimeout(900);
  return p.evaluate(async()=>{const id=document.querySelector('#exp-select').value;const r=await Studio.load(id);const li=document.querySelector('#element-list li.sel, #element-list li[aria-selected="true"]');return r.elements.map(e=>e.rot||0);});};
let rots=await rot(87);assert.ok(rots.includes(90),'slider at 87 stores 90: '+rots);
rots=await rot(-178);assert.ok(rots.includes(180)||rots.includes(-180),'slider at -178 stores ±180: '+rots);
rots=await rot(70);assert.ok(rots.includes(70),'slider at 70 stays 70: '+rots);
// (2) tracking flicker vs real loss vs content hiding, on syncMedia with explicit clock
const m=await p.evaluate(()=>{
  const c=document.createElement('div'),n=document.createElement('div');n.dataset.elId='v1';c.appendChild(n);document.body.appendChild(c);
  const root={visible:true,parent:null};c.object3D=root;n.object3D={visible:true,parent:root};
  const node={paused:false,muted:true,plays:0,pauses:0,play(){this.paused=false;this.plays++;return Promise.resolve();},pause(){this.paused=true;this.pauses++;}};
  const media=[{kind:'video',el:{id:'v1'},node,_studioBaseAllowed:true}];c._studioMedia=media;const rec={elements:[{id:'v1',type:'video'}]};
  const out={};let t=0;
  for(let i=0;i<40;i++){root.visible=i%3!==0;Studio.syncMedia(c,rec,t);t+=50;} out.flicker={pauses:node.pauses,paused:node.paused};
  root.visible=true;Studio.syncMedia(c,rec,t);
  root.visible=false;Studio.syncMedia(c,rec,t);Studio.syncMedia(c,rec,t+900);out.at900=node.paused;Studio.syncMedia(c,rec,t+1000);out.at1000=node.paused;
  root.visible=true;Studio.syncMedia(c,rec,t+1100);out.backPlays=node.plays;out.backPaused=node.paused;
  n.object3D.visible=false;Studio.syncMedia(c,rec,t+1150);out.contentPaused=node.paused;
  c.remove();return out;});
assert.deepEqual(m.flicker,{pauses:0,paused:false},'tracking flicker never pauses: '+JSON.stringify(m.flicker));
assert.equal(m.at900,false,'still playing 0.9s into a loss');assert.equal(m.at1000,true,'paused after 1s of continuous loss');
assert.equal(m.backPaused,false,'resumes as soon as the artwork is back');assert.equal(m.backPlays,1,'one resume');
assert.equal(m.contentPaused,true,'a hidden layer still pauses at once');
// (3) sound button + touch unmutes every video, unlocks a paused (blocked) one, then removes the button
const s=await p.evaluate(async()=>{
  const mk=(blocked,paused)=>({paused,muted:true,_studioBlocked:blocked,plays:0,pauses:0,play(){this.paused=false;this.plays++;return Promise.resolve();},pause(){this.paused=true;this.pauses++;}});
  const a=mk(false,false),bl=mk(true,true),snd=mk(false,true);
  const media=[{kind:'video',el:{id:'a'},node:a},{kind:'video',el:{id:'b'},node:bl},{kind:'audio',el:{id:'s'},node:snd}];
  Studio.soundOnTouch(media,{});const shown=!!document.querySelector('#sound-overlay');const text=shown?document.querySelector('#sound-overlay').textContent:'';
  window.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));await new Promise(r=>setTimeout(r,50));
  return {shown,text,gone:!document.querySelector('#sound-overlay'),aMuted:a.muted,bMuted:bl.muted,bPlays:bl.plays,bPaused:bl.paused,bResume:media[1].resumeOnVisible,sndPlaying:!snd.paused};});
assert.ok(s.shown&&/צליל/.test(s.text),'sound button shown: '+s.text);assert.ok(s.gone,'button removed after the touch');
assert.equal(s.aMuted,false,'playing video unmuted');assert.equal(s.bMuted,false,'paused (blocked) video unmuted too');
assert.ok(s.bPlays===1&&s.bPaused,'blocked video unlocked with a play/pause inside the touch');assert.equal(s.bResume,true,'it resumes when visible');
assert.ok(s.sndPlaying,'sound element started');
const silent=await p.evaluate(()=>{const q=[{kind:'video',el:{id:'z',volume:0},node:{paused:false,muted:true,play(){return Promise.resolve();},pause(){}}}];Studio.soundOnTouch(q,{});return !!document.querySelector('#sound-overlay');});
assert.equal(silent,false,'no sound button when every layer is silent');
// (4) size limits
const lim=await p.evaluate(()=>({l:Studio.LIMITS,ok30:Studio.addBlocker(Studio.blankExperience('x'),{bytes:30*1048576}),over:Studio.addBlocker(Studio.blankExperience('x'),{bytes:Studio.LIMITS.maxEntryBytes+1})}));
assert.equal(lim.l.maxEntryBytes,50*1048576);assert.equal(lim.l.maxMediaBytes,100*1048576);assert.equal(lim.l.maxPublishBytes,40*1048576,'publish cap unchanged');
assert.equal(lim.ok30,null,'a 30MB video is accepted');assert.ok(lim.over&&lim.over.includes('50MB'),'over 50MB refused: '+lim.over);
assert.deepEqual(pageErrors,[],'no page errors');
console.log('PASS media-sound-rotate (headless, simulated media; not an iPhone)');
}finally{await b.close();server.close();}})().catch(e=>{console.error(e&&e.stack||e);process.exit(1)});
