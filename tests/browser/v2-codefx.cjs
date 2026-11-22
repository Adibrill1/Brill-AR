const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');
// Live code animations ("אנימציות קוד"): the add sheet offers thirteen looks drawn in code and the holographic foil.
// Each one lands as a layer that the flat editor (through the 3D layer above the canvas), the 3D view and the
// preview draw; its controls change colours, speed and amount; a record holding them passes the import check.
const SHOTS=process.env.SHOTS||'';
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
  const p=await ctx.newPage(),errs=[];p.on('pageerror',e=>errs.push(String(e)));p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await p.goto(base+'/index.html');await p.waitForFunction(()=>typeof Studio!=='undefined'&&typeof Inspector!=='undefined'&&window.StudioCodeFx);
  const id=await p.evaluate(async()=>{const a=Studio.blankExperience('קוד');a.target={artRatio:0.75,artRect:{x:0,y:0,w:300,h:400},natural:{w:300,h:400}};
    const c=document.createElement('canvas');c.width=300;c.height=400;const g=c.getContext('2d');const gr=g.createLinearGradient(0,0,300,400);gr.addColorStop(0,'#2a6fdb');gr.addColorStop(1,'#f2a65a');g.fillStyle=gr;g.fillRect(0,0,300,400);
    g.fillStyle='#ffe066';g.beginPath();g.arc(150,170,70,0,7);g.fill();g.fillStyle='#1b4332';g.fillRect(0,300,300,100);
    a.assets.__artwork=await new Promise(r=>c.toBlob(r,'image/png'));a.elements=[];await Studio.save(a);return a.id;});
  await p.goto(base+'/index.html#/e/'+id);await p.waitForSelector('#btn-add');await p.waitForTimeout(600);
  const shot=async(name)=>{if(SHOTS)await p.screenshot({path:SHOTS+'/'+name+'.png'});};
  const looks=await p.evaluate(()=>Studio.CODEFX.map(c=>c.id));assert.deepEqual(looks,['dissolve','dust','portal','swarm','ivy','burn','fireflies','jelly','tree','spiral','bubbles','liquid','lanterns','ripple','shatter','rain','aurora','mist','drip','sketch','sand','eyes','tunnel','lens','game','scratch','storm','countdown','puzzle','face','flip','balloons','ink']);
  for(const look of looks){
    await p.evaluate(()=>Layers.openAdd());await p.locator('button.add-tile[data-add="codefx"]').tap();
    await p.locator('button.part-tile[data-codefx="'+look+'"]').tap();
    await p.waitForFunction(l=>App.sel()&&App.sel().type==='codefx'&&App.sel().codefx.look===l,look);
    const elId=await p.evaluate(()=>App.selId);
    // drawn by the 3D layer over the flat canvas
    await p.waitForFunction(id=>Editor3D.drawsIn2d(id),elId,{timeout:8000});
    await p.waitForTimeout({dissolve:3800,ivy:6000,tree:7000,burn:3400,spiral:3000,shatter:4200}[look]||2500);
    await p.evaluate(()=>App.select(null));await p.waitForTimeout(100);await shot('flat-'+look);
    await p.evaluate(id=>App.select(id),elId);
    // its controls: the colours, the speed and the amount
    if(await p.locator('.tab[data-tab="style"]').isVisible())await p.locator('.tab[data-tab="style"]').tap();
    await p.waitForSelector(look==='face'?'text=למצוא את הפנים בתמונה':'text=ערכות צבע'); // the face has no colours, it has its own partsif(look!=='countdown')assert.ok(await p.locator('section.group',{hasText:'התאמה'}).locator('text=מהירות').count(),'speed control'); // a countdown runs on the clock
    if(look==='countdown')assert.ok(await p.locator('#in-codefx-date').count(),'the countdown asks for a date');
    await p.evaluate(()=>{const e=App.sel();e.codefx=Object.assign({},e.codefx,{amount:0.2,speed:0.8});App.changed(true);});
    await p.waitForTimeout(400);
    assert.ok(await p.evaluate(id=>{const n=document.querySelector('[data-el-id="'+id+'"]');return !!n&&n.getAttribute('studio-codefx').cfg.includes('"amount":0.2');},elId),look+': the scene follows the controls');
    await p.evaluate(id=>App.removeLayer(id),elId);await p.waitForTimeout(300);
  }
  // every look in one record, and the import check takes it
  await p.evaluate(async()=>{for(const l of Studio.CODEFX.map(c=>c.id)){const e={id:Studio.newId(),type:'codefx',name:l,codefx:Studio.codeFxDefaults(l),x:0,y:0,w:0.5,h:0.5,aspect:0.75,rot:0,z:0,flush:true,seq:null};await App.addLayer(e);}});
  const okImport=await p.evaluate(async()=>{try{const r=await Studio.importJSON(await Studio.exportJSON(App.rec),{save:false});return r.elements.filter(e=>e.type==='codefx').length;}catch(e){return e.message;}});assert.equal(okImport,looks.length);
  const bad=await p.evaluate(async()=>{const o=JSON.parse(await Studio.exportJSON(App.rec));o.elements.find(e=>e.type==='codefx').codefx.colors=['red'];try{await Studio.importJSON(JSON.stringify(o),{save:false});return false;}catch(e){return e.message;}});assert.match(String(bad),/code animation/);
  // the foil on a text: the 3D layer patches the text's own material
  const tid=await p.evaluate(async()=>{const e={id:Studio.newId(),type:'text',name:'ט',text:'שלום',color:'#ffffff',bold:true,x:0,y:0.3,w:0.6,h:null,rot:0,z:0,flush:true,seq:null};Stage.fitText(e);await App.addLayer(e);App.sel().fx='holo';App.changed(true);return e.id;});
  await p.waitForTimeout(600);
  assert.ok(await p.evaluate(id=>Studio.validFx(App.rec.elements.find(e=>e.id===id)),tid),'foil allowed on text');
  await p.waitForSelector('text=ברק הולוגרפי');
  // the 3D view
  await p.tap('#btn-3d');await p.waitForFunction(()=>Editor3D.isActive());await p.waitForTimeout(3000);await shot('3d-all');
  const built=await p.evaluate(()=>App.rec.elements.filter(e=>e.type==='codefx').map(e=>{const n=Editor3D._test.node(e.id);const o=n&&n.getObject3D('codefx');return o?o.children.length:0;}));
  assert.ok(built.every(n=>n>0),'every look built in 3D '+built);
  const foil=await p.evaluate(id=>{let ok=false;Editor3D._test.node(id).object3D.traverse(n=>{if(n.material&&n.material._studioFx)ok=true;});return ok;},tid);assert.ok(foil,'the text carries the foil in 3D');
  await p.tap('#btn-3d');
  // the preview page (the same scene the camera shows) draws them too
  await p.evaluate(()=>App.flush&&App.flush());await p.waitForTimeout(400);
  const recId=await p.evaluate(()=>App.rec.id);
  await p.goto(base+'/preview.html#'+recId);
  await p.waitForFunction(()=>{const n=[...document.querySelectorAll('[studio-codefx]')];return n.length===33&&n.every(x=>x.getObject3D('codefx')&&x.getObject3D('codefx').children.length>0);},null,{timeout:15000});
  await p.waitForTimeout(1500);await shot('preview');
  console.log(JSON.stringify(errs.slice(0,8)));assert.deepEqual(errs.filter(e=>!/favicon|Failed to load resource/.test(e)),[]);
  console.log('v2-codefx ok');
 }finally{await b.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
