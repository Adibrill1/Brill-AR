const {chromium}=require('playwright-core'),assert=require('node:assert/strict');const server=require('../../server/server');
// Two fingers that both start on an item (give or take 20px) resize it, in the flat 2D view and in the 3D view: spreading to twice the distance
// doubles the item (a keyed item gets the size as a scale key at the playhead), the view zoom/camera stays put, and the
// change is saved. Two fingers that start on empty space still zoom the view (editor-pinch-zoom). Headless Chrome with
// CDP touch events; not an iPhone.
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,b=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-webgl']});try{
const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const p=await ctx.newPage();const pageErrors=[];p.on('pageerror',e=>pageErrors.push(String(e)));
await p.goto(base+'/index.html');await p.waitForFunction(()=>document.querySelector('#exp-select').options.length>0);await p.waitForTimeout(800);
const id=await p.evaluate(async()=>{const r=Studio.blankExperience('pinch-resize');r.target={artRect:{x:0,y:0,w:768,h:768},natural:{w:768,h:768}};const c=document.createElement('canvas');c.width=c.height=768;const g=c.getContext('2d');g.fillStyle='#ffffff';g.fillRect(0,0,768,768);r.assets.__artwork=await new Promise(res=>c.toBlob(res));
  const K={loop:false,keys:[{t:0,x:-.22,y:-.08,z:0,rot:0,opacity:1,scale:1,tap:'none'},{t:2,x:-.22,y:-.08,z:0,rot:0,opacity:1,scale:1,tap:'none'}]};
  r.elements=[{id:'big',name:'BIG',type:'text',text:'BIG',color:'#ff0000',x:0,y:.15,w:.2,rot:0},{id:'kd',name:'KD',type:'text',text:'KD',color:'#aa00aa',x:-.22,y:-.08,w:.2,rot:0,timeline:K}];r.elements.forEach(Studio.normEl);
  await Studio.save(r);const o=document.createElement('option');o.value=r.id;o.textContent=r.name;document.querySelector('#exp-select').append(o);return r.id;});
await p.locator('#exp-select').selectOption(id);await p.waitForFunction(()=>parseFloat(document.querySelector('#preview').style.height)>300,{timeout:10000});
await p.locator('#canvas-wrap').scrollIntoViewIfNeeded();await p.waitForTimeout(500);
const ses=await ctx.newCDPSession(p);
// finger 1 on (x,y), finger 2 d0 px to its right; finger 2 moves out (or in) to d1
const pinch=async(x,y,d0,d1)=>{const T=(d)=>[{x,y,id:1},{x:x+d,y,id:2}];
  await ses.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:T(d0)});
  for(let i=1;i<=6;i++){await ses.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:T(d0+(d1-d0)*i/6)});await p.waitForTimeout(30);}
  await ses.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await p.waitForTimeout(900);};
