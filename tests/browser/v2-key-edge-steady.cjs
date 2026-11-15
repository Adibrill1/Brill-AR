const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');
// Two things a camera recording showed. (1) Colour removal left a rim of the removed colour around what stays (a video
// stores colour coarser than the picture): "ניקוי שוליים" shrinks the cut and takes the colour out of the rim; 0 is the
// old behaviour, and a layer saved before the control existed gets the default. (2) Content trembled on an artwork
// resting in the hand: the pose the AR player lays over the stock target's is steady at rest, follows a real turn and
// takes a fresh sighting as it is. Phone size. Headless Chrome with made-up tracking events; not a real camera.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});try{
  const ctx=await b.newContext({viewport:{width:375,height:812},isMobile:true,hasTouch:true});
  const p=await ctx.newPage(),errs=[];p.on('pageerror',e=>errs.push(String(e)));p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await p.goto(base+'/index.html');await p.waitForFunction(()=>typeof Studio!=='undefined'&&typeof App!=='undefined');
  // artwork: plain blue. One picture: green, a red disc, and between them a 2px dark-green rim that the plain cut keeps.
  const id=await p.evaluate(async()=>{
    const blob=(w,h,paint)=>{const c=document.createElement('canvas');c.width=w;c.height=h;paint(c.getContext('2d'));return new Promise(r=>c.toBlob(r,'image/png'));};
    const a=Studio.blankExperience('שוליים');a.target={artRect:{x:0,y:0,w:768,h:1024},natural:{w:300,h:400}};
    a.assets.__artwork=await blob(300,400,g=>{g.fillStyle='#204080';g.fillRect(0,0,300,400);});
    a.assets.pic=await blob(200,200,g=>{g.fillStyle='#00ff00';g.fillRect(0,0,200,200);g.fillStyle='#289628';g.beginPath();g.arc(100,100,52,0,7);g.fill();g.fillStyle='#ff0000';g.beginPath();g.arc(100,100,50,0,7);g.fill();});
    a.elements=[{id:'pic',type:'image',name:'עין',assetId:'pic',x:0,y:0.2,z:0,w:0.5,h:0.375,aspect:1,rot:0,flush:true,seq:null,opacity:1,chroma:{enabled:true,color:'#00ff00',threshold:0.35,soft:0}}];
    await Studio.save(a);return a.id;});
  await p.goto(base+'/index.html#/e/'+id);await p.waitForSelector('#stage-tools:not([hidden])');await p.waitForTimeout(1200);
  // the strongest green left on a line from inside the disc out past its rim (green minus the stronger of red and blue)
  const rim=()=>p.evaluate(()=>{const v=Stage.view,c=document.getElementById('preview'),k=c.width/v.cw,y=Math.round((v.my+(.5-.2)*v.H)*k),x0=Math.round((v.mx+(.5+.08)*v.W)*k),x1=Math.round((v.mx+(.5+.2)*v.W)*k);
    const d=c.getContext('2d').getImageData(x0,y,x1-x0,1).data;let m=-255;for(let i=0;i<d.length;i+=4)m=Math.max(m,d[i+1]-Math.max(d[i],d[i+2]));return m;});
  const edge=async(v)=>{await p.evaluate((v)=>{const c=App.sel().chroma;if(v==null)delete c.edge;else c.edge=v;App.changed(true);},v);await p.waitForTimeout(500);return rim();};
  await p.evaluate(()=>{App.select('pic');App.setTab('style');});await p.waitForTimeout(300);
  assert.ok(await p.locator('.ctl-label',{hasText:'ניקוי שוליים'}).count(),'the edge cleaning control is there');
  const off=await edge(0),dflt=await edge(null),full=await edge(1);
  assert.ok(off>80,'without cleaning the green rim stays, as before ('+off+')');
  assert.ok(dflt<20,'a layer from before the control gets the default, and the rim is not green any more ('+dflt+')');
  assert.ok(full<=0,'full cleaning leaves no green at all ('+full+')');
  const mid=await p.evaluate(()=>{const v=Stage.view,c=document.getElementById('preview'),k=c.width/v.cw;const d=c.getContext('2d').getImageData(Math.round((v.mx+.5*v.W)*k),Math.round((v.my+.3*v.H)*k),1,1).data;return [d[0],d[1],d[2]];});
  assert.ok(mid[0]>215&&mid[1]<40&&mid[2]<40,'the red disc itself is untouched ('+mid+')');
  // a colour with no single strong channel (white) is cut as before, with no colour shift on what stays
  const white=await p.evaluate(async()=>{const c=App.sel().chroma;c.color='#ffffff';c.edge=1;App.changed(true);await new Promise(r=>setTimeout(r,500));const v=Stage.view,cv=document.getElementById('preview'),k=cv.width/v.cw;const d=cv.getContext('2d').getImageData(Math.round((v.mx+.3*v.W)*k),Math.round((v.my+.3*v.H)*k),1,1).data;return [d[0],d[1],d[2]];});
  assert.ok(white[1]>215&&white[0]<40,'removing white leaves the green as it is ('+white+')');

  // ---- the steady pose ----
  const st=await p.evaluate(()=>{
    const T=AFRAME.THREE,scene=document.createElement('div'),o3=new T.Object3D(),target={object3D:o3,hasLoaded:true,getAttribute:()=> 'artwork'};let t=0;
    // the stock target first (it copies the raw pose), then ours
    const stock=e=>{if(e.detail.name!=='artwork')return;o3.position.copy(e.detail.position);o3.quaternion.copy(e.detail.rotation);};scene.addEventListener('xrimageupdated',stock);scene.addEventListener('xrimagefound',stock);
    Studio.steadyTarget(scene,target,{now:()=>t});
    let seed=7;const rnd=()=>{seed=(seed*1103515245+12345)&0x7fffffff;return seed/0x7fffffff-0.5;};
    const deg=Math.PI/180,q=new T.Quaternion(),e=new T.Euler();
    const send=(type,rx,ry,rz,px)=>{q.setFromEuler(e.set(rx,ry,rz));scene.dispatchEvent(new CustomEvent(type,{detail:{name:'artwork',position:{x:px||0,y:0,z:-1},rotation:{x:q.x,y:q.y,z:q.z,w:q.w},scale:1}}));};
    const out={};
    // at rest: every frame tilts up to 3 degrees off, each a different way
    const base=new T.Quaternion().setFromEuler(new T.Euler(0.3,0.2,0));let raw=0,held=0;
    send('xrimagefound',0.3,0.2,0);
    for(let i=0;i<120;i++){t+=1/30;send('xrimageupdated',0.3+rnd()*6*deg,0.2+rnd()*6*deg,rnd()*6*deg);if(i>30){raw=Math.max(raw,q.angleTo(base));held=Math.max(held,o3.quaternion.angleTo(base));}}
    out.raw=raw/deg;out.held=held/deg;
    // another artwork's events are not ours
    const keep=o3.quaternion.clone();scene.dispatchEvent(new CustomEvent('xrimageupdated',{detail:{name:'other',position:{x:5,y:5,z:5},rotation:{x:1,y:0,z:0,w:0},scale:1}}));out.other=o3.quaternion.angleTo(keep);
    // a slow real turn: 20 degrees a second for a second
    let rs=0.2;for(let i=0;i<30;i++){t+=1/30;rs+=(2/3)*deg;send('xrimageupdated',0.3,rs,0);}
    out.slow=o3.quaternion.angleTo(q)/deg;for(let i=0;i<30;i++){t+=1/30;send('xrimageupdated',0.3,0.2,0);}
    // a real turn: 60 degrees a second for a second
    let ry=0.2;for(let i=0;i<30;i++){t+=1/30;ry+=2*deg;send('xrimageupdated',0.3,ry,0);}
    out.lag=o3.quaternion.angleTo(q)/deg;
    // a real move sideways, a quarter of the distance in half a second
    let px=0;for(let i=0;i<15;i++){t+=1/30;px+=0.25/15;send('xrimageupdated',0.3,ry,0,px);}
    out.behind=Math.abs(o3.position.x-px);
    // lost, then found somewhere else: taken as it is
    scene.dispatchEvent(new CustomEvent('xrimagelost',{detail:{name:'artwork'}}));t+=1;send('xrimagefound',-0.5,-0.4,0.3,-0.2);
    out.snap=o3.quaternion.angleTo(q)/deg;out.snapX=o3.position.x;
    return out;});
  assert.ok(st.raw>2.5,'the made-up tracking really trembles ('+st.raw.toFixed(2)+' degrees)');
  assert.ok(st.held<st.raw*0.5,'at rest the content sways far less than the raw tracking ('+st.held.toFixed(2)+' of '+st.raw.toFixed(2)+' degrees)');
  assert.equal(st.other,0,'another artwork\'s tracking is ignored');
  assert.ok(st.slow<4,'a slow turn is followed too ('+st.slow.toFixed(2)+' degrees behind at 20 a second)');
  assert.ok(st.lag<5,'a real turn is followed closely ('+st.lag.toFixed(2)+' degrees behind at 60 a second)');
  assert.ok(st.behind<0.02,'a real move is followed closely ('+st.behind.toFixed(4)+')');
  assert.ok(st.snap<0.001&&Math.abs(st.snapX+0.2)<1e-6,'a fresh sighting is taken as it is');
  assert.deepEqual(errs.filter(e=>!/favicon|404/.test(e)),[],'no errors');
  console.log('v2-key-edge-steady ok',JSON.stringify(st));
}finally{await b.close();server.close();}})().catch(e=>{console.error(e);process.exit(1);});
