// The little game (codefx look "game") on the preview page: taps catch the things, a round ends with a card and this phone's best.
const assert=require('assert');
const {chromium}=require('playwright-core');const server=require('../../server/server');
const OUT=process.env.SHOTS||'', KIND=Number(process.env.KIND||0);
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true,isMobile:true});
  const p=await ctx.newPage();p.on('pageerror',e=>console.log('ERR',String(e)));p.on('console',m=>{if(m.type()==='error')console.log('ERR',m.text().slice(0,400));});
  await p.goto(base+'/index.html');await p.waitForFunction(()=>typeof Studio!=='undefined'&&window.StudioCodeFx);
  const cid=await p.evaluate(async(kind)=>{const a=Studio.blankExperience('c');a.target={artRatio:1,artRect:{x:0,y:0,w:600,h:600},natural:{w:600,h:600}};
    const c=document.createElement('canvas');c.width=c.height=600;const g=c.getContext('2d');const gr=g.createLinearGradient(0,0,0,600);[[0,'#0b1030'],[1,'#3a2a6a']].forEach(([o,col])=>gr.addColorStop(o,col));g.fillStyle=gr;g.fillRect(0,0,600,600);
    a.assets.__artwork=await new Promise(r=>c.toBlob(r,'image/png'));
    const f=Object.assign(Studio.codeFxDefaults('game'),{kind});a.elements=[{id:Studio.newId(),type:'codefx',name:'game',codefx:f,x:0,y:0,w:1,h:1,aspect:1,rot:0,z:0,flush:true,seq:null}];await Studio.save(a);return a.id;},KIND);
  await p.goto(base+'/preview.html#'+cid);
  await p.waitForFunction(()=>{const n=document.querySelector('[studio-codefx]');return n&&n.components['studio-codefx'].parts&&n.components['studio-codefx'].parts.game;},null,{timeout:20000});
  await p.waitForTimeout(3500);
  if(OUT)await p.screenshot({path:OUT+'/game'+KIND+'-a.png'});
  let hits=0;
  for(let k=0;k<8;k++){
    const pt=await p.evaluate(()=>{const C=document.querySelector('[studio-codefx]').components['studio-codefx'],G=C.parts.game,t=G.things.find(t=>t.live&&!t.pop);if(!t)return null;
      const v=new THREE.Vector3(t.x,t.y,0);C.group.localToWorld(v);v.project(C.el.sceneEl.camera);const r=C.el.sceneEl.canvas.getBoundingClientRect();return {x:r.left+(v.x+1)/2*r.width,y:r.top+(1-v.y)/2*r.height};});
    if(pt){await p.touchscreen.tap(pt.x,pt.y);hits++;}
    await p.waitForTimeout(250);
  }
  await p.waitForTimeout(100);if(OUT)await p.screenshot({path:OUT+'/game'+KIND+'-b.png'});
  const score=await p.evaluate(()=>document.querySelector('[studio-codefx]').components['studio-codefx'].parts.game.score);
  console.log('taps',hits,'score',score);assert.ok(hits>=5,'there were things to tap');assert.equal(score,hits,'every tap on a thing is a point');
  await p.evaluate(()=>document.querySelector('[studio-codefx]').components['studio-codefx'].parts.game.finish());await p.waitForTimeout(900);
  if(OUT)await p.screenshot({path:OUT+'/game'+KIND+'-c.png'});
  assert.equal(await p.evaluate(()=>document.querySelector('[studio-codefx]').components['studio-codefx'].parts.game.state),'end','the round ends');
  assert.equal(await p.evaluate(()=>localStorage.getItem('brill-game-best')),String(score),'the best is kept on this phone');
  // a tap on the card starts a new round
  const box=await p.evaluate(()=>{const r=document.querySelector('a-scene').canvas.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};});
  await p.touchscreen.tap(box.x,box.y);await p.waitForTimeout(400);
  assert.equal(await p.evaluate(()=>document.querySelector('[studio-codefx]').components['studio-codefx'].parts.game.state),'play','a tap starts a new round');
  console.log('v2-game ok');
 }finally{await b.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
