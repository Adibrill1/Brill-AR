const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');
// "על כל היצירה": one tap spreads the selected layer over the whole artwork, from the bar over the stage or from
// "מקום וגודל". Pictures fill it cropped, particles, weather and code animations take its exact rectangle, a scatter
// spreads its copies over it, a group and a text grow as big as fits. Rising particles with a pile collect at the top.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
  const p=await ctx.newPage(),errs=[];p.on('pageerror',e=>errs.push(String(e)));p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await p.goto(base+'/index.html');await p.waitForFunction(()=>typeof Studio!=='undefined'&&typeof Inspector!=='undefined'&&window.StudioCodeFx);
  const id=await p.evaluate(async()=>{const a=Studio.blankExperience('s');a.target={artRatio:0.75,artRect:{x:0,y:0,w:300,h:400},natural:{w:300,h:400}};
    const c=document.createElement('canvas');c.width=300;c.height=400;const g=c.getContext('2d');g.fillStyle='#345';g.fillRect(0,0,300,400);
    a.assets.__artwork=await new Promise(r=>c.toBlob(r,'image/png'));const d=document.createElement('canvas');d.width=200;d.height=100;d.getContext('2d').fillRect(0,0,200,100);
    a.assets.pic=await new Promise(r=>d.toBlob(r,'image/png'));a.elements=[];await Studio.save(a);return a.id;});
  await p.goto(base+'/index.html#/e/'+id);await p.waitForSelector('#btn-add');await p.waitForTimeout(600);
  const add=(e)=>p.evaluate(async(e)=>{e=Object.assign({id:Studio.newId(),x:0.2,y:-0.15,w:0.4,z:0,rot:25,flush:true,seq:null,aspect:2,h:0.27},e);if(e.type==='codefx'){e.codefx=Studio.codeFxDefaults(e.look);delete e.look;}if(e.plook){e.pattern=Studio.patternDefaults(e.plook);delete e.plook;}await App.addLayer(e);App.select(e.id);return e.id;},e);
  const get=(i)=>p.evaluate(i=>{const e=App.el(i);return {x:e.x,y:e.y,w:e.w,h:e.h,rot:e.rot,crop:e.crop||null};},i);
  const near=(a,b,t=0.02)=>Math.abs(a-b)<=t;
  const spreadBar=async()=>{await p.locator('#bar-spread').tap();await p.waitForTimeout(250);};
  // exact rectangle: particles, weather, code animation
  for(const e of [{type:'particles',name:'p',particles:{preset:'confetti'}},{type:'pattern',name:'w',plook:'fire'},{type:'codefx',name:'c',look:'fireflies'}]){
    const l=await add(e);await spreadBar();const r=await get(l);
    assert.ok(near(r.x,0)&&near(r.y,0)&&near(r.w,1)&&near(r.h,1)&&r.rot===0,e.type+' spreads over the artwork '+JSON.stringify(r));await p.evaluate(i=>App.removeLayer(i),l);
  }
  // a picture fills it, cropped to its shape - from the button in "מקום וגודל"
  let l=await add({type:'image',name:'i',assetId:'pic'});await p.waitForTimeout(200);
  await p.waitForSelector('#btn-spread',{state:'attached'});await p.evaluate(()=>document.querySelector('#btn-spread').click());await p.waitForTimeout(250);
  let r=await get(l);assert.ok(near(r.w,1)&&near(r.h,1)&&r.crop&&r.crop.w<1,'the picture fills it, cropped '+JSON.stringify(r));await p.evaluate(i=>App.removeLayer(i),l);
  // a text: as big as fits
  l=await p.evaluate(async()=>{const e={id:Studio.newId(),type:'text',name:'t',text:'שלום',color:'#fff',x:0.3,y:0.3,w:0.3,h:null,rot:10,z:0,flush:true,seq:null};Stage.fitText(e);await App.addLayer(e);App.select(e.id);return e.id;});
  await spreadBar();r=await get(l);assert.ok(r.w<=1.001&&r.h<=1.001&&(near(r.w,1)||near(r.h,1))&&near(r.x,0),'the text grows as big as fits '+JSON.stringify(r));await p.evaluate(i=>App.removeLayer(i),l);
  // a group of two pictures: as big as fits, centred
  const gid=await p.evaluate(async()=>{const ids=[];for(const [x,y] of [[-0.2,0.1],[0.1,-0.1]]){const e={id:Studio.newId(),type:'image',name:'g',assetId:'pic',x,y,w:0.2,h:0.2/2*0.75,aspect:2,rot:0,z:0,flush:true,seq:null};await App.addLayer(e);ids.push(e.id);}
    const g=Studio.makeGroup(App.rec,ids);App.changed(true);App.select(g.id);return g.id;});
  await p.waitForTimeout(300);await spreadBar();
  const gb=await p.evaluate(i=>{const g=App.el(i);Studio.fitGroup(App.rec,g);return {x:g.x,y:g.y,w:g.w,h:g.h};},gid);
  assert.ok(gb.w<=1.01&&gb.h<=1.01&&(near(gb.w,1)||near(gb.h,1))&&near(gb.x,0)&&near(gb.y,0),'the group grows as big as fits '+JSON.stringify(gb));
  await p.evaluate(i=>{App.removeLayer(i);App.rec.elements.slice().forEach(e=>App.removeLayer(e.id));},gid);
  // a scatter: its copies spread over the artwork
  const sid=await p.evaluate(async()=>{const src={id:'src',type:'image',name:'s',assetId:'pic',aspect:2,w:0.1,h:0.0375};const sc=Studio.makeScatter(App.rec,src,[{x:-0.1,y:0},{x:0,y:0.1},{x:0.1,y:0}],{count:8});await App.addLayer(sc);App.select(sc.id);return sc.id;});
  await p.waitForTimeout(300);await spreadBar();r=await get(sid);
  assert.ok(near(r.w,1,0.03)&&near(r.h,1,0.03)&&near(r.x,0)&&near(r.y,0),'the scatter spreads over it '+JSON.stringify(r));await p.evaluate(i=>App.removeLayer(i),sid);
  // rising particles pile against the top
  l=await p.evaluate(async()=>{const e={id:Studio.newId(),type:'particles',name:'up',particles:{preset:'sparkle',count:400,speed:3},x:0,y:0,w:0.8,h:0.8,aspect:0.75,rot:0,z:0,flush:true,seq:null,gravity:true,gravityTune:{pile:true,pileRate:1}};await App.addLayer(e);App.select(null);return e.id;});
  await p.waitForFunction((i)=>{try{return !!Editor3D._test.node(i);}catch(e){return false;}},l,{timeout:15000});await p.waitForTimeout(5000);
  const top=await p.evaluate(lid=>{const n0=Editor3D._test.node(lid),n=[n0,...n0.querySelectorAll('*')].find(x=>x.components&&x.components.particles),c=n.components.particles,P=c.pile;if(!P)return null;let sy=0;for(let g=0;g<P.n;g++)sy+=P.pos[g*3+1];return {n:P.n,up:P.up,y:sy/P.n/c.data.height};},l);
  assert.ok(top&&top.up&&top.n>30&&top.y>0.3,'rising sparkles collect at the top '+JSON.stringify(top));
  assert.deepEqual(errs.filter(e=>!/favicon|GL Driver|deprecated/i.test(e)),[]);
  console.log('ok spread and top pile');
 }finally{await b.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
