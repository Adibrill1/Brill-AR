const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');
// Particles that answer the finger (el.particles.touch). In the preview page: a "follow" cloud is dragged and comes
// along (and the view does not turn meanwhile), then goes home when let go; a "repel" cloud clears out around the
// pointer; a cloud without touch keeps no extra state and a drag over it turns the view as before. Then the editor:
// the "מגע" group writes the choice to storage, and a bad value is refused on import. Headless Chrome, a mouse; not an iPhone.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});try{
  const ctx=await b.newContext({viewport:{width:390,height:844}});
  const p=await ctx.newPage(),errs=[];p.on('pageerror',e=>errs.push(String(e)));p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await p.goto(base+'/index.html');await p.waitForFunction(()=>typeof Studio!=='undefined');
  const make=(touch)=>p.evaluate(async(touch)=>{const c=document.createElement('canvas');c.width=300;c.height=400;c.getContext('2d').fillRect(0,0,300,400);const a=Studio.blankExperience('מגע');a.target={artRect:{x:0,y:0,w:300,h:400},natural:{w:300,h:400}};
    a.assets.__artwork=await new Promise(r=>c.toBlob(r,'image/png'));
    a.elements=[{id:'pt',type:'particles',name:'חלקיקים',x:0,y:0,w:0.6,h:0.6,rot:0,z:0,flush:true,seq:null,particles:Object.assign({preset:'sparkle',count:200,color:'#ffd94d'},touch||{})}];await Studio.save(a);return a.id;},touch);
  const open=async(id)=>{await p.goto(base+'/preview.html#'+id);await p.reload();await p.waitForFunction(()=>{const e=document.querySelector('[particles]');return e&&e.components&&e.components.particles&&e.components.particles.points;},null,{timeout:20000});await p.waitForTimeout(800);};
  // screen place of a point on the layer's plane, and the cloud's middle in the layer's own units
  const screen=(x,y)=>p.evaluate(([x,y])=>{const c=document.querySelector('[particles]').components.particles,sc=c.el.sceneEl,v=new THREE.Vector3(x,y,0);c.points.updateWorldMatrix(true,false);v.applyMatrix4(c.points.matrixWorld).project(sc.camera);const r=sc.canvas.getBoundingClientRect();return {x:r.left+(v.x+1)/2*r.width,y:r.top+(1-v.y)/2*r.height};},[x,y]);
  const cloud=()=>p.evaluate(()=>{const c=document.querySelector('[particles]').components.particles,a=c.points.geometry.attributes.position.array,d=c.data;let sx=0,sy=0,near=0;const n=a.length/3;for(let i=0;i<a.length;i+=3){sx+=a[i];sy+=a[i+1];if(Math.hypot(a[i],a[i+1])<d.width*0.12)near++;}return {x:sx/n,y:sy/n,near,w:d.width,h:d.height,off:!!c.off,grab:Studio.fingerGrab()};});
  const turn=()=>p.evaluate(()=>{const r=document.querySelector('#rig').getAttribute('rotation');return r.x+','+r.y;});

  // follow
  await open(await make({touch:'follow',touchPower:1}));
  let c0=await cloud();assert.ok(c0.off,'a touch layer keeps offsets');assert.ok(Math.hypot(c0.x,c0.y)<c0.w*0.12,'the cloud starts around its own middle '+JSON.stringify(c0));
  const t0=await turn(),mid=await screen(0,0),to=await screen(c0.w*0.5,c0.h*0.4);
  await p.mouse.move(mid.x,mid.y);await p.mouse.down();assert.equal((await cloud()).grab,true,'pressing the cloud grabs it');
  await p.mouse.move(to.x,to.y,{steps:12});await p.waitForTimeout(1500);
  let c1=await cloud();assert.ok(Math.abs(c1.x-c0.w*0.5)<c0.w*0.12&&Math.abs(c1.y-c0.h*0.4)<c0.h*0.12,'the cloud came along with the pointer '+JSON.stringify(c1));
  assert.equal(await turn(),t0,'and the view did not turn');
  await p.mouse.up();await p.waitForTimeout(2500);
  c1=await cloud();assert.ok(Math.hypot(c1.x,c1.y)<c0.w*0.12,'let go: back home '+JSON.stringify(c1));assert.equal(c1.grab,false);

  // follow, staying where it was left
  await open(await make({touch:'follow',touchPower:1,touchBack:false}));
  {const m=await screen(0,0),t=await screen(c0.w*0.4,0);await p.mouse.move(m.x,m.y);await p.mouse.down();await p.mouse.move(t.x,t.y,{steps:8});await p.waitForTimeout(1200);await p.mouse.up();await p.waitForTimeout(1500);
   const c=await cloud();assert.ok(Math.abs(c.x-c0.w*0.4)<c0.w*0.12,'without "back home" it stays where it was left '+JSON.stringify(c));}

  // repel: the middle empties around the pointer
  await open(await make({touch:'repel',touchPower:1,touchRange:0.8}));
  const before=(await cloud()).near;const m2=await screen(0,0);await p.mouse.move(m2.x+1,m2.y+1);await p.mouse.move(m2.x,m2.y);await p.waitForTimeout(1200);
  const after=(await cloud()).near;assert.ok(before>=3&&after<=before*0.34,'particles flee the pointer: '+before+' -> '+after);

  // attract: the middle fills up
  await open(await make({touch:'attract',touchPower:1,touchRange:1}));
  {const b0=(await cloud()).near,m=await screen(0,0);await p.mouse.move(m.x+1,m.y+1);await p.mouse.move(m.x,m.y);await p.waitForTimeout(1200);const b1=(await cloud()).near;assert.ok(b1>b0*2,'particles gather at the pointer: '+b0+' -> '+b1);}

  // swirl keeps them moving and brings them back
  await open(await make({touch:'swirl'}));
  {const m=await screen(0,0);await p.mouse.move(m.x+1,m.y+1);await p.mouse.move(m.x,m.y);await p.waitForTimeout(600);
   const moved=await p.evaluate(()=>{const c=document.querySelector('[particles]').components.particles;let s=0;for(const v of c.off)s+=Math.abs(v);return s/c.off.length;});assert.ok(moved>0.003,'the swirl moves them '+moved);}

  // no touch: nothing extra, and a drag turns the view as before
  await open(await make(null));
  {const c=await cloud();assert.equal(c.off,false,'a plain layer keeps no touch state');const r0=await turn(),m=await screen(0,0);await p.mouse.move(m.x,m.y);await p.mouse.down();await p.mouse.move(m.x+60,m.y,{steps:5});await p.mouse.up();assert.notEqual(await turn(),r0,'a drag turns the view');}

  // the camera's own projection, written straight into the matrix as the AR engine does (three's stored inverse is stale then)
  await open(await make({touch:'attract'}));
  {const w=(await cloud()).w;await p.evaluate(()=>{const cam=document.querySelector('a-scene').camera;cam.projectionMatrix.makePerspective(-0.03,0.03,0.065,-0.065,0.1,100);});
   const at=await screen(w*0.3,-w*0.2);await p.mouse.move(at.x,at.y);
   const fp=await p.evaluate(()=>{const q=document.querySelector('[particles]').components.particles.fingerPoint();return q&&[q.x,q.y];});
   assert.ok(fp&&Math.abs(fp[0]-w*0.3)<w*0.01&&Math.abs(fp[1]+w*0.2)<w*0.01,'the finger lands on the right spot of the layer under a hand-written projection '+JSON.stringify(fp)+' w='+w);}

  // a real finger (touch events) on a phone: press the cloud, drag, it follows
  {const tc=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),tp=await tc.newPage(),keep=p;
   await tp.goto(base+'/index.html');await tp.waitForFunction(()=>typeof Studio!=='undefined');
   const id=await tp.evaluate(async()=>{const c=document.createElement('canvas');c.width=300;c.height=400;c.getContext('2d').fillRect(0,0,300,400);const a=Studio.blankExperience('מגע');a.target={artRect:{x:0,y:0,w:300,h:400},natural:{w:300,h:400}};a.assets.__artwork=await new Promise(r=>c.toBlob(r,'image/png'));
     a.elements=[{id:'pt',type:'particles',name:'חלקיקים',x:0,y:0,w:0.6,h:0.6,rot:0,z:0,flush:true,seq:null,particles:{preset:'sparkle',count:200,color:'#ffd94d',touch:'follow',touchPower:1}}];await Studio.save(a);return a.id;});
   await tp.goto(base+'/preview.html#'+id);await tp.reload();await tp.waitForFunction(()=>{const e=document.querySelector('[particles]');return e&&e.components&&e.components.particles&&e.components.particles.points;},null,{timeout:20000});await tp.waitForTimeout(800);
   const pts=await tp.evaluate(()=>{const c=document.querySelector('[particles]').components.particles,sc=c.el.sceneEl,r=sc.canvas.getBoundingClientRect();c.points.updateWorldMatrix(true,false);const f=(x,y)=>{const v=new THREE.Vector3(x,y,0).applyMatrix4(c.points.matrixWorld).project(sc.camera);return {x:r.left+(v.x+1)/2*r.width,y:r.top+(1-v.y)/2*r.height};};return {a:f(0,0),b:f(c.data.width*0.4,0),w:c.data.width};});
   const cdp=await tc.newCDPSession(tp),touch=(type,q)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:q?[{x:q.x,y:q.y}]:[]});
   await touch('touchStart',pts.a);for(let i=1;i<=8;i++){await touch('touchMove',{x:pts.a.x+(pts.b.x-pts.a.x)*i/8,y:pts.a.y+(pts.b.y-pts.a.y)*i/8});await tp.waitForTimeout(30);}
   await tp.waitForTimeout(1500);
   const mx=await tp.evaluate(()=>{const a=document.querySelector('[particles]').components.particles.points.geometry.attributes.position.array;let s=0;for(let i=0;i<a.length;i+=3)s+=a[i];return s/(a.length/3);});
   assert.ok(Math.abs(mx-pts.w*0.4)<pts.w*0.12,'a finger drags the cloud: '+mx+' of '+pts.w);
   if(process.env.SHOTS)await tp.screenshot({path:process.env.SHOTS+'/follow-dragged.png'});
   await touch('touchEnd');await tc.close();}

  // import refuses nonsense, takes the real thing
  const v=await p.evaluate(()=>[Studio.validParticles({particles:{touch:'follow',touchPower:0.5,touchRange:1.2,touchBack:false}}),Studio.validParticles({particles:{touch:'explode'}}),Studio.validParticles({particles:{touch:'follow',touchPower:7}}),Studio.validParticles({particles:{touchBack:'yes'}})]);
  assert.deepEqual(v,[true,false,false,false],'validation');

  // the editor: the "מגע" group
  const id=await make(null);await p.goto(base+'/index.html#/e/'+id);await p.reload();await p.waitForSelector('#editor:not([hidden])');await p.waitForTimeout(1200);
  await p.locator('.tab[data-tab="layers"]').click();await p.locator('.layer-row').first().click();await p.waitForTimeout(300);await p.locator('.tab[data-tab="style"]').click();await p.waitForTimeout(300);
  const grp=p.locator('#inspector .group',{hasText:'כשנוגעים במסך'});assert.equal(await grp.count(),1,'the touch group is there');
  await grp.scrollIntoViewIfNeeded();await p.screenshot({path:process.env.SHOTS?process.env.SHOTS+'/touch-off.png':'/dev/null'}).catch(()=>{});
  await grp.locator('select').selectOption('follow');await p.waitForTimeout(900);
  assert.equal((await p.evaluate(()=>Studio.load(App.rec.id))).elements[0].particles.touch,'follow','the choice is saved');
  const grp2=p.locator('#inspector .group',{hasText:'כשנוגעים במסך'});assert.ok(await grp2.locator('text=חוזרים למקום').count(),'more controls appear');
  await grp2.scrollIntoViewIfNeeded();if(process.env.SHOTS)await p.screenshot({path:process.env.SHOTS+'/touch-follow.png'});
  await grp2.locator('select').selectOption('none');await p.waitForTimeout(900);
  assert.equal((await p.evaluate(()=>Studio.load(App.rec.id))).elements[0].particles.touch,undefined,'and "none" clears it');
  assert.deepEqual(errs.filter(e=>!/favicon|404/.test(e)),[],'no errors');
  console.log('PASS v2-touch-particles');
}finally{await b.close();server.close();}})().catch(e=>{console.error(e);process.exit(1);});
