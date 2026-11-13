const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');
// Grouping layers ("קיבוץ"): "בחירת כמה" in the layer list puts boxes on the rows; rows and touches on the stage choose
// layers; "לקבץ" makes one group in their place. A touch on a member selects the whole group; dragging, the corner handle
// and the rotation slider move, size and turn the members together; a second touch picks one member; the list shows
// members indented under their group. "לפרק קבוצה" leaves every member where it was seen (also a tilted, see-through
// group); undo, duplicate, lock, backup and the preview agree. Phone size, touch. Headless Chrome; not an iPhone.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});try{
  const ctx=await b.newContext({viewport:{width:375,height:812},isMobile:true,hasTouch:true});
  const p=await ctx.newPage(),errs=[];p.on('pageerror',e=>errs.push(String(e)));p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await p.goto(base+'/index.html');await p.waitForFunction(()=>typeof Studio!=='undefined'&&typeof App!=='undefined');
  const id=await p.evaluate(async()=>{
    const blob=(w,h,col)=>{const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');g.fillStyle=col;g.fillRect(0,0,w,h);return new Promise(r=>c.toBlob(r,'image/png'));};
    const a=Studio.blankExperience('קבוצה');a.target={artRect:{x:0,y:0,w:300,h:400},natural:{w:300,h:400}};
    a.assets.__artwork=await blob(300,400,'#204080');
    const L=(id,col,x,y)=>({id,type:'image',name:'שכבה '+id,assetId:id,x,y,z:0,w:0.16,h:0.12,aspect:1,rot:0,flush:true,seq:null,opacity:1});
    for(const [k,c] of [['a','#f00'],['b','#0f0'],['c','#ff0'],['d','#0ff']])a.assets[k]=await blob(40,40,c);
    a.elements=[L('d','#0ff',0.3,-0.35),L('a','#f00',-0.25,0.25),L('b','#0f0',0.2,0.2),L('c','#ff0',0,-0.1)];
    await Studio.save(a);return a.id;});
  await p.goto(base+'/index.html#/e/'+id);await p.waitForSelector('#stage-tools:not([hidden])');await p.waitForTimeout(800);
  const cdp=await ctx.newCDPSession(p);const touch=(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y,id:1}]});
  const tap=async(q)=>{await touch('touchStart',q.x,q.y);await touch('touchEnd');await p.waitForTimeout(450);};
  const screen=(x,y)=>p.evaluate(([x,y])=>{const v=Stage.view,r=document.getElementById('preview').getBoundingClientRect();return {x:r.left+v.mx+(x+.5)*v.W,y:r.top+v.my+(.5-y)*v.H};},[x,y]);
  const els=()=>p.evaluate(()=>JSON.parse(JSON.stringify(App.rec.elements)));
  const pos=async()=>Object.fromEntries((await els()).filter(e=>e.type==='image').map(e=>[e.id,[e.x,e.y,e.w,e.rot||0]]));
  const near=(a,b,t=0.002)=>Math.abs(a-b)<t;
  const setNum=async(label,v)=>{const n=p.locator('input.num[aria-label="'+label+' (מספר)"]');await n.fill(String(v));await n.dispatchEvent('change');await p.waitForTimeout(300);};
  const start=await pos();

  // choosing: two rows in the list, one touch on the stage
  await p.locator('#btn-multi').click();await p.waitForTimeout(250);
  assert.equal(await p.locator('.layer-row.choosing').count(),4,'every row gets a box');
  await p.locator('.layer-row.choosing[data-id="a"]').click();await p.locator('.layer-row.choosing[data-id="b"]').click();
  assert.match(await p.locator('#stage-hint').textContent(),/נבחרו 2/,'the stage says how many are chosen');
  await tap(await screen(0,-0.1));
  assert.deepEqual(await p.evaluate(()=>[...App.multi].sort()),['a','b','c'],'a touch on the stage adds a layer');
  await tap(await screen(0.3,-0.35));await tap(await screen(0.3,-0.35));
  assert.deepEqual(await p.evaluate(()=>[...App.multi].sort()),['a','b','c'],'a second touch takes it away again');
  assert.equal(await p.locator('#btn-group-go').textContent(),'לקבץ (3)','the list head offers to group the three');
  await p.screenshot({path:'/Users/adibrill/Desktop/brill-ar-work/wt-tools2-shots/group-choose.png'});
  await p.locator('#btn-group-go').click();await p.waitForTimeout(500);
  let E=await els();const g=E.find(e=>e.type==='group');
  assert.ok(g,'a group');assert.deepEqual(g.children,['a','b','c'],'with the three, in their order');
  assert.deepEqual(E.map(e=>e.id),['d','a','b','c',g.id],'in the place of the topmost, members right below the group');
  assert.equal(await p.evaluate(()=>App.selId),g.id,'and it is selected');
  assert.equal(await p.evaluate(()=>App.multi),null,'choosing ends');
  for(const k of ['a','b','c'])assert.deepEqual((await pos())[k],start[k],'member '+k+' stays where it was');
  assert.ok(await p.evaluate(gid=>!!Stage.boxes[gid],g.id),'the group has a box on the stage');
  // the list: members indented under the group row
  await p.evaluate(()=>App.setPane('layers'));await p.waitForTimeout(200);
  assert.deepEqual(await p.$$eval('#layer-list .layer-row',rs=>rs.map(r=>[r.dataset.id,r.classList.contains('member')])),[[g.id,false],['c',true],['b',true],['a',true],['d',false]],'members follow their group, indented');

  // a touch on a member selects the whole group
  await p.evaluate(()=>App.select(null));await p.waitForTimeout(200);
  await tap(await screen(-0.25,0.25));
  assert.equal(await p.evaluate(()=>App.selId),g.id,'touching a member selects the group');
  await p.screenshot({path:'/Users/adibrill/Desktop/brill-ar-work/wt-tools2-shots/group-selected.png'});
  // drag: every member moves the same
  let s0=await pos();const from=await screen(0.2,0.2);
  await touch('touchStart',from.x,from.y);for(let i=1;i<=8;i++)await touch('touchMove',from.x-i*5,from.y+i*3);await touch('touchEnd');await p.waitForTimeout(500);
  let s1=await pos();const dx=s1.a[0]-s0.a[0],dy=s1.a[1]-s0.a[1];
  assert.ok(dx<-0.05&&dy<-0.02,'the group moved ('+dx+','+dy+')');
  for(const k of ['b','c'])assert.ok(near(s1[k][0]-s0[k][0],dx)&&near(s1[k][1]-s0[k][1],dy),'member '+k+' moved with it');
  assert.deepEqual(s1.d,s0.d,'the layer outside the group stays');
  // the corner handle: members grow and spread apart around the group
  const box=await p.evaluate(gid=>{const b=Stage.boxes[gid],r=document.getElementById('preview').getBoundingClientRect(),z=Stage.zoom;return {x:r.left+b.cx+(b.w/2)*Math.cos(b.rot)-(b.h/2)*Math.sin(b.rot),y:r.top+b.cy+(b.w/2)*Math.sin(b.rot)+(b.h/2)*Math.cos(b.rot)};},g.id);
  s0=await pos();
  await touch('touchStart',box.x,box.y);for(let i=1;i<=8;i++)await touch('touchMove',box.x+i*4,box.y+i*4);await touch('touchEnd');await p.waitForTimeout(500);
  s1=await pos();const k=s1.a[2]/s0.a[2];
  assert.ok(k>1.1,'the members grew ('+k+')');
  const span=(s)=>Math.hypot(s.a[0]-s.b[0],s.a[1]-s.b[1]);assert.ok(near(span(s1)/span(s0),k,0.02),'and their distances grew the same');
  // rotation from the inspector
  await p.evaluate(()=>App.setTab('place'));await p.waitForTimeout(300);
  s0=await pos();await setNum('סיבוב',30);s1=await pos();
  for(const k of ['a','b','c'])assert.ok(near(s1[k][3],30,0.2),'member '+k+' turned 30°');
  assert.ok(!near(s1.a[0],s0.a[0],0.01),'and moved around the middle of the group');
  // opacity of the group from the style tab
  await p.evaluate(()=>App.setTab('style'));await p.waitForTimeout(300);
  assert.ok(await p.locator('button',{hasText:'לפרק קבוצה'}).count(),'the style tab offers to take it apart');
  await setNum('שקיפות',50);
  assert.equal(await p.evaluate(gid=>App.el(gid).opacity,g.id),0.5,'the group is half see-through');
  assert.ok(near(await p.evaluate(()=>App.sample(App.el('a')).opacity),0.5),'its members show half see-through');

  // a second touch on the selected group picks one member, with the way back to the group
  const bAt=await p.evaluate(()=>{const b=Stage.boxes['b'],r=document.getElementById('preview').getBoundingClientRect();return {x:r.left+b.cx,y:r.top+b.cy};});
  await tap(bAt);
  assert.equal(await p.evaluate(()=>App.selId),'b','the second touch selects the member under the finger');
  assert.match(await p.locator('.in-group').textContent(),/בתוך/,'the inspector says it is inside the group');
  assert.ok(await p.locator('#sel-bar [aria-label="לבחור את כל הקבוצה"]').count(),'the bar leads back to the group');
  s0=await pos();await setNum('שקיפות',80);
  assert.equal(await p.evaluate(()=>App.el('b').opacity),0.8,'one member edited alone');
  await p.locator('#sel-bar [aria-label="לבחור את כל הקבוצה"]').click();await p.waitForTimeout(200);
  assert.equal(await p.evaluate(()=>App.selId),g.id,'back to the group');

  // the preview puts the members where the editor shows them
  await p.evaluate(()=>App.flush());
  const expect=await p.evaluate(()=>Object.fromEntries(['a','b','c'].map(id=>{const s=App.sample(App.el(id)),t=Studio.toTargetSpace(App.rec,Object.assign({},App.el(id),s),1);return [id,[t.x,t.y]];})));
  const pv=await ctx.newPage();pv.on('pageerror',e=>errs.push(String(e)));
  await pv.goto(base+'/preview.html#'+id);await pv.waitForFunction(()=>{const sc=document.querySelector('a-scene');return sc&&sc.hasLoaded&&document.querySelector('[data-el-id="a"]');},null,{timeout:20000});await pv.waitForTimeout(600);
  const got=await pv.evaluate(()=>{const rig=document.getElementById('rig').object3D;rig.updateMatrixWorld(true);return Object.fromEntries(['a','b','c'].map(id=>{const v=new THREE.Vector3();document.querySelector('[data-el-id="'+id+'"]').object3D.getWorldPosition(v);rig.worldToLocal(v);return [id,[v.x,v.y]];}));});
  for(const k of ['a','b','c'])assert.ok(near(got[k][0],expect[k][0],0.003)&&near(got[k][1],expect[k][1],0.003),'preview: member '+k+' at its place '+JSON.stringify([got[k],expect[k]]));
  await pv.close();

  // duplicate and lock
  await p.locator('#sel-bar [aria-label="שכפול"]').click();await p.waitForTimeout(400);
  E=await els();assert.equal(E.filter(e=>e.type==='group').length,2,'duplicating copies the group');assert.equal(E.length,9,'with its members');
  await p.evaluate(()=>App.undo());await p.waitForTimeout(600);
  assert.equal((await els()).length,5,'undo takes the copy away');
  await p.evaluate(gid=>App.setLocked(gid,true),g.id);await p.evaluate(()=>App.select(null));await p.waitForTimeout(200);
  await tap(await p.evaluate(()=>{const b=Stage.boxes['a'],r=document.getElementById('preview').getBoundingClientRect();return {x:r.left+b.cx,y:r.top+b.cy};}));
  assert.equal(await p.evaluate(()=>App.selId),null,'a locked group cannot be picked by its members');
  await p.evaluate(gid=>App.setLocked(gid,false),g.id);await p.evaluate(gid=>App.select(gid),g.id);await p.waitForTimeout(200);

  // backup keeps the group
  const back=await p.evaluate(async()=>{const r=await Studio.importZIP(await Studio.exportZIP(App.rec),{save:false});return r.elements.map(e=>[e.type,e.children||null]);});
  assert.deepEqual(back.find(x=>x[0]==='group')[1],['a','b','c'],'backup keeps the group and its members');

  // take apart, with a tilt: members keep where they are seen in 3D, the see-through is baked in
  await p.evaluate(gid=>{App.el(gid).rotX=30;App.changed(true);},g.id);await p.waitForTimeout(300);
  const world=async()=>p.evaluate(async()=>{
    // where each member is in the 3D view
    App.setMode3d(true);await new Promise(r=>setTimeout(r,1800));
    const rig=document.getElementById('editor-3d-rig').object3D;rig.updateMatrixWorld(true);
    const out=Object.fromEntries(['a','b','c'].map(id=>{const n=document.querySelector('#editor-3d-rig [data-el-id="'+id+'"]'),v=new THREE.Vector3();n.object3D.getWorldPosition(v);rig.worldToLocal(v);return [id,[v.x,v.y,v.z]];}));
    App.setMode3d(false);await new Promise(r=>setTimeout(r,300));return out;});
  const w0=await world();
  await p.locator('#sel-bar [aria-label="לפרק קבוצה"]').click();await p.waitForTimeout(600);
  E=await els();assert.equal(E.some(e=>e.type==='group'),false,'the group is gone');
  assert.deepEqual(E.map(e=>e.id),['d','a','b','c'],'the members are ordinary layers again, in their order');
  assert.ok(near(E.find(e=>e.id==='a').opacity,0.5)&&near(E.find(e=>e.id==='b').opacity,0.4),'the group see-through is kept in each member');
  const w1=await world();
  for(const k of ['a','b','c'])assert.ok(w0[k].every((v,i)=>near(v,w1[k][i],0.003)),'member '+k+' stays where it was seen in 3D '+JSON.stringify([w0[k],w1[k]]));
  await p.evaluate(()=>App.undo());await p.waitForTimeout(700);
  assert.ok((await els()).some(e=>e.type==='group'),'undo brings the group back');
  // one member out of the group
  await p.evaluate(()=>App.select('b'));await p.waitForTimeout(200);await p.locator('.in-group button',{hasText:'להוציא'}).click();await p.waitForTimeout(500);
  E=await els();const g2=E.find(e=>e.type==='group');
  assert.deepEqual(g2.children,['a','c'],'one member left the group');assert.equal(E[E.length-1].id,'b','and sits right above it');
  assert.deepEqual(errs.filter(e=>!/favicon|404/.test(e)),[],'no errors');
  console.log('v2-group ok');
}finally{await b.close();server.close();}})().catch(e=>{console.error(e);process.exit(1);});
