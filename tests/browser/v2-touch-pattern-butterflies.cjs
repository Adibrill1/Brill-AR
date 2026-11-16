const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');
// (1) An animated background that answers the finger (el.pattern.touch: ripple, lens, swirl). In the preview page the
// picture under the pointer changes while it is pressed there, the view does not turn with that drag, and it settles
// back after letting go; a background without touch does not change and lets the view turn. The editor's "מגע" group
// writes the choice, and nonsense is refused on import. (2) Butterflies in the particle library: wings that flap
// (particles.flap), kept in storage, with a control for the pace. Headless Chrome, a mouse; not an iPhone.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});try{
  const ctx=await b.newContext({viewport:{width:390,height:844}});
  const p=await ctx.newPage(),errs=[];p.on('pageerror',e=>errs.push(String(e)));p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  const shot=async(n)=>{if(process.env.SHOTS)await p.screenshot({path:process.env.SHOTS+'/'+n+'.png'});};
  await p.goto(base+'/index.html');await p.waitForFunction(()=>typeof Studio!=='undefined');
  const make=(els)=>p.evaluate(async(els)=>{const c=document.createElement('canvas');c.width=300;c.height=400;c.getContext('2d').fillRect(0,0,300,400);const a=Studio.blankExperience('מגע');a.target={artRect:{x:0,y:0,w:300,h:400},natural:{w:300,h:400}};
    a.assets.__artwork=await new Promise(r=>c.toBlob(r,'image/png'));
    a.elements=els.map(e=>e.type==='pattern'?Object.assign({x:0,y:0,w:1,h:1,rot:0,z:0,flush:true,seq:null,aspect:0.75},e,{pattern:Object.assign(Studio.patternDefaults('stripes'in{}?'stripes':Studio.PATTERNS[0].id),{speed:0},e.pattern)}):e);
    await Studio.save(a);return a.id;},els);
  const openPat=async(id)=>{await p.goto(base+'/preview.html#'+id);await p.reload();await p.waitForFunction(()=>{const e=document.querySelector('[studio-pattern]');return e&&e.components&&e.components['studio-pattern']&&e.getObject3D('mesh');},null,{timeout:20000});await p.waitForTimeout(1200);};
  const screen=(u,v)=>p.evaluate(([u,v])=>{const e=document.querySelector('[studio-pattern]'),m=e.getObject3D('mesh'),g=m.geometry.parameters,sc=e.sceneEl,q=new THREE.Vector3((u-0.5)*g.width,(v-0.5)*g.height,0);m.updateWorldMatrix(true,false);q.applyMatrix4(m.matrixWorld).project(sc.camera);const r=sc.canvas.getBoundingClientRect();return {x:r.left+(q.x+1)/2*r.width,y:r.top+(1-q.y)/2*r.height};},[u,v]);
  const state=()=>p.evaluate(()=>{const c=document.querySelector('[studio-pattern]').components['studio-pattern'],u=c.uniforms.bpTouch.value;return {x:u.x,y:u.y,z:u.z,mode:c.uniforms.bpTouchMode.value,grab:Studio.fingerGrab(),rot:(()=>{const r=document.querySelector('#rig').getAttribute('rotation');return r.x+','+r.y;})()};});
  // what the page shows in a small square around a screen point (the pattern stands still: speed 0)
  const patch=async(pt)=>{const buf=await p.screenshot({clip:{x:Math.round(pt.x-40),y:Math.round(pt.y-40),width:80,height:80}});return buf.toString('base64');};

  for(const mode of ['ripple','lens','swirl']){
    await openPat(await make([{id:'bg',type:'pattern',name:'רקע',pattern:{touch:mode,touchPower:1}}]));
    const at=await screen(0.62,0.58),far=await screen(0.3,0.3),rest=await state();
    assert.equal(rest.z,0,mode+': at rest nothing bends');
    const still=await patch(at);await p.waitForTimeout(300);assert.equal(await patch(at),still,mode+': the picture stands still by itself');
    await p.mouse.move(at.x,at.y);await p.mouse.down();await p.waitForTimeout(900);
    let s=await state();assert.ok(s.z>0.9,mode+': pressing bends it '+JSON.stringify(s));assert.ok(Math.abs(s.x-0.62)<0.03&&Math.abs(s.y-0.58)<0.03,mode+': around the pointer '+JSON.stringify(s));
    assert.equal(s.mode,['ripple','lens','swirl'].indexOf(mode)+1);assert.equal(s.grab,true,mode+': the press is the layer\'s');
    await p.mouse.move(at.x+4,at.y+3);await p.waitForTimeout(250);
    assert.notEqual(await patch({x:at.x+30,y:at.y+24}),await (async()=>{return still;})(),mode+': the picture near the pointer changed');
    if(mode==='ripple')await shot('pattern-ripple');if(mode==='swirl')await shot('pattern-swirl');
    await p.mouse.move(far.x,far.y,{steps:10});await p.waitForTimeout(700);
    s=await state();assert.ok(Math.abs(s.x-0.3)<0.04&&Math.abs(s.y-0.3)<0.04,mode+': it follows a drag '+JSON.stringify(s));assert.equal(s.rot,rest.rot,mode+': and the view did not turn');
    await p.mouse.up();await p.mouse.move(5,5);await p.waitForTimeout(2600);
    s=await state();assert.ok(s.z<0.01,mode+': let go, it settles '+JSON.stringify(s));assert.equal(await patch(at),still,mode+': back to the picture it was');
  }
  // no touch: nothing bends, and a drag turns the view as before
  await openPat(await make([{id:'bg',type:'pattern',name:'רקע',pattern:{}}]));
  {const at=await screen(0.5,0.5),r0=(await state()).rot;await p.mouse.move(at.x,at.y);await p.mouse.down();await p.mouse.move(at.x+80,at.y+10,{steps:8});await p.waitForTimeout(500);const s=await state();await p.mouse.up();
   assert.equal(s.z,0);assert.equal(s.mode,0);assert.equal(s.grab,false);assert.notEqual(s.rot,r0,'a plain background lets the view turn');}

  // the editor writes the choice; import refuses nonsense
  const id=await make([{id:'bg',type:'pattern',name:'רקע',pattern:{}}]);
  await p.goto(base+'/index.html#/e/'+id);await p.reload();await p.waitForFunction(()=>typeof App!=='undefined'&&App.rec&&App.rec.elements.length===1,null,{timeout:20000});
  await p.evaluate(()=>{App.select('bg');App.setTab('style');});await p.waitForSelector('#inspector select[aria-label="כשנוגעים ברקע"]');
  assert.equal(await p.locator('#inspector input.range[aria-label="עוצמה"]').count(),0,'no strength before a choice');
  await p.locator('#inspector select[aria-label="כשנוגעים ברקע"]').selectOption('ripple');await p.waitForSelector('#inspector input.range[aria-label="עוצמה"]');
  await p.evaluate(()=>{const r=document.querySelector('#inspector input.range[aria-label="עוצמה"]');r.value=0.9;r.dispatchEvent(new Event('input',{bubbles:true}));r.dispatchEvent(new Event('change',{bubbles:true}));});await p.waitForTimeout(900);
  let st=await p.evaluate(async()=>{await App.save();return (await Studio.load(App.rec.id)).elements[0].pattern;});assert.equal(st.touch,'ripple');assert.ok(Math.abs(st.touchPower-0.9)<1e-6);
  await p.locator('#inspector select[aria-label="כשנוגעים ברקע"]').selectOption('none');await p.waitForTimeout(700);
  st=await p.evaluate(async()=>{await App.save();return (await Studio.load(App.rec.id)).elements[0].pattern;});assert.equal(st.touch,undefined);assert.equal(st.touchPower,undefined);
  const v=await p.evaluate(()=>{const base=Studio.patternDefaults(Studio.PATTERNS[0].id),ok=(x)=>Studio.validPattern?Studio.validPattern({type:'pattern',pattern:Object.assign({},base,x)}):null;return [ok({}),ok({touch:'swirl',touchPower:0.5}),ok({touch:'boom'}),ok({touch:'lens',touchPower:7})];});
  if(v[0]!==null)assert.deepEqual(v,[true,true,false,false],'valid and invalid touch values');

  // butterflies
  assert.ok(await p.evaluate(()=>StarterLibrary.particleStyles.some(s=>s.id==='p-butterflies'&&s.particles.flap>0&&s.w===1)),'in the particle library');
  for(const f of ['library/particles/butterfly.png','library/thumbs/p-butterflies.png'])assert.equal(await p.evaluate(async(f)=>(await fetch(f)).ok,f),true,f);
  await p.evaluate(()=>App.setPane('layers'));await p.locator('#btn-add').click();await p.locator('dialog[open] .add-tile[data-add="particles"]').click();
  await p.locator('.part-tile[data-style="p-butterflies"]').click();await p.waitForFunction(()=>App.sel()&&App.sel().type==='particles',null,{timeout:20000});await p.waitForTimeout(1500);
  let el=await p.evaluate(()=>App.sel());assert.equal(el.particles.flap,2.4);assert.equal(el.w,1);assert.equal(el.h,1);
  const flap=p.locator('#inspector input.range[aria-label="נפנוף כנפיים"]');assert.equal(await flap.count(),1,'a control for the pace of the wings');
  const live=await p.evaluate(()=>{const e=[...document.querySelectorAll('[particles]')].find(x=>x.components.particles&&x.components.particles.data.flap>0);if(!e)return null;const c=e.components.particles;return {u:c.flapU.pFlap.value,t:c.flapU.pTime.value,ph:!!c.points.geometry.attributes.particlePhase};});
  if(live){assert.equal(live.u,2.4);assert.ok(live.ph);}
  await p.evaluate(()=>App.setPane('layers'));await p.waitForTimeout(1200);await shot('butterflies-editor');
  assert.deepEqual(errs,[],'no errors');
  console.log('PASS v2-touch-pattern-butterflies');
}finally{await b.close();server.close();}})().catch(e=>{console.error(e);process.exit(1);});
