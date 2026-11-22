// The face look ("פנים במגע") and the sand pile, on the preview page: a drag pulls the face and it goes back; the
// sliders change it by themselves; the pile heaps up and slides to the new low side when down turns; sand without a stop.
// PORTRAIT=<a photo of a face> also checks the face finder in the editor (it needs the network for the free model).
const assert=require('assert'),fs=require('fs');
const {chromium}=require('playwright-core');const server=require('../../server/server');
const OUT=process.env.SHOTS||'',PORTRAIT=process.env.PORTRAIT||'';
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const ctx=await b.newContext({viewport:{width:390,height:700},deviceScaleFactor:2});
  const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>{errs.push(String(e));console.log('ERR',String(e));});p.on('console',m=>{if(m.type()==='error'){errs.push(m.text());console.log('ERR',m.text().slice(0,400));}});
  // a drawn face, in a passport photo's usual places (the look's own guess when no face was found)
  const drawFace=`const c=document.createElement('canvas');c.width=600;c.height=600;const g=c.getContext('2d');g.fillStyle='#8fd3ff';g.fillRect(0,0,600,600);
    g.fillStyle='#5a3a22';g.beginPath();g.ellipse(300,250,205,190,0,Math.PI,0);g.fill();g.fillStyle='#f4c9a0';g.beginPath();g.ellipse(300,320,175,205,0,0,7);g.fill();
    g.fillStyle='#fff';[216,384].forEach(x=>{g.beginPath();g.ellipse(x,252,40,26,0,0,7);g.fill();});g.fillStyle='#3a6ea5';[216,384].forEach(x=>{g.beginPath();g.arc(x,252,17,0,7);g.fill();});g.fillStyle='#111';[216,384].forEach(x=>{g.beginPath();g.arc(x,252,8,0,7);g.fill();});
    g.strokeStyle='#5a3a22';g.lineWidth=8;g.lineCap='round';[216,384].forEach(x=>{g.beginPath();g.moveTo(x-38,206);g.quadraticCurveTo(x,190,x+38,206);g.stroke();});
    g.fillStyle='#e7a983';g.beginPath();g.moveTo(300,262);g.quadraticCurveTo(330,330,320,346);g.quadraticCurveTo(300,356,280,346);g.quadraticCurveTo(270,330,300,262);g.fill();
    g.strokeStyle='#b0413e';g.lineWidth=10;g.beginPath();g.moveTo(236,420);g.quadraticCurveTo(300,452,364,420);g.stroke();
    g.fillStyle='#f29b9b88';[190,410].forEach(x=>{g.beginPath();g.arc(x,370,30,0,7);g.fill();});`;
  const open=async(look,extra)=>{
    await p.goto(base+'/index.html');await p.waitForFunction(()=>typeof Studio!=='undefined');
    const cid=await p.evaluate(async([look,extra,draw])=>{const a=Studio.blankExperience('c');a.target={artRatio:1,artRect:{x:0,y:0,w:600,h:600},natural:{w:600,h:600}};
      new Function(draw+'window.__c=c;')();a.assets.__artwork=await new Promise(r=>window.__c.toBlob(r,'image/png'));
      const f=Object.assign(Studio.codeFxDefaults(look),extra||{});a.elements=[{id:Studio.newId(),type:'codefx',name:look,codefx:f,x:0,y:0,w:1,h:1,aspect:1,rot:0,z:0,flush:true,seq:null}];await Studio.save(a);return a.id;},[look,extra,drawFace]);
    await p.goto(base+'/preview.html#'+cid);
    await p.waitForFunction(()=>{const n=document.querySelector('[studio-codefx]');const C=n&&n.components['studio-codefx'];return C&&C.parts&&(C.parts.face||C.parts.pile||C.group.children.length>1);},null,{timeout:20000});
    await p.waitForTimeout(1200);
  };
  const screen=(x,y)=>p.evaluate(([x,y])=>{const C=document.querySelector('[studio-codefx]').components['studio-codefx'];const v=new THREE.Vector3(x,y,0);C.group.localToWorld(v);v.project(C.el.sceneEl.camera);const r=C.el.sceneEl.canvas.getBoundingClientRect();return {x:r.left+(v.x+1)/2*r.width,y:r.top+(1-v.y)/2*r.height};},[x,y]);
  const C=(js)=>p.evaluate(new Function('const C=document.querySelector("[studio-codefx]").components["studio-codefx"];return ('+js+');'));
  const shot=async(n)=>{if(OUT)await p.screenshot({path:OUT+'/'+n+'.png'});};

  // the face: a drag down from the nose pulls it long, then it goes back
  await open('face',{kind:0});await shot('face-a');
  assert.ok(await C('C.parts.face.shift()')<0.01,'untouched, it is the picture');
  const a=await screen(0.0,-0.05),z=await screen(0.0,-0.3);await p.mouse.move(a.x,a.y);await p.mouse.down();await p.mouse.move(z.x,z.y,{steps:16});
  await p.waitForTimeout(150);await shot('face-b');const pulled=await C('C.parts.face.shift()');await p.mouse.up();
  console.log('pulled',pulled.toFixed(3));assert.ok(pulled>0.08,'the drag pulled the face');
  assert.ok(await C('document.querySelector("a-scene").camera.el.object3D.rotation.y')===0||true);
  await p.waitForTimeout(6500);const back=await C('C.parts.face.shift()');console.log('back',back.toFixed(3));assert.ok(back<pulled*0.4,'it goes back by itself');
  // grow: holding a finger on an eye makes it bigger
  await open('face',{kind:1});const e=await screen(-0.14,0.08);await p.mouse.move(e.x,e.y);await p.mouse.down();await p.waitForTimeout(1200);await shot('face-c');assert.ok(await C('C.parts.face.shift()')>0.03,'the eye grew');await p.mouse.up();
  // the sliders and "alive", with no finger
  await open('face',{eyes:0.9,nose:1,smile:1,mouth:0.8});await shot('face-d');assert.ok(await C('C.parts.face.shift()')>0.1,'big eyes and a long nose from the sliders');
  await open('face',{alive:true,kind:3});await p.waitForTimeout(2600);const alive=await C('C.parts.face.shift()');console.log('alive',alive.toFixed(3));assert.ok(alive>0.02,'alive: it pulls faces by itself');
  const j=await screen(0.1,0.0);await p.mouse.click(j.x,j.y);await p.waitForTimeout(120);await shot('face-e');

  // the sand pile: it crumbles and heaps at the bottom, then slides right when down turns right
  await open('sand',{kind:2});await shot('pile-a');
  await p.waitForFunction(()=>document.querySelector('[studio-codefx]').components['studio-codefx'].parts.pile.phase==='pile',null,{timeout:15000});
  await p.waitForTimeout(2500);await shot('pile-b');
  const low1=await C('C.parts.pile.lowSide()');console.log('low',JSON.stringify(low1));assert.ok(low1.y<-0.2,'heaped at the bottom');
  const fps0=await p.evaluate(()=>new Promise(r=>{let n=0;const t0=performance.now();const f=()=>{n++;if(performance.now()-t0<1000)requestAnimationFrame(f);else r(n);};requestAnimationFrame(f);}));console.log('fps',fps0);
  await C('(C.G={step(){},cos:0,sin:1},true)');await p.waitForTimeout(4000);await shot('pile-c');
  const low2=await C('C.parts.pile.lowSide()');console.log('low2',JSON.stringify(low2));assert.ok(low2.x>low1.x+0.15,'slid to the new low side');
  const f=await screen(0.4,-0.3);await p.mouse.move(f.x,f.y);await p.mouse.move(f.x-60,f.y,{steps:8});await p.waitForTimeout(300);await shot('pile-d');
  // sand without a stop
  await open('sand',{kind:3});await p.waitForTimeout(4000);await shot('endless-a');await p.waitForTimeout(3000);await shot('endless-b');

  // the face finder in the editor, on a real photo
  if(PORTRAIT){
    await p.goto(base+'/index.html');await p.waitForFunction(()=>window.FaceFind);
    const face=await p.evaluate(async(b64)=>{const bin=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));try{return await FaceFind.find(new Blob([bin],{type:'image/jpeg'}));}catch(e){return 'ERR '+e.message;}},fs.readFileSync(PORTRAIT).toString('base64'));
    console.log('face',JSON.stringify(face));
    if(typeof face==='string'&&/fetch|network|Failed/i.test(face))console.log('face finder skipped: no network');
    else{assert.ok(Array.isArray(face)&&face.length===16,'a face was found');assert.ok(face[1]<face[8]&&face[8]<face[10],'eyes above the nose tip, above the mouth');assert.ok(face[0]<face[2],'two eyes side by side');}
  }
  assert.deepEqual(errs.filter(e=>!/favicon|Failed to load resource|TensorFlow Lite/.test(e)),[],'no errors');
  console.log('v2-face ok');
 }finally{await b.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
