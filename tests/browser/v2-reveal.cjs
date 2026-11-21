const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');
// Automatic reveals for a split picture: the group's design tab offers ready-made ways for its layers to come into
// depth. Picking one writes motion paths on the layers (marked reveal), which the editor, the 3D view and the camera
// play; "בלי" takes them away; a path made by hand is left alone; the depth slider rewrites them. Phone, touch.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
 try{
  const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const p=await ctx.newPage(),errs=[];p.on('pageerror',e=>errs.push(String(e)));p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await p.goto(base+'/index.html');await p.waitForFunction(()=>typeof Studio!=='undefined'&&typeof Reveal!=='undefined');
  const ids=await p.evaluate(async()=>{const a=Studio.blankExperience('פופאפ');a.target={artRatio:0.75,artRect:{x:0,y:0,w:300,h:400},natural:{w:300,h:400}};
    const pic=async(col,full)=>{const c=document.createElement('canvas');c.width=300;c.height=400;const g=c.getContext('2d');g.fillStyle=col;if(full)g.fillRect(0,0,300,400);else g.fillRect(100,150,100,100);return new Promise(r=>c.toBlob(r,'image/png'));};
    a.assets.__artwork=await pic('#204070',true);a.elements=[];
    const G=Studio.geom(a),names=['רקע','לוויתן','אלמוגים','טקסט'];
    for(let i=0;i<4;i++){const id=Studio.newId(),as=Studio.newId();a.assets[as]=await pic(['#204070','#30a0d0','#e07050','#ffffff'][i],i===0);
      a.elements.push({id,type:'image',name:names[i],assetId:as,x:0,y:0,w:1,h:1,aspect:0.75,rot:0,z:+(i/3*0.3*G.artH).toFixed(4),flush:true,seq:null});}
    const g=Studio.makeGroup(a,a.elements.map(e=>e.id));g.name='שכבות';g.split={spread:0.3};await Studio.save(a);return {rec:a.id,g:g.id,kids:a.elements.filter(e=>e.type==='image').map(e=>e.id)};});
  await p.goto(base+'/index.html#/e/'+ids.rec);await p.waitForSelector('#btn-add');await p.waitForTimeout(600);
  await p.evaluate(g=>App.select(g),ids.g);await p.waitForTimeout(200);
  if(await p.locator('.tab[data-tab="style"]').isVisible())await p.locator('.tab[data-tab="style"]').click();
  await p.waitForSelector('text=הנפשה אוטומטית');
  const top=await p.evaluate(()=>{const g=[...document.querySelectorAll('section.group')].find(n=>/הנפשה אוטומטית/.test(n.textContent));return g.getBoundingClientRect().top<innerHeight;});assert.ok(top,'the reveal choices are in sight on a phone');
  const kids=()=>p.evaluate(ids=>ids.map(id=>{const e=App.rec.elements.find(x=>x.id===id);return {z:e.z,tl:e.timeline||null};}),ids.kids);
  const at=(t)=>p.evaluate(({ids,t})=>ids.map(id=>Studio.sampleTimeline(App.rec.elements.find(x=>x.id===id),t)),{ids:ids.kids,t});
  const pick=async(name)=>{await p.locator('dialog[open], body').locator('button.chip',{hasText:name}).first().click();await p.waitForTimeout(250);};
  const z0=(await kids()).map(k=>k.z);

  // opens into depth: flat at first, every layer at its own depth at the end
  await pick('נפתחת לעומק');
  let k=await kids();assert.ok(k.every(x=>x.tl&&x.tl.reveal&&x.tl.loop===false),'a reveal path on every layer');
  let s=await at(0);assert.ok(s.every(v=>Math.abs(v.z-z0[0])<1e-3),'flat at the start '+s.map(v=>v.z));
  s=await at(5);assert.ok(s.every((v,i)=>Math.abs(v.z-z0[i])<1e-3),'own depth at the end');
  assert.equal(await p.evaluate(g=>App.rec.elements.find(x=>x.id===g).split.reveal,ids.g),'expand');

  // one after the other: the far layer is in before the near one starts
  await pick('אחת אחרי השנייה');s=await at(1.0);assert.ok(s[0].opacity>0.5&&s[3].opacity===0,'far first '+s.map(v=>v.opacity));
  s=await at(9);assert.ok(s.every((v,i)=>v.opacity===1&&Math.abs(v.z-z0[i])<1e-3&&v.scale===1),'all in place at the end');

  // pop-up: the background stays, the others swing up around their bottom edge (kept at their own depth) to face the viewer
  await pick('ספר פופ־אפ');k=await kids();assert.equal(k[0].tl,null,'background stays');
  s=await at(0);assert.ok(s.slice(1).every(v=>Math.abs(v.rotX-90)<0.01),'lying at the start '+s.map(v=>v.rotX));
  s=await at(9);assert.ok(s.slice(1).every((v,i)=>Math.abs(v.rotX)<0.01&&Math.abs(v.z-z0[i+1])<1e-3&&Math.abs(v.y)<1e-3),'standing in its depth at the end '+s.map(v=>v.rotX));
  const edge=await p.evaluate(({ids,t})=>{const G=Studio.geom(App.rec);return ids.slice(1).map(id=>{const e=App.rec.elements.find(x=>x.id===id),v=Studio.sampleTimeline(e,t),th=v.rotX*Math.PI/180;return {zEdge:v.z-(0.5*G.artH)*Math.sin(th),yEdge:v.y-0.5*Math.cos(th)};});},{ids:ids.kids,t:1.0});
  assert.ok(edge.every((e,i)=>Math.abs(e.zEdge-z0[i+1])<0.01&&Math.abs(e.yEdge+0.5)<0.01),'the bottom edge stays put '+JSON.stringify(edge));
  // the 3D view turns them too
  await p.tap('#btn-3d');await p.waitForFunction(()=>Editor3D.isActive());await p.evaluate(()=>App.freeze(9));await p.waitForTimeout(700);
  const rx=await p.evaluate(({g,kid})=>{const n=Editor3D._test.node(g).querySelector('[data-el-id="'+kid+'"]');return n.object3D.rotation.x*180/Math.PI;},{g:ids.g,kid:ids.kids[2]});
  assert.ok(Math.abs(rx)<0.5,'3D view shows the layer standing '+rx);
  await p.evaluate(()=>App.freeze(0));await p.waitForTimeout(500);
  const rx0=await p.evaluate(({g,kid})=>{const n=Editor3D._test.node(g).querySelector('[data-el-id="'+kid+'"]');return n.object3D.rotation.x*180/Math.PI;},{g:ids.g,kid:ids.kids[2]});
  assert.ok(Math.abs(rx0-90)<0.5,'and lying at the start '+rx0);
  await p.tap('#btn-3d');await p.evaluate(()=>App.freeze(null));

  // a flower opening: the inner (nearest) layer opens first, from small and turned at the middle, out to its full size
  await pick('נפתחת כמו פרח');s=await at(0);assert.ok(s.every(v=>v.opacity===0&&v.scale<0.2),'closed at the start '+s.map(v=>v.scale));
  s=await at(1.0);assert.ok(s[3].opacity>0.5&&s[0].opacity===0,'the inner layer opens first '+s.map(v=>v.opacity));
  s=await at(9);assert.ok(s.every((v,i)=>v.opacity===1&&v.scale===1&&Math.abs(v.rot)<1e-3&&Math.abs(v.z-z0[i])<1e-3),'all open in place at the end '+JSON.stringify(s.map(v=>[v.scale,v.rot])));

  // again and again: all the layers share one length, with a rest at the end
  await p.locator('label:has-text("לחזור שוב ושוב") input, [role=switch]:near(:text("לחזור שוב ושוב"))').first().click();await p.waitForTimeout(250);
  k=await kids();const durs=k.filter(x=>x.tl).map(x=>x.tl.dur);assert.ok(durs.length===4&&durs.every(d=>d===durs[0]&&d>0)&&k.filter(x=>x.tl).every(x=>x.tl.loop),'one shared loop '+durs);

  // the depth slider rewrites the paths for the new depths
  await pick('נפתחת לעומק');
  await p.evaluate(g=>{App.select(g);},ids.g);
  await p.locator('section.group',{hasText:'מרחק בין השכבות'}).locator('input[type=range]').first().evaluate(n=>{n.value=0.6;n.dispatchEvent(new Event('input',{bubbles:true}));n.dispatchEvent(new Event('change',{bubbles:true}));});await p.waitForTimeout(250);
  const after=await p.evaluate(ids=>ids.map(id=>{const e=App.rec.elements.find(x=>x.id===id);const last=Math.max(...e.timeline.keys.map(q=>q.t));return {z:e.z,end:Studio.sampleTimeline(e,last).z};}),ids.kids);
  assert.ok(after[3].z>z0[3]*1.5&&after.every(v=>Math.abs(v.end-v.z)<1e-3),'paths follow the new depth '+JSON.stringify(after));

  // a path she made herself stays; "בלי" takes the reveal away
  await p.evaluate(id=>{const e=App.rec.elements.find(x=>x.id===id);e.timeline={keys:[{t:0,x:0},{t:2,x:0.2}],loop:true,ease:'linear'};App.changed();},ids.kids[1]);
  await pick('נוחתות מלמעלה');k=await kids();assert.ok(!k[1].tl.reveal&&k[1].tl.keys.length===2,'her own path stays');
  await pick('בלי');k=await kids();assert.ok(k[0].tl===null&&k[2].tl===null&&k[3].tl===null&&k[1].tl&&!k[1].tl.reveal,'reveal removed, hers kept');
  await p.waitForTimeout(800);
  await p.reload();await p.waitForSelector('#btn-add');assert.equal(await p.evaluate(g=>App.rec.elements.find(x=>x.id===g).split.reveal,ids.g),'none','saved');
  assert.equal(errs.filter(e=>!/favicon|404|Failed to load resource/.test(e)).length,0,'no page errors: '+errs.join(' | '));
  console.log('split reveals: all checks pass');
 }finally{await b.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