const saved=()=>p.evaluate(async id=>(await Studio.load(id)).elements.map(e=>({id:e.id,w:e.w,keys:e.timeline&&e.timeline.keys.map(k=>({t:k.t,scale:k.scale}))})),id);
// 2D: the item's centre on screen, from the artwork mapping (square artwork centred in the 3:4 frame)
const at2d=(ex,ey)=>p.evaluate(([ex,ey])=>{const c=document.querySelector('#preview'),r=c.getBoundingClientRect(),s=Math.min(r.width/768*1,r.height/1024)*768;return {x:r.left+r.width/2+ex*s,y:r.top+r.height/2-ey*s};},[ex,ey]);
const pick=async(name)=>{await p.evaluate(n=>[...document.querySelectorAll('#element-list li')].find(l=>l.textContent.includes(n)).click(),name);await p.waitForTimeout(400);};
await pick('BIG');let c=await at2d(0,.15);
await pinch(c.x,c.y,30,60);
let s=await saved();assert.ok(Math.abs(s[0].w-.4)<.04,'2D: a spread from 30px to 60px on the item doubles it: '+JSON.stringify(s[0]));
await pinch(c.x,c.y,30,15);
s=await saved();assert.ok(Math.abs(s[0].w-.2)<.03,'2D: pinching back halves it: '+JSON.stringify(s[0]));
// 2D keyed item: the size lands as a scale key at the playhead, base width unchanged
await pick('KD');c=await at2d(-.22,-.08); // clear of the 3D/2D switch at the bottom centre
await pinch(c.x,c.y,30,45);
s=await saved();assert.equal(s[1].w,.2,'2D keyed: base width unchanged');assert.ok(s[1].keys.some(k=>Math.abs(k.scale-1.5)<.12),'2D keyed: a scale key ~1.5 at the playhead: '+JSON.stringify(s[1]));
// 3D: the same gesture on the selected item resizes it; the camera does not move
await p.click('#btn-3d');await p.waitForFunction(()=>Editor3D.isActive()&&document.querySelector('[data-el-root="big"]'),null,{timeout:20000});await p.waitForTimeout(900);
await pick('BIG');
const at3d=(eid)=>p.evaluate(eid=>{const sc=Editor3D._test.scene(),n=document.querySelector('[data-el-root="'+eid+'"]').object3D,v=new THREE.Vector3();sc.object3D.updateMatrixWorld(true);n.getWorldPosition(v);v.project(sc.camera);const r=sc.canvas.getBoundingClientRect();return {x:r.left+(v.x+1)/2*r.width,y:r.top+(1-v.y)/2*r.height,camZ:sc.camera.el.getAttribute('position').z};},eid);
c=await at3d('big');const w0=(await saved())[0].w;
await pinch(c.x-15,c.y,30,60);
s=await saved();const c2=await at3d('big');
assert.ok(Math.abs(s[0].w-w0*2)<.05,'3D: a spread to twice the distance on the item doubles it: '+w0+' -> '+s[0].w);
assert.equal(c2.camZ,c.camZ,'3D: the camera stays put');
const drawn=await p.evaluate(()=>document.querySelector('[data-el-root="big"]').object3D.scale.x);assert.ok(Math.abs(drawn-1)<.01,'3D: after the lift the size is in the item, not a leftover scale: '+drawn);
// 3D on empty space: camera zoom, item untouched
// a spot where both fingers reach the 3D canvas (not a button) and stay off the item
const spot=await p.evaluate(()=>{const cv=Editor3D._test.scene().canvas,r=cv.getBoundingClientRect(),n=document.querySelector('[data-el-root="big"]').object3D,sc=Editor3D._test.scene();sc.object3D.updateMatrixWorld(true);const bx=new THREE.Box3().setFromObject(n);let l=1e9,rr=-1e9,t=1e9,bb=-1e9;for(let i=0;i<8;i++){const v=new THREE.Vector3(i&1?bx.max.x:bx.min.x,i&2?bx.max.y:bx.min.y,i&4?bx.max.z:bx.min.z).project(sc.camera);const x=r.left+(v.x+1)/2*r.width,y=r.top+(1-v.y)/2*r.height;l=Math.min(l,x);rr=Math.max(rr,x);t=Math.min(t,y);bb=Math.max(bb,y);}
  for(const fy of [.55,.65,.75,.45,.35,.25])for(const fx of [.1,.2,.3,.4,.5]){const x=r.left+r.width*fx,y=r.top+r.height*fy,ok=[x,x+40].every(px=>document.elementFromPoint(px,y)===cv&&!(px>l-30&&px<rr+30&&y>t-30&&y<bb+30));if(ok)return {x,y};}return null;});
assert.ok(spot,'found an empty spot on the 3D canvas');await pinch(spot.x,spot.y,40,90);
s=await saved();assert.ok(Math.abs(s[0].w-w0*2)<.05,'3D: a pinch on empty space leaves the item alone');
assert.ok((await at3d('big')).camZ<c.camZ,'3D: a spread on empty space moves the camera closer');
assert.deepEqual(pageErrors,[],'no page errors');
console.log('PASS editor-pinch-resize: two fingers on an item resize it (2D, 2D keyed as a scale key, 3D) and save; on empty space the 3D pinch moves the camera');
}finally{await b.close();server.close();}})().catch(e=>{console.error(e&&e.stack||e);process.exit(1)});
