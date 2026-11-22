const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');
// Real gravity, the cover pictures of the code animations, and the snap to the artwork's size.
// A layer with el.gravity keeps its motion upright in the world: turned 90 degrees, confetti still falls down the
// screen and lanterns, jellyfish and bubbles still rise; a hung picture turns back to hang straight. The switch shows
// only for layers it suits and the import check takes nothing but true or false. Every code animation tile shows its
// cover picture. A resize that comes close to the artwork's full width snaps onto it exactly.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
  const p=await ctx.newPage(),errs=[];p.on('pageerror',e=>errs.push(String(e)));p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await p.goto(base+'/index.html');await p.waitForFunction(()=>typeof Studio!=='undefined'&&typeof Inspector!=='undefined'&&window.StudioCodeFx);
  const id=await p.evaluate(async()=>{const a=Studio.blankExperience('g');a.target={artRatio:0.75,artRect:{x:0,y:0,w:300,h:400},natural:{w:300,h:400}};
    const c=document.createElement('canvas');c.width=300;c.height=400;const g=c.getContext('2d');g.fillStyle='#345';g.fillRect(0,0,300,400);
    a.assets.__artwork=await new Promise(r=>c.toBlob(r,'image/png'));a.assets.pic=a.assets.__artwork;a.elements=[];await Studio.save(a);return a.id;});
  await p.goto(base+'/index.html#/e/'+id);await p.waitForSelector('#btn-add');await p.waitForTimeout(600);

  // the cover pictures
  await p.evaluate(()=>Layers.openAdd());await p.locator('button.add-tile[data-add="codefx"]').tap();
  await p.waitForSelector('button.part-tile[data-codefx="lanterns"] img');
  await p.waitForFunction(()=>[...document.querySelectorAll('button.part-tile[data-codefx] img')].every(i=>i.complete&&i.naturalWidth>0),null,{timeout:10000});
  assert.equal(await p.locator('button.part-tile[data-codefx] img').count(),18,'seventeen looks and the foil, each with its picture');
  assert.deepEqual(await p.evaluate(()=>['shatter','rain','ripple','aurora'].map(l=>Studio.gravityFits({type:'codefx',codefx:{look:l}}))),[true,true,false,false],'glass shards and rain follow gravity');
  await p.keyboard.press('Escape');await p.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));

  const add=async(el,flat)=>{const r=await p.evaluate(async(e)=>{e=Object.assign({id:Studio.newId(),x:0,y:0,w:0.8,z:0,flush:true,seq:null,aspect:0.75,h:0.8},e);if(e.type==='codefx'){e.codefx=Object.assign(Studio.codeFxDefaults(e.look),e.fx||{});delete e.look;delete e.fx;}await App.addLayer(e);App.select(null);return e.id;},el);
    if(!flat)await p.waitForFunction((i)=>{try{return !!Editor3D._test.node(i);}catch(e){return false;}},r,{timeout:15000});return r;};
  // which way the layer's things move on the screen (world): the middle of many
  const flow=(lid,kind,ms=150)=>p.evaluate(async([lid,kind,ms])=>{const n0=Editor3D._test.node(lid),V=THREE.Vector3;
    const sample=()=>{const out=[];if(kind==='particles'){const n=[n0,...n0.querySelectorAll('*')].find(x=>x.components&&x.components.particles),pts=n.components.particles.points;pts.updateMatrixWorld(true);const a=pts.geometry.attributes.position.array;for(let i=0;i<a.length;i+=3)out.push(new V(a[i],a[i+1],a[i+2]).applyMatrix4(pts.matrixWorld));}
      else{let mesh=null;n0.object3D.traverse(o=>{if(o.isInstancedMesh&&!mesh)mesh=o;});mesh.updateMatrixWorld(true);const M=new THREE.Matrix4();for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,M);out.push(new V().setFromMatrixPosition(M).applyMatrix4(mesh.matrixWorld));}}return out;};
    const a=sample();await new Promise(r=>setTimeout(r,ms));const c=sample();const X=[],Y=[];for(let i=0;i<a.length;i++){X.push(c[i].x-a[i].x);Y.push(c[i].y-a[i].y);}const med=(v)=>v.sort((p,q)=>p-q)[v.length>>1];return {dx:med(X),dy:med(Y)};},[lid,kind,ms]);
  const P={type:'particles',name:'p',particles:{preset:'confetti',count:200,color:'#ffd94d',size:16,speed:1.5}};
  let l=await add(Object.assign({},P,{rot:90}));await p.waitForTimeout(600);let f=await flow(l,'particles');
  assert.ok(Math.abs(f.dx)>Math.abs(f.dy)*3,'without gravity, confetti turned with its layer runs sideways '+JSON.stringify(f));await p.evaluate(i=>App.removeLayer(i),l);
  l=await add(Object.assign({},P,{rot:90,gravity:true}));await p.waitForTimeout(600);f=await flow(l,'particles');
  assert.ok(f.dy<0&&Math.abs(f.dy)>Math.abs(f.dx)*3,'with gravity it falls down '+JSON.stringify(f));await p.evaluate(i=>App.removeLayer(i),l);
  for(const look of ['lanterns','jelly','bubbles']){
    l=await add({type:'codefx',look,rot:90,gravity:true,fx:{amount:1}});await p.waitForTimeout(900);f=await flow(l,'inst',look==='jelly'?900:150); // a jellyfish drifts aside between beats
    assert.ok(f.dy>0&&f.dy>Math.abs(f.dx)*(look==='jelly'?1:2),look+' rise up with gravity '+JSON.stringify(f));await p.evaluate(i=>App.removeLayer(i),l);
  }
  l=await add({type:'image',name:'pic',assetId:'pic',rot:40,gravity:true});await p.waitForTimeout(3000);
  const hang=await p.evaluate(lid=>{const n0=Editor3D._test.node(lid),n=n0&&[n0,...n0.querySelectorAll('*')].find(x=>x.components&&x.components['studio-hang']),m=n&&n.getObject3D('mesh');return m?m.rotation.z*180/Math.PI:null;},l);
  assert.ok(hang!=null&&Math.abs(hang+40)<4,'a hung picture turns back to hang straight: '+hang);
  // the switch: shown for the picture, sets el.gravity; not offered for a portal
  await p.evaluate(i=>App.select(i),l);if(await p.locator('.tab[data-tab="style"]').isVisible())await p.locator('.tab[data-tab="style"]').tap();
  const sw=p.locator('section.group',{hasText:'גרביטציה'});await sw.waitFor();
  await p.evaluate(i=>{const e=App.el(i);delete e.gravity;App.changed(true);App.select(null);App.select(i);},l);await p.waitForTimeout(300);
  assert.equal(await sw.locator('input[role=switch]').isChecked(),false);
  await sw.locator('label.ctl-toggle').tap();await p.waitForTimeout(200);
  assert.equal(await p.evaluate(i=>App.el(i).gravity,l),true,'the switch turns gravity on');
  await p.evaluate(i=>App.removeLayer(i),l);
  l=await add({type:'codefx',look:'portal'});await p.evaluate(i=>App.select(i),l);await p.waitForTimeout(300);
  assert.equal(await p.locator('section.group',{hasText:'גרביטציה'}).count(),0,'no gravity switch for a portal');await p.evaluate(i=>App.removeLayer(i),l);
  // the import check
  const imp=await p.evaluate(async()=>{const e={id:Studio.newId(),type:'particles',name:'p',particles:{preset:'confetti'},x:0,y:0,w:0.5,h:0.5,aspect:0.75,rot:0,z:0,flush:true,seq:null,gravity:true};await App.addLayer(e);
    const ok=(await Studio.importJSON(await Studio.exportJSON(App.rec),{save:false})).elements.some(x=>x.gravity===true);
    const o=JSON.parse(await Studio.exportJSON(App.rec));o.elements.find(x=>x.gravity).gravity='yes';let bad;try{await Studio.importJSON(JSON.stringify(o),{save:false});bad=false;}catch(err){bad=err.message;}await App.removeLayer(e.id);return {ok,bad};});
  assert.equal(imp.ok,true);assert.match(String(imp.bad),/gravity/);

  // the settings: no power keeps the design's turn, flip sends confetti up
  l=await add(Object.assign({},P,{rot:90,gravity:true,gravityTune:{power:0}}));await p.waitForTimeout(600);f=await flow(l,'particles');
  assert.ok(Math.abs(f.dx)>Math.abs(f.dy)*3,'power 0: it keeps its own turn '+JSON.stringify(f));await p.evaluate(i=>App.removeLayer(i),l);
  l=await add(Object.assign({},P,{rot:90,gravity:true,gravityTune:{flip:true}}));await p.waitForTimeout(600);f=await flow(l,'particles');
  assert.ok(f.dy>0&&Math.abs(f.dy)>Math.abs(f.dx)*3,'flipped: it rises '+JSON.stringify(f));
  // the controls show once gravity is on, the pile's only after the pile is on
  await p.evaluate(i=>App.select(i),l);await p.waitForTimeout(300);
  const grp=p.locator('section.group',{hasText:'גרביטציה'});await grp.waitFor();
  for(const t of ['עוצמה','מהירות תגובה','התעלמות מרעידות','הפוך כיוון','הצטברות'])assert.ok(await grp.locator('.ctl-label',{hasText:t}).count()>0,t);
  assert.equal(await grp.getByText('גובה הערימה').count(),0);
  await grp.locator('label.ctl-toggle',{hasText:'הצטברות'}).tap();await p.waitForTimeout(300);
  assert.equal(await p.evaluate(i=>App.el(i).gravityTune.pile,l),true);assert.ok(await grp.getByText('גובה הערימה').count()>0,'pile controls');
  await p.evaluate(i=>App.removeLayer(i),l);
  // the pile: confetti collect on the low side; turned a quarter, the heap pours to the new low side
  l=await add(Object.assign({},P,{particles:Object.assign({},P.particles,{count:400,speed:3}),gravity:true,gravityTune:{pile:true,pileRate:1}}));await p.waitForTimeout(5000);
  const heap=()=>p.evaluate(lid=>{const n0=Editor3D._test.node(lid),n=[n0,...n0.querySelectorAll('*')].find(x=>x.components&&x.components.particles),c=n.components.particles,P=c.pile;if(!P)return null;
    let sx=0,sy=0;for(let g=0;g<P.n;g++){sx+=P.pos[g*3];sy+=P.pos[g*3+1];}return {n:P.n,x:sx/P.n/c.data.width,y:sy/P.n/c.data.height,down:[c.grav.sin,-c.grav.cos]};},l);
  let h1=await heap();assert.ok(h1&&h1.n>30&&h1.y<-0.3,'a heap at the bottom '+JSON.stringify(h1));
  await p.evaluate(i=>{App.el(i).rot=90;App.changed(true);},l);await p.waitForTimeout(4000);
  const h2=await heap();assert.ok(h2&&h2.n>=h1.n*0.8,'the heap stays when the layer turns '+JSON.stringify(h2));
  assert.ok(h2.x*h2.down[0]>0.22&&h2.y>h1.y+0.05,'it poured to the new low side '+JSON.stringify([h1,h2]));
  await p.evaluate(i=>App.removeLayer(i),l);
  const badTune=await p.evaluate(async()=>{const o=JSON.parse(await Studio.exportJSON(App.rec));o.elements.push({id:'tt',type:'image',assetId:'pic',x:0,y:0,w:0.5,h:0.5,aspect:0.75,rot:0,z:0,gravity:true,gravityTune:{power:2}});try{await Studio.importJSON(JSON.stringify(o),{save:false});return false;}catch(e){return e.message;}});
  assert.match(String(badTune),/gravity settings/);

  // the snap: a picture at 97% of the artwork's width, made a little bigger, lands on 100%
  l=await add({type:'image',name:'s',assetId:'pic',w:0.96,h:0.96},true);await p.evaluate(i=>App.select(i),l);await p.waitForTimeout(300);
  const c=await p.evaluate(()=>{const v=Stage.view,r=document.querySelector('#stage canvas, canvas').getBoundingClientRect();return {x:r.left+v.mx+v.W/2,y:r.top+v.my+v.H/2};});
  await p.mouse.move(c.x,c.y);await p.mouse.wheel(0,-10);await p.waitForTimeout(500);
  assert.equal(await p.evaluate(i=>App.el(i).w,l),1,'snapped onto the full width');
  await p.evaluate(i=>{const e=App.el(i);e.w=0.5;e.h=0.5;App.changed(true);},l);await p.waitForTimeout(200);
  await p.mouse.wheel(0,-10);await p.waitForTimeout(500);
  const w2=await p.evaluate(i=>App.el(i).w,l);assert.ok(w2>0.5&&w2<0.6,'far from the full size it grows freely: '+w2);
  assert.deepEqual(errs.filter(e=>!/favicon|GL Driver|deprecated/i.test(e)),[]);
  console.log('ok gravity, covers and snap');
 }finally{await b.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
